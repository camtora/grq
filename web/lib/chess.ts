import { prisma } from "./db";
import { computeHeat } from "./heat";
import { fmpLogo } from "./logos";
import { getQuotes } from "./broker/quotes";
import { getCloses, refreshBars } from "./bars";
import { trackedUniverse, yahooForListing, isCadTradeable, type UniverseRow } from "./universe";
import { bareChainKey, parseBoard, type ChessBoardData, type BoardTrend } from "./chess-board";

// Chess Moves (docs/CHESS-MOVES.md) — the view/helper layer for the thematic /
// supply-chain experiment. The agent writes the board (ChessTheme) + ranked pieces
// (ChessPlay); this resolves each play into something renderable — heat, 30-day
// momentum, logo, Alfred's call when we cover it — reusing the exact data path The Hunt
// uses (getCloses + getQuotes + computeHeat). Pure read/derive; never trades.

// The board MAP types + pure helpers (bareChainKey, parseBoard, the range math) live in
// the client-safe ./chess-board module so the client <ChessBoard> can share them; we
// re-export here so existing `from "@/lib/chess"` imports are unchanged.
export {
  bareChainKey,
  parseBoard,
  sliceBoardRange,
  BOARD_RANGES,
  type BoardItem,
  type BoardStage,
  type BoardLink,
  type ChessBoardData,
  type BoardTrend,
  type TrendPoint,
  type BoardRangeKey,
} from "./chess-board";

// ---- Resolved plays for the page ----

export type PlayDirection = "BENEFICIARY" | "VICTIM" | "NEUTRAL";

export type ChessPlayView = {
  id: number;
  sym: string; // bare ticker
  listing: string; // resolved listing used for quote/logo
  href: string; // stock-page link
  name: string;
  role: string;
  direction: PlayDirection;
  effectOrder: number; // 1/2/3-order
  thesis: string;
  conviction: number | null;
  obscurity: number | null;
  exchange: string | null;
  tag: string | null; // "NASDAQ · Semiconductors"
  logoUrl: string | null;
  currency: string | null;
  cur: number | null; // current price, cents
  change30d: number | null;
  spark: number[];
  heat: number;
  tracked: boolean; // a universe member (has its own dossier flow)
  stance: string | null; // GRQ's 7-point call, when we cover it
  rank: number;
};

type PlayRow = {
  id: number;
  symbol: string;
  yahoo: string | null;
  exchange: string | null;
  companyName: string | null;
  role: string;
  direction: string;
  effectOrder: number;
  thesis: string;
  conviction: number;
  obscurity: number | null;
};

// ---- "This stock is in play on these boards" (stock-page cross-reference) ----

export type ChessBoardRef = {
  themeId: number;
  title: string;
  anchor: string;
  kind: string; // BRIEF | WEEKLY
  completedAt: Date | null;
  role: string; // the piece's role on that board
  direction: PlayDirection; // BENEFICIARY | VICTIM | NEUTRAL
  effectOrder: number; // 1/2/3-order
  thesis: string; // the one-line why it moves on that board
  conviction: number | null;
  mentionedOnly: boolean; // appears in the board MAP but isn't a ranked play (e.g. the anchor/foundry)
  board: ChessBoardData; // the full chain map → rendered inline on the stock page, this name highlighted
};

/** Every READY Chess board this symbol appears on — as a ranked *play* OR just mentioned in the
 *  board map (a stage item or a flow link). Cam 2026-06-29: "surface if the stock is mentioned",
 *  so a name that's the board's subject (e.g. TSMC on the packaging board) shows even when it
 *  isn't one of the ripple plays. A name can be on more than one board — we surface them all.
 *  Matched on the bare ticker so a `.TO`/`.US` listing still joins. Read-only — a board is a
 *  lead, never a trade. */
export async function chessRefsForSymbol(symbol: string): Promise<ChessBoardRef[]> {
  const bare = bareChainKey(symbol);
  const themes = await prisma.chessTheme.findMany({
    where: { status: "READY" },
    orderBy: { completedAt: "desc" },
    select: {
      id: true,
      title: true,
      anchor: true,
      kind: true,
      completedAt: true,
      boardJson: true,
      plays: {
        orderBy: [{ conviction: "desc" }, { rank: "asc" }],
        select: { symbol: true, role: true, direction: true, effectOrder: true, thesis: true, conviction: true },
      },
    },
  });

  const refs: ChessBoardRef[] = [];
  for (const t of themes) {
    const board = parseBoard(t.boardJson);
    const base = { themeId: t.id, title: t.title, anchor: t.anchor, kind: t.kind, completedAt: t.completedAt, board };
    // 1) A ranked play on this board → carry its role/direction/effect-order.
    const play = t.plays.find((p) => bareChainKey(p.symbol) === bare);
    if (play) {
      refs.push({
        ...base,
        role: play.role,
        direction: asDirection(play.direction),
        effectOrder: play.effectOrder,
        thesis: play.thesis,
        conviction: play.conviction || null,
        mentionedOnly: false,
      });
      continue;
    }
    // 2) Otherwise, mentioned in the board MAP (a stage item's ticker, or a flow link).
    const inMap =
      board.stages.some((st) => st.items.some((it) => it.symbol && bareChainKey(it.symbol) === bare)) ||
      board.links.some((l) => bareChainKey(l.from) === bare || bareChainKey(l.to) === bare);
    if (inMap) {
      refs.push({ ...base, role: "on the board", direction: "NEUTRAL", effectOrder: 0, thesis: "", conviction: null, mentionedOnly: true });
    }
  }
  return refs;
}

const asDirection = (d: string): PlayDirection => (d === "VICTIM" || d === "NEUTRAL" ? d : "BENEFICIARY");

/** Resolve ChessPlay rows into renderable views — heat-ranked, with momentum, logo,
 *  and Alfred's call where we cover the name. Mirrors The Hunt's find-assembly so the
 *  same gauges/sparklines render. */
export async function buildPlayViews(plays: PlayRow[]): Promise<ChessPlayView[]> {
  if (plays.length === 0) return [];

  const tracked = await trackedUniverse();
  const uBy = new Map<string, UniverseRow>(tracked.map((r) => [bareChainKey(r.yahoo), r]));

  const resolved = plays.map((p) => {
    const bare = bareChainKey(p.symbol);
    const u = uBy.get(bare) ?? null;
    const listing = u ? u.symbol : p.yahoo || yahooForListing(p.symbol, p.exchange);
    return { p, bare, u, listing };
  });

  const listings = Array.from(new Set(resolved.map((r) => r.listing)));
  const quotes = await getQuotes(listings);
  const closesByListing = new Map<string, { date: Date; closeCents: number }[]>();
  await Promise.all(listings.map(async (s) => closesByListing.set(s, await getCloses(s, 40))));
  const missing = listings.filter((s) => (closesByListing.get(s)?.length ?? 0) < 8);
  if (missing.length) {
    await refreshBars(missing, "3mo").catch(() => 0);
    await Promise.all(missing.map(async (s) => closesByListing.set(s, await getCloses(s, 40))));
  }

  // Alfred's call for the tracked plays (latest stance per symbol) — one bounded query.
  const trackedSyms = resolved.map((r) => r.u?.symbol).filter((s): s is string => !!s);
  const stanceBy = new Map<string, string>();
  if (trackedSyms.length) {
    const rows = await prisma.journalEntry
      .findMany({ where: { stance: { not: null }, symbol: { in: trackedSyms } }, orderBy: { at: "desc" }, select: { symbol: true, stance: true } })
      .catch(() => []);
    for (const s of rows) if (s.symbol && !stanceBy.has(s.symbol)) stanceBy.set(s.symbol, s.stance as string);
  }

  const views: ChessPlayView[] = resolved.map(({ p, bare, u, listing }) => {
    const q = quotes.get(listing);
    const spark = (closesByListing.get(listing) ?? []).slice(-30).map((c) => c.closeCents);
    const change30d =
      spark.length >= 2 && spark[0] > 0 ? (spark[spark.length - 1] - spark[0]) / spark[0] : q ? (q.dayChangeBps ?? 0) / 10_000 : null;
    return {
      id: p.id,
      sym: bare,
      listing,
      href: `/stocks/${encodeURIComponent(u?.symbol ?? bare)}`,
      name: p.companyName ?? u?.name ?? bare,
      role: p.role,
      direction: asDirection(p.direction),
      effectOrder: p.effectOrder,
      thesis: p.thesis,
      conviction: p.conviction ?? null,
      obscurity: p.obscurity ?? null,
      exchange: u?.exchange ?? p.exchange ?? null,
      tag: [u?.exchange ?? p.exchange, u?.sector].filter(Boolean).join(" · ") || null,
      logoUrl: u?.logoUrl || fmpLogo(listing),
      // Tracked currency if we have it, else infer from the listing suffix (CAD venues vs US).
      currency: u?.currency ?? (isCadTradeable(null, listing) ? "CAD" : "USD"),
      cur: q?.midCents ?? null,
      change30d,
      spark,
      heat: computeHeat({ confidence: p.conviction ?? null, change30d, obscurity: p.obscurity ?? null }),
      tracked: !!u,
      stance: u ? stanceBy.get(u.symbol) ?? null : null,
      rank: 0,
    };
  });

  views.sort((a, b) => b.heat - a.heat);
  views.forEach((v, i) => (v.rank = i + 1));
  return views;
}

// ---- Per-piece price tape for the board MAP (the chain visualization) ----

/** The price series for every company in the board MAP that carries a ticker — so the chain view can
 *  render a small price tape per piece with a shared 1D…1Y range toggle (sliced client-side in
 *  <ChessBoard>, like the stock page's PriceChart). Keyed by bare ticker. Reuses the same data path
 *  The Hunt / buildPlayViews use (getCloses + getQuotes). We pull ~1y of daily closes (backfilling
 *  "1y" for names we've never charted, < 8 closes), TOP UP any piece that's fallen behind the freshest
 *  name (uncovered pieces aren't in the nightly bars job), and APPEND today's live quote as the final
 *  point — so the default 1D view shows how each name is doing TODAY at a glance, and the longer ranges
 *  read as-of-now. One batched getQuotes call, no per-name intraday fetch. A private/foreign piece with
 *  no listed bars is simply absent (no tape). Pure read/derive — a board is Alfred's reasoning, never a
 *  trade. */
export async function buildBoardTrends(board: ChessBoardData): Promise<Map<string, BoardTrend>> {
  // Distinct board-item tickers (the flow-links reuse these same symbols).
  const bySym = new Map<string, string>(); // bareKey → first raw symbol seen
  for (const st of board.stages) {
    for (const it of st.items) {
      if (!it.symbol) continue;
      const k = bareChainKey(it.symbol);
      if (!bySym.has(k)) bySym.set(k, it.symbol);
    }
  }
  if (bySym.size === 0) return new Map();

  // Resolve each ticker to the listing we price/chart it on: our tracked symbol when we cover it,
  // else the inferred Yahoo listing (toYahoo no longer mangles bare/US tickers — D45).
  const tracked = await trackedUniverse();
  const uBy = new Map<string, UniverseRow>(tracked.map((r) => [bareChainKey(r.yahoo), r]));
  const resolved = Array.from(bySym.entries()).map(([k, raw]) => ({ k, listing: uBy.get(k)?.symbol ?? yahooForListing(raw) }));

  const listings = Array.from(new Set(resolved.map((r) => r.listing)));
  // ~1y of daily closes so the 1D…1Y toggle can slice locally. Backfill "1y" only for names we've
  // never charted (< 8 closes) — a single call grabs the whole window; covered names already have it.
  const closesByListing = new Map<string, { date: Date; closeCents: number }[]>();
  await Promise.all(listings.map(async (s) => closesByListing.set(s, await getCloses(s, 300))));
  const missing = listings.filter((s) => (closesByListing.get(s)?.length ?? 0) < 8);
  if (missing.length) {
    await refreshBars(missing, "1y").catch(() => 0);
    await Promise.all(missing.map(async (s) => closesByListing.set(s, await getCloses(s, 300))));
  }

  // Freshen STALE pieces (Cam 2026-07-02): board names we don't track aren't in the nightly bars
  // job, so an uncovered piece backfilled once can sit days behind — which would make its "1D"
  // tape the move on some old date, not yesterday. Top up any listing whose newest close trails
  // the freshest name on the board with a cheap "5d" fetch, so every series ends at the last close.
  const newestMs = (s: string) => { const r = closesByListing.get(s); return r?.length ? r[r.length - 1].date.getTime() : 0; };
  const freshest = Math.max(0, ...listings.map(newestMs));
  const stale = listings.filter((s) => { const r = closesByListing.get(s); return !!r && r.length >= 8 && newestMs(s) < freshest; });
  if (stale.length) {
    await refreshBars(stale, "5d").catch(() => 0);
    await Promise.all(stale.map(async (s) => closesByListing.set(s, await getCloses(s, 300))));
  }

  // Live quotes so the DEFAULT 1D view shows how each name is doing TODAY at a glance — not the
  // last completed session. We append today's live price to the series as its final point (when
  // today's daily bar isn't stored yet), so 1D = today's move and the longer ranges are as-of-now.
  // One batched getQuotes call (the same feed buildPlayViews uses) — no per-name intraday fetch.
  const quotes = await getQuotes(listings);
  const nowMs = Date.now();
  const todayEt = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }); // YYYY-MM-DD
  const barDay = (d: Date) => d.toISOString().slice(0, 10); // bars are the ET day at UTC midnight

  const out = new Map<string, BoardTrend>();
  for (const { k, listing } of resolved) {
    const rows = closesByListing.get(listing) ?? [];
    if (rows.length < 2) continue; // no usable history → no tape
    const series = rows.map((r) => ({ t: r.date.getTime(), c: r.closeCents }));
    const q = quotes.get(listing);
    // Append the live price as "now" so the longer ranges reflect today — but only if today's close
    // isn't already stored (else we'd double-count it and today would read ~0%).
    const live = q?.midCents;
    if (live != null && live > 0 && barDay(rows[rows.length - 1].date) !== todayEt) {
      series.push({ t: nowMs, c: live });
    }
    // todayBps = the quote's authoritative move since the prior session's close — 1D uses this so it
    // means "since yesterday's close" exactly, unaffected by a missing/holiday-gapped daily bar.
    out.set(k, { series, todayBps: q?.dayChangeBps ?? null });
  }
  return out;
}
