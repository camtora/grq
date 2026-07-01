import { prisma } from "./db";
import { computeHeat } from "./heat";
import { fmpLogo } from "./logos";
import { getQuotes } from "./broker/quotes";
import { getCloses, refreshBars } from "./bars";
import { trackedUniverse, yahooForListing, isCadTradeable, type UniverseRow } from "./universe";

// Chess Moves (docs/CHESS-MOVES.md) — the view/helper layer for the thematic /
// supply-chain experiment. The agent writes the board (ChessTheme) + ranked pieces
// (ChessPlay); this resolves each play into something renderable — heat, 30-day
// momentum, logo, Alfred's call when we cover it — reusing the exact data path The Hunt
// uses (getCloses + getQuotes + computeHeat). Pure read/derive; never trades.

// Bare-ticker key, stripping CA venues AND ".US" — same canonical key the knowledge
// graph uses (lib/graph/related.ts), so plays join tracked names + persisted edges.
export const bareChainKey = (s: string) => s.trim().toUpperCase().replace(/\.(TO|V|NE|CN|US)$/i, "");

// ---- The board (chain map) the agent writes as boardJson on ChessTheme ----

export type BoardItem = { symbol?: string; name: string; note?: string };
export type BoardStage = { key?: string; label: string; role?: string; items: BoardItem[] };
export type BoardLink = { from: string; to: string; label?: string };
export type ChessBoardData = { stages: BoardStage[]; links: BoardLink[] };

/** Tolerant parse of boardJson — never throws, drops malformed bits. */
export function parseBoard(json: string | null | undefined): ChessBoardData {
  const empty: ChessBoardData = { stages: [], links: [] };
  if (!json) return empty;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return empty;
  }
  if (!raw || typeof raw !== "object") return empty;
  const o = raw as { stages?: unknown; links?: unknown };
  const stages: BoardStage[] = Array.isArray(o.stages)
    ? o.stages
        .filter((s): s is Record<string, unknown> => !!s && typeof s === "object" && typeof (s as { label?: unknown }).label === "string")
        .map((s) => ({
          key: typeof s.key === "string" ? s.key : undefined,
          label: String(s.label).trim(),
          role: typeof s.role === "string" ? s.role.trim() : undefined,
          items: Array.isArray(s.items)
            ? (s.items as unknown[])
                .filter((i): i is Record<string, unknown> => !!i && typeof i === "object" && typeof (i as { name?: unknown }).name === "string")
                .map((i) => ({
                  symbol: typeof i.symbol === "string" ? i.symbol.trim().toUpperCase() : undefined,
                  name: String(i.name).trim(),
                  note: typeof i.note === "string" ? i.note.trim() : undefined,
                }))
            : [],
        }))
    : [];
  const links: BoardLink[] = Array.isArray(o.links)
    ? o.links
        .filter((l): l is Record<string, unknown> => !!l && typeof l === "object" && typeof (l as { from?: unknown }).from === "string" && typeof (l as { to?: unknown }).to === "string")
        .map((l) => ({ from: String(l.from).trim(), to: String(l.to).trim(), label: typeof l.label === "string" ? l.label.trim() : undefined }))
    : [];
  return { stages, links };
}

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

// ---- Per-piece 30-day trend for the board MAP (the chain visualization) ----

export type BoardTrend = { change30d: number | null; spark: number[] };

/** A 30-day price trend (sparkline + % change) for every company in the board MAP that carries a
 *  ticker — so the chain view shows, at a glance, which pieces are rising vs falling. Keyed by bare
 *  ticker. Reuses the exact data path The Hunt / buildPlayViews use (getCloses → refreshBars for gaps
 *  → the trailing 30-close window), so a board piece and the same name as a ranked play read the same.
 *  A private/foreign/uncovered piece with no listed bars is simply absent (no indicator). Pure
 *  read/derive — a board is Alfred's reasoning, never a trade. */
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
  const closesByListing = new Map<string, { date: Date; closeCents: number }[]>();
  await Promise.all(listings.map(async (s) => closesByListing.set(s, await getCloses(s, 40))));
  const missing = listings.filter((s) => (closesByListing.get(s)?.length ?? 0) < 8);
  if (missing.length) {
    await refreshBars(missing, "3mo").catch(() => 0);
    await Promise.all(missing.map(async (s) => closesByListing.set(s, await getCloses(s, 40))));
  }

  const out = new Map<string, BoardTrend>();
  for (const { k, listing } of resolved) {
    const spark = (closesByListing.get(listing) ?? []).slice(-30).map((c) => c.closeCents);
    if (spark.length < 2 || spark[0] <= 0) continue; // no usable history → no indicator
    out.set(k, { change30d: (spark[spark.length - 1] - spark[0]) / spark[0], spark });
  }
  return out;
}
