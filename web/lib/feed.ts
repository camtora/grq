import { prisma } from "./db";
import type { Session } from "./session";
import { getPortfolio } from "./portfolio";
import { getQuotes, getQuote } from "./broker/quotes";
import { allUniverse, type UniverseRow } from "./universe";
import { computeSignals, overallSignal } from "@/agent/signals";
import { DIALS } from "@/agent/policy";
import { etParts, etDateStr, isMarketDay, startOfEtDay } from "@/agent/calendar";
import { fmpEnabled, fmpAnalystTarget, fmpIndices, fmpPeerComparison, fmpNews, fmpStockNews } from "./fmp";
import { GLOSSARY } from "./glossary";
import { personByName, ownerKeyFor } from "./people";
import { userForEmail } from "./users";
import { stanceMeta } from "./stance";
import { getCloses, refreshBars } from "./bars";
import { computeHeat } from "./heat";
import { fmpLogo } from "./logos";
import {
  getPortfolios,
  getCongressLeaderboard,
  getFundsPilingIn,
  getInsiderTopBuys,
  getInsiderClusters,
  getSmartMoneyFreshness,
} from "./smart-money/queries";
import { fmtUsd } from "./smart-money/types";

// Builders that produce the exact shared/contract.ts shapes for the mobile app
// (docs/IOS-PLAN.md). Same Prisma source the web server components read, so the
// app sees the same universe, the same NAV, the same calls — no separate truth.
// Money stays integer cents; rates are bps; dates are ISO strings on the wire.

type AgentCall = "buy" | "accumulate" | "hold" | "watch" | "trim" | "avoid" | "sell";
type ContractDirective = "pin" | "no_fly";
type Edition = "morning" | "midday" | "evening" | "weekend";

export type ContractSignals = {
  recommendationPct: number;
  trend: string;
  rsi: number | null;
  macd: string | null;
};

const STANCE_TO_CALL: Record<string, AgentCall> = {
  BUY: "buy",
  ACCUMULATE: "accumulate",
  HOLD: "hold",
  WATCH: "watch",
  TRIM: "trim",
  AVOID: "avoid",
  SELL: "sell",
};

function stanceToCall(stance: string | null | undefined): AgentCall | null {
  if (!stance) return null;
  return STANCE_TO_CALL[stance.toUpperCase()] ?? null;
}

function directiveToContract(d: "PINNED" | "BLOCKED" | string | null | undefined): ContractDirective | null {
  if (d === "PINNED") return "pin";
  if (d === "BLOCKED") return "no_fly";
  return null;
}

// GRQ's call as the 7-point rating object (mirrors lib/stance.ts `stanceMeta`) — the
// shape the app's RatingBar renders. Accepts either the new 7-point label or a legacy
// call word; null when unrated (A6).
type ContractRating = { label: string; abbr: string; tone: string; pos: number; blurb: string };
function ratingFor(stance: string | null | undefined): ContractRating | null {
  const m = stanceMeta(stance);
  return m ? { label: m.label, abbr: m.abbr, tone: m.tone, pos: m.pos, blurb: m.blurb } : null;
}

// Universe status → the app's "watch" state (none | watching | universe).
function watchFor(status: string | null | undefined): "none" | "watching" | "universe" {
  return status === "ACTIVE" ? "universe" : status === "CANDIDATE" ? "watching" : "none";
}

const HOUSEHOLD = new Set(["RY", "TD", "BNS", "BMO", "CM", "NA", "ENB", "SHOP", "CNR", "CP", "BCE", "T", "SU", "CNQ", "XIC", "XIU", "BN", "ATD", "CSU"]);

/** Map the agent's deterministic signal families → the compact contract shape. */
export async function contractSignals(symbol: string): Promise<ContractSignals | null> {
  const s = await computeSignals(symbol).catch(() => null);
  if (!s) return null;
  const fam = (f: string) => s.families.find((x) => x.family === f);
  const trendF = fam("trend");
  const rsiF = fam("rsi");
  const macdF = fam("macd");
  const rsiMatch = rsiF ? /RSI\(14\)\s*=\s*(\d+)/.exec(rsiF.rationale) : null;
  const rsiVal = rsiMatch ? Number(rsiMatch[1]) : NaN;
  return {
    recommendationPct: overallSignal(s).confidence,
    trend: trendF ? (trendF.signal === "BUY" ? "uptrend" : trendF.signal === "SELL" ? "downtrend" : "mixed") : "mixed",
    rsi: Number.isFinite(rsiVal) ? rsiVal : null,
    macd: macdF ? (macdF.signal === "BUY" ? "rising" : macdF.signal === "SELL" ? "falling" : "flat") : null,
  };
}

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

/* ---------- /api/auth/me ---------- */
export async function meResponse(session: Session) {
  const pf = await getPortfolio();
  return {
    email: session.email,
    name: session.user?.name ?? null,
    role: session.role,
    theme: session.user?.theme ?? "light",
    totalPnlCents: pf.totalPnlCents,
    contributionsCents: pf.contributionsCents,
  };
}

/* ---------- /api/portfolio ---------- */
export async function portfolioResponse() {
  const [pf, all] = await Promise.all([getPortfolio(), allUniverse()]);
  const logoBy = new Map(all.map((u) => [u.symbol, u.logoUrl]));
  return {
    cashCents: pf.cashCents,
    positions: pf.positions.map((p) => ({
      symbol: p.symbol,
      qty: p.qty,
      avgCostCents: p.avgCostCents,
      lastCents: p.lastCents,
      marketValueCents: p.marketValueCents,
      unrealizedPnlCents: p.unrealizedPnlCents,
      dayChangeBps: p.dayChangeBps,
      openedAt: p.openedAt.toISOString(),
      logoUrl: logoBy.get(p.symbol) ?? null,
    })),
    positionsCents: pf.positionsCents,
    navCents: pf.navCents,
    contributionsCents: pf.contributionsCents,
    totalPnlCents: pf.totalPnlCents,
    benchmarkCents: pf.benchmarkCents,
    feeSpentMonthCents: pf.feeSpentMonthCents,
    feeBudgetCentsMonth: pf.feeBudgetCentsMonth,
    riskLevel: pf.riskLevel,
    killSwitch: pf.killSwitch,
    killSwitchBy: pf.killSwitchBy,
    quotesAsOf: iso(pf.quotesAsOf),
  };
}

/* ---------- /api/settings ---------- */
export async function settingsResponse() {
  const [settings, fees] = await Promise.all([
    prisma.settings.findUnique({ where: { id: 1 } }),
    (async () => {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      return prisma.trade.aggregate({ where: { at: { gte: monthStart } }, _sum: { commissionCents: true } });
    })(),
  ]);
  const risk = settings?.riskLevel ?? "BALANCED";
  const dial = DIALS[risk];
  return {
    riskLevel: risk,
    cashFloorBps: dial.cashFloorPct * 100,
    maxPositionBps: dial.maxPositionPct * 100,
    stopLossBps: dial.stopPct * 100,
    takeProfitBps: dial.takeProfitPct * 100,
    feeBudgetCentsMonth: settings?.feeBudgetCentsMonth ?? 2000,
    feeSpentMonthCents: fees._sum.commissionCents ?? 0,
    killSwitch: settings?.killSwitch ?? false,
    killSwitchBy: settings?.killSwitchBy ?? null,
    // Soak gate (PROJECT_PLAN §9): ≥4 clean weeks total (28d), ≥2 on IBKR paper
    // (14d). v0 — paper hasn't started, so the clean counts are best-effort and
    // the app frames them as "in progress". Wire to a real soak tracker later.
    soakDaysClean: await soakDaysClean(),
    soakDaysRequired: 28,
    soakPaperDaysClean: 0,
    soakPaperDaysRequired: 14,
  };
}

/** Distinct calendar days with a NAV snapshot since the configured soak start —
 *  a best-effort "days running clean on the sim" until a real tracker lands. */
async function soakDaysClean(): Promise<number> {
  const start = process.env.GRQ_SOAK_START ? new Date(process.env.GRQ_SOAK_START) : null;
  if (!start || isNaN(start.getTime())) return 0;
  const snaps = await prisma.navSnapshot.findMany({ where: { at: { gte: start } }, select: { at: true } });
  const days = new Set(snaps.map((s) => etDateStr(s.at)));
  return days.size;
}

/* ---------- shared: latest stance + directive maps for a set of symbols ---------- */
async function stanceMap(symbols: string[]): Promise<Map<string, string>> {
  const rows = await prisma.journalEntry.findMany({
    where: { stance: { not: null }, symbol: { in: symbols } },
    orderBy: { at: "desc" },
    select: { symbol: true, stance: true },
  });
  const m = new Map<string, string>();
  for (const r of rows) if (r.symbol && !m.has(r.symbol) && r.stance) m.set(r.symbol, r.stance);
  return m;
}

/* ---------- /api/market ---------- */
export async function marketResponse() {
  const all = await allUniverse();
  const tracked = all.filter((r) => r.status !== "RETIRED");
  const symbols = tracked.map((r) => r.symbol);

  const [quotes, directives, stances, sigList] = await Promise.all([
    getQuotes(symbols),
    prisma.symbolDirective.findMany(),
    stanceMap(symbols),
    Promise.all(symbols.map((s) => contractSignals(s).catch(() => null))),
  ]);
  const dirBy = new Map(directives.map((d) => [d.symbol, d.directive as string]));
  const sigBy = new Map(symbols.map((s, i) => [s, sigList[i]]));

  const toName = (r: UniverseRow) => {
    const q = quotes.get(r.symbol);
    return {
      symbol: r.symbol,
      name: r.name,
      currency: r.currency ?? "CAD",
      lastCents: q?.midCents ?? 0,
      dayChangeBps: q?.dayChangeBps ?? 0,
      inUniverse: r.status === "ACTIVE",
      agentCall: stanceToCall(stances.get(r.symbol)),
      directive: directiveToContract(dirBy.get(r.symbol)),
      signals: sigBy.get(r.symbol) ?? null,
      logoUrl: r.logoUrl ?? null,
      rating: ratingFor(stances.get(r.symbol)),
    };
  };

  // IA-v2: Universe = the investable set (ACTIVE only); Watchlist = candidates.
  return {
    universe: tracked.filter((r) => r.status === "ACTIVE").map(toName),
    watchlist: tracked.filter((r) => r.status === "CANDIDATE").map(toName),
  };
}

/* ---------- /api/ideas ---------- */
type IdeaShape = {
  symbol: string;
  name: string;
  currency: string;
  call: AgentCall | null;
  target: { nearCents: number | null; nearHorizon: string | null; farCents: number | null; expectedReturnBps: number | null; confidence: number | null };
  unfamiliar: boolean;
  logoUrl: string | null;
  rating: ContractRating | null;
};

export async function ideasResponse(limit = 12): Promise<IdeaShape[]> {
  const all = await allUniverse();
  const nameBy = new Map(all.map((u) => [u.symbol, u.name]));
  const tierBy = new Map(all.map((u) => [u.symbol, u.tier]));
  const currencyBy = new Map(all.map((u) => [u.symbol, u.currency]));
  const logoByIdea = new Map(all.map((u) => [u.symbol, u.logoUrl]));

  // Latest dossier-with-a-target per symbol (mirrors the Today page's ideas).
  const rows = await prisma.journalEntry.findMany({
    where: {
      kind: "RESEARCH",
      title: { startsWith: "Dossier" },
      symbol: { not: null },
      OR: [{ targetNearCents: { not: null } }, { targetFarCents: { not: null } }],
    },
    orderBy: { at: "desc" },
    take: 60,
  });
  const seen = new Set<string>();
  const picked = rows.filter((d) => {
    if (!d.symbol || seen.has(d.symbol)) return false;
    seen.add(d.symbol);
    return true;
  });

  const quotes = await getQuotes(picked.map((d) => d.symbol as string));
  const ideas = picked.map((d) => {
    const sym = d.symbol as string;
    const cur = quotes.get(sym)?.midCents ?? null;
    const farBps = cur && d.targetFarCents ? Math.round(((d.targetFarCents - cur) / cur) * 10_000) : null;
    const nearWeeks = d.targetNearDays ? Math.max(1, Math.round(d.targetNearDays / 5)) : null;
    return {
      symbol: sym,
      name: nameBy.get(sym) ?? sym,
      currency: currencyBy.get(sym) ?? "CAD",
      call: stanceToCall(d.stance),
      target: {
        nearCents: d.targetNearCents ?? null,
        nearHorizon: nearWeeks ? `${nearWeeks}–${nearWeeks + 4} weeks` : null,
        farCents: d.targetFarCents ?? null,
        expectedReturnBps: farBps,
        confidence: d.confidence ?? null,
      },
      unfamiliar: !HOUSEHOLD.has(sym),
      logoUrl: logoByIdea.get(sym) ?? null,
      rating: ratingFor(d.stance),
      _obscurity: HOUSEHOLD.has(sym) ? 3 : tierBy.get(sym) === "etf" || tierBy.get(sym) === "large" ? 2 : 1,
      _far: farBps ?? -9_999,
    };
  });
  // Names you may not know first, then biggest 12-mo upside.
  ideas.sort((a, b) => a._obscurity - b._obscurity || b._far - a._far);
  return ideas.slice(0, limit).map(({ _obscurity, _far, ...rest }) => rest);
}

/* ---------- /api/today ---------- */
export async function todayResponse() {
  const start = startOfEtDay();
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  const [pf, dayOpenSnap, todaySnaps, latestPlan, midday, checkin, latestEod, weekly, xicQuote, all] = await Promise.all([
    getPortfolio(),
    prisma.navSnapshot.findFirst({ where: { at: { lt: start } }, orderBy: { at: "desc" } }),
    prisma.navSnapshot.findMany({ where: { at: { gte: start, lt: end } }, orderBy: { at: "asc" } }),
    // The evolving "latest briefing" slot — same sources the web Portfolio page reads
    // (web/app/portfolio/page.tsx): newest-of-its-kind for each brief type, then pick
    // whichever timestamp is freshest (below). NOT date-scoped, so a weekend shows the
    // last active report.
    prisma.journalEntry.findFirst({ where: { kind: "RESEARCH", title: { startsWith: "Game plan" } }, orderBy: { at: "desc" } }),
    prisma.journalEntry.findFirst({ where: { kind: "RESEARCH", title: { startsWith: "Midday brief" } }, orderBy: { at: "desc" } }),
    // Intraday check-ins write a "Check-in — …" RESEARCH note; match loosely.
    prisma.journalEntry.findFirst({ where: { kind: "RESEARCH", title: { contains: "check-in", mode: "insensitive" } }, orderBy: { at: "desc" } }),
    prisma.report.findFirst({ where: { kind: "EOD" }, orderBy: { createdAt: "desc" } }),
    prisma.report.findFirst({ where: { kind: "WEEKLY" }, orderBy: { createdAt: "desc" } }),
    getQuote("XIC").catch(() => null),
    allUniverse(),
  ]);

  const nameBy = new Map(all.map((u) => [u.symbol, u.name]));
  const currencyBy = new Map(all.map((u) => [u.symbol, u.currency]));
  const logoBy = new Map(all.map((u) => [u.symbol, u.logoUrl]));
  const trackedSymbols = all.filter((u) => u.status !== "RETIRED").map((u) => u.symbol);
  const quotes = await getQuotes(trackedSymbols);

  // Day P&L only means something on a trading day. On a weekend/holiday the NAV is frozen
  // at the last close, so "today" is flat — otherwise we surface the prior session's last
  // intraday-snapshot→close drift as a phantom move (e.g. a Sunday showing Friday's last
  // 11 minutes; Cam, 2026-06-21). `edition` is already "weekend" here, which the app reads
  // as "markets closed".
  const marketDay = isMarketDay();
  const dayOpenNav = dayOpenSnap?.navCents ?? pf.contributionsCents;
  const dayPnl = marketDay ? pf.navCents - dayOpenNav : 0;
  const dayPnlBps = marketDay && dayOpenNav > 0 ? Math.round((dayPnl / dayOpenNav) * 10_000) : 0;

  // The tape: open → now, labelled HH:MM ET.
  const tapeSnaps = dayOpenSnap ? [dayOpenSnap, ...todaySnaps] : todaySnaps;
  const tape = tapeSnaps.map((s) => ({
    at: s.at.toLocaleTimeString("en-CA", { timeZone: "America/Toronto", hour: "2-digit", minute: "2-digit", hour12: false }),
    navCents: s.navCents,
  }));

  // Movers across the universe, biggest up then biggest down.
  const moverRows = [...quotes.entries()]
    .filter(([sym]) => nameBy.has(sym))
    .map(([sym, q]) => ({ symbol: sym, name: nameBy.get(sym) ?? sym, currency: currencyBy.get(sym) ?? "CAD", lastCents: q.midCents, dayChangeBps: q.dayChangeBps ?? 0, logoUrl: logoBy.get(sym) ?? null }))
    .sort((a, b) => b.dayChangeBps - a.dayChangeBps);
  const movers = [...moverRows.filter((m) => m.dayChangeBps > 0).slice(0, 5), ...moverRows.filter((m) => m.dayChangeBps < 0).slice(-5).reverse()];

  const topHitters = [...pf.positions]
    .sort((a, b) => Math.abs(b.dayChangeBps) - Math.abs(a.dayChangeBps))
    .map((p) => ({ symbol: p.symbol, name: nameBy.get(p.symbol) ?? p.symbol, currency: currencyBy.get(p.symbol) ?? "CAD", lastCents: p.lastCents, dayChangeBps: p.dayChangeBps, logoUrl: logoBy.get(p.symbol) ?? null }));

  // Live indices strip (A4) — folded into Today so the app makes one call. FMP shape
  // {symbol,label,price,changePct} → contract {symbol,name,priceCents,changeBps}.
  const indices = fmpEnabled()
    ? await fmpIndices()
        .then((rows) => rows.map((r) => ({ symbol: r.symbol, name: r.label, priceCents: Math.round(r.price * 100), changeBps: Math.round(r.changePct * 100) })))
        .catch(() => [] as { symbol: string; name: string; priceCents: number; changeBps: number }[])
    : [];

  // One evolving "latest briefing" slot, mirroring the web Portfolio page
  // (web/app/portfolio/page.tsx): the agent's most recent read replaces the last —
  // morning game plan → intraday check-in → midday → EOD close → next morning, with
  // the Saturday weekly review holding the slot all weekend. Pick whichever brief has
  // the newest timestamp so the app tracks the same briefing the web shows, instead of
  // freezing on the morning plan (Cam 2026-06-22). The kicker doubles as the title.
  const briefs = [
    latestPlan && { title: "Morning Brief · the pre-market read", body: latestPlan.body, at: latestPlan.at },
    midday && { title: "Midday Review · the afternoon read", body: midday.body, at: midday.at },
    checkin && { title: "Intraday Check-in · the latest read", body: checkin.body, at: checkin.at },
    latestEod && { title: "Evening Brief · the day's close", body: latestEod.body, at: latestEod.createdAt },
    weekly && { title: "Weekly Review · the week in receipts", body: weekly.body, at: weekly.createdAt },
  ].filter((b): b is NonNullable<typeof b> => Boolean(b));
  const lead = briefs.sort((a, b) => b.at.getTime() - a.at.getTime())[0] ?? null;
  const leadTitle = lead?.title ?? "From the desk";

  return {
    edition: editionNow(),
    dateISO: etDateStr(),
    navCents: pf.navCents,
    dayPnlCents: dayPnl,
    dayPnlBps,
    benchmarkBps: xicQuote?.dayChangeBps ?? null,
    tape,
    leadStoryMarkdown: lead?.body ?? null,
    leadTitle,
    movers,
    topHitters,
    onTheRadar: await ideasResponse(8),
    indices,
  };
}

function editionNow(): Edition {
  if (!isMarketDay()) return "weekend";
  const m = etParts().minutesSinceMidnight;
  if (m < 9 * 60 + 30) return "morning";
  if (m < 16 * 60) return "midday";
  return "evening";
}

/* ---------- /api/hunt (A1) ---------- */
// The discovery hunt feed — the same leads the web Market page renders (IdeaCard
// discovery), as the app's HuntFind shape. Obscurity-first; the active brief rides along.
export async function huntResponse() {
  const [state, all] = await Promise.all([
    prisma.agentState.findUnique({ where: { id: 1 } }),
    allUniverse(),
  ]);
  const uBy = new Map(all.map((u) => [u.symbol, u]));
  const statusBy = new Map(all.map((u) => [u.symbol, u.status]));

  const raw = await prisma.journalEntry.findMany({
    where: { kind: "RESEARCH", title: { startsWith: "Hunt dossier" }, symbol: { not: null } },
    orderBy: { at: "desc" },
    take: 24,
  });
  const seen = new Set<string>();
  const picked = raw
    .filter((d) => {
      if (!d.symbol || seen.has(d.symbol)) return false;
      seen.add(d.symbol);
      return true;
    })
    .slice(0, 12);

  const symbols = picked.map((d) => d.symbol as string);
  const quotes = await getQuotes(symbols);

  // 30-day closes power the redesign's heat ranking + sparklines (mirror of
  // web/app/market/page.tsx). Daily bars exist only for tracked names, so backfill any
  // find with too little history once (then it's cached); the rest renormalize.
  const closesBySym = new Map<string, { date: Date; closeCents: number }[]>();
  await Promise.all(symbols.map(async (s) => closesBySym.set(s, await getCloses(s, 40))));
  const missing = symbols.filter((s) => (closesBySym.get(s)?.length ?? 0) < 8);
  if (missing.length) {
    await refreshBars(missing, "3mo").catch(() => 0);
    await Promise.all(missing.map(async (s) => closesBySym.set(s, await getCloses(s, 40))));
  }

  const finds = picked.map((d) => {
    const sym = d.symbol as string;
    const u = uBy.get(sym);
    const q = quotes.get(sym);
    const cur = q?.midCents ?? null;
    const nearBps = cur && d.targetNearCents != null ? Math.round(((d.targetNearCents - cur) / cur) * 10_000) : null;
    const farBps = cur && d.targetFarCents != null ? Math.round(((d.targetFarCents - cur) / cur) * 10_000) : null;
    const spark = (closesBySym.get(sym) ?? []).slice(-30).map((c) => c.closeCents);
    const change30d =
      spark.length >= 2 && spark[0] > 0
        ? (spark[spark.length - 1] - spark[0]) / spark[0]
        : q
          ? (q.dayChangeBps ?? 0) / 10_000
          : null;
    let sources: string[] = [];
    try {
      sources = d.sourcesJson ? JSON.parse(d.sourcesJson) : [];
    } catch {
      sources = [];
    }
    return {
      sym,
      name: u?.name ?? sym,
      logoUrl: u?.logoUrl || fmpLogo(sym),
      currency: u?.currency ?? null,
      cur,
      nearBps,
      farBps,
      nearDays: d.targetNearDays ?? null,
      targetNearCents: d.targetNearCents ?? null,
      targetFarCents: d.targetFarCents ?? null,
      confidence: d.confidence ?? null,
      body: d.body,
      bottomLine: d.bottomLine ?? null,
      sources,
      obscurity: d.obscurity ?? null,
      // Heat-feed enrichment (the iOS redesign reads these; older clients ignore them).
      change30d,
      spark,
      heat: computeHeat({ confidence: d.confidence, change30d, obscurity: d.obscurity }),
      tag: [u?.exchange, u?.sector].filter(Boolean).join(" · ") || null,
      watch: watchFor(statusBy.get(sym)),
    };
  });
  // Heat ranks the board (the redesign's organizing metric); newest-first survives as a
  // stable tiebreak within equal heat since `picked` was already date-ordered.
  finds.sort((a, b) => b.heat - a.heat);
  return { brief: state?.huntBrief ?? null, finds };
}

/* ---------- /api/wire — The Wire (the discovery feed; prototype, iOS-first) ---------- */
// A single scrollable feed of heterogeneous typed cards, reusing the Hunt's feed engine
// plus the existing dossier / watchlist / news / glossary surfaces. v1 is SHARED and
// READ-ONLY — no schema change, no per-user state. Cards are bucketed per kind (each in
// its own natural order) then WOVEN round-robin so the feed reads mixed, not clumped.

/** Trading-days → a plain-English horizon, e.g. 40 → "~8 weeks". */
function wireHorizon(days: number | null | undefined): string | null {
  if (!days) return null;
  const w = Math.max(1, Math.round(days / 5));
  return `~${w} week${w > 1 ? "s" : ""}`;
}

/** Round-robin interleave of per-kind buckets → a mixed feed, capped. */
function weaveWire(buckets: object[][], cap: number): object[] {
  const out: object[] = [];
  for (let i = 0; out.length < cap; i++) {
    let addedThisRow = false;
    for (const b of buckets) {
      if (b[i]) {
        out.push(b[i]);
        addedThisRow = true;
        if (out.length >= cap) break;
      }
    }
    if (!addedThisRow) break;
  }
  return out;
}

export async function wireResponse(viewerEmail?: string | null, cap = 32) {
  const now = new Date();
  // The Wire is going social: the watch lane HIDES the viewer's own watches and
  // surfaces what everyone ELSE is tracking (the other member first, then the agent).
  const viewerKey = viewerEmail ? ownerKeyFor(userForEmail(viewerEmail)?.name) : null;
  const [hunt, all, huntDates, dossierRows, watchRows, news] = await Promise.all([
    huntResponse(),
    allUniverse(),
    // Hunt-find filing dates (huntResponse drops `at`) — for the feed's recency stamp.
    prisma.journalEntry.findMany({
      where: { kind: "RESEARCH", title: { startsWith: "Hunt dossier" }, symbol: { not: null } },
      orderBy: { at: "desc" },
      take: 24,
      select: { symbol: true, at: true },
    }),
    // Recently-filed full dossiers (not hunt leads) — fresh research, with a target.
    prisma.journalEntry.findMany({
      where: { kind: "RESEARCH", title: { startsWith: "Dossier" }, symbol: { not: null } },
      orderBy: { at: "desc" },
      take: 24,
    }),
    // Recently watched names — surfaced with who put them on the board. Take more
    // than we show: the social filter drops the viewer's own before we slice.
    prisma.universeMember.findMany({ where: { status: "CANDIDATE" }, orderBy: { addedAt: "desc" }, take: 30 }),
    fmpEnabled() ? fmpNews(10).catch(() => []) : Promise.resolve([]),
  ]);

  const uBy = new Map(all.map((u) => [u.symbol, u]));
  const huntAtBy = new Map<string, Date>();
  for (const r of huntDates) if (r.symbol && !huntAtBy.has(r.symbol)) huntAtBy.set(r.symbol, r.at);

  // 1) Finds — reuse the heat-ranked hunt finds (already priced + sparked).
  const findSyms = new Set(hunt.finds.map((f) => f.sym));
  const findItems = hunt.finds.slice(0, 10).map((f) => ({
    id: `find:${f.sym}`,
    kind: "find",
    at: (huntAtBy.get(f.sym) ?? now).toISOString(),
    symbol: f.sym,
    name: f.name,
    currency: f.currency ?? "CAD",
    logoUrl: f.logoUrl ?? null,
    lastCents: f.cur ?? null,
    farBps: f.farBps ?? null,
    nearBps: f.nearBps ?? null,
    nearDays: f.nearDays ?? null,
    nearHorizon: wireHorizon(f.nearDays),
    targetNearCents: f.targetNearCents ?? null,
    targetFarCents: f.targetFarCents ?? null,
    confidence: f.confidence ?? null,
    heat: f.heat ?? null,
    obscurity: f.obscurity ?? null,
    change30d: f.change30d ?? null,
    spark: f.spark ?? null,
    sources: f.sources ?? null,
    blurb: firstLine(f.body),
    bullets: toBullets(f.bottomLine, f.body, 4), // a few clean bullets — the card stays fixed, no scrolling
    tag: f.tag ?? null,
  }));

  // 2) Dossiers — recent full research not already shown as a find.
  const dossierSeen = new Set<string>();
  const dossierPicked = dossierRows
    .filter((d) => {
      const sym = d.symbol as string;
      if (!sym || dossierSeen.has(sym) || findSyms.has(sym)) return false;
      dossierSeen.add(sym);
      return true;
    })
    .slice(0, 8);
  const [dossierQuotes, dossierSignals] = await Promise.all([
    getQuotes(dossierPicked.map((d) => d.symbol as string)),
    Promise.all(dossierPicked.map((d) => contractSignals(d.symbol as string).catch(() => null))),
  ]);
  const dossierItems = dossierPicked.map((d, i) => {
    const sym = d.symbol as string;
    const u = uBy.get(sym);
    const q = dossierQuotes.get(sym);
    const cur = q?.midCents ?? null;
    const farBps = cur && d.targetFarCents != null ? Math.round(((d.targetFarCents - cur) / cur) * 10_000) : null;
    const nearBps = cur && d.targetNearCents != null ? Math.round(((d.targetNearCents - cur) / cur) * 10_000) : null;
    return {
      id: `dossier:${sym}`,
      kind: "dossier",
      at: d.at.toISOString(),
      symbol: sym,
      name: u?.name ?? sym,
      currency: u?.currency ?? "CAD",
      logoUrl: u?.logoUrl || fmpLogo(sym),
      lastCents: cur,
      dayChangeBps: q?.dayChangeBps ?? null,
      call: stanceToCall(d.stance),
      farBps,
      nearBps,
      nearDays: d.targetNearDays ?? null,
      nearHorizon: wireHorizon(d.targetNearDays),
      targetNearCents: d.targetNearCents ?? null,
      targetFarCents: d.targetFarCents ?? null,
      confidence: d.confidence ?? null,
      signals: dossierSignals[i],
      blurb: d.bottomLine ?? firstLine(d.body),
      bullets: toBullets(d.bottomLine, d.body, 3),
      tag: [u?.exchange, u?.sector].filter(Boolean).join(" · ") || null,
    };
  });

  // 3) Watches — the SOCIAL lane. Hide the viewer's own watches; show what everyone
  // ELSE is tracking (the other human member first, then the agent). Each is enriched
  // with the latest research we hold (GRQ's call, bottom line, targets, signals) so the
  // card carries real substance, not just "X is watching." Skip names already shown as
  // a find/dossier so a ticker appears once.
  const shownSyms = new Set([...findSyms, ...dossierPicked.map((d) => d.symbol as string)]);
  const watchCandidates = watchRows.filter(
    (w) => uBy.has(w.symbol) && !shownSyms.has(w.symbol) && ownerKeyFor(w.addedBy) !== viewerKey,
  );
  // Other human member before the agent; recency preserved within each (rows are addedAt-desc).
  watchCandidates.sort(
    (a, b) => (ownerKeyFor(a.addedBy) === "agent" ? 1 : 0) - (ownerKeyFor(b.addedBy) === "agent" ? 1 : 0),
  );
  const watchPicked = watchCandidates.slice(0, 6);
  const watchSyms = watchPicked.map((w) => w.symbol);
  // Latest stock dossier (full or hunt) per watched name — powers the rich fields.
  const watchDossierRows = watchSyms.length
    ? await prisma.journalEntry.findMany({
        where: {
          kind: "RESEARCH",
          symbol: { in: watchSyms },
          OR: [{ title: { startsWith: "Dossier" } }, { title: { startsWith: "Hunt dossier" } }],
        },
        orderBy: { at: "desc" },
      })
    : [];
  const watchDossierBy = new Map<string, (typeof watchDossierRows)[number]>();
  for (const r of watchDossierRows) if (r.symbol && !watchDossierBy.has(r.symbol)) watchDossierBy.set(r.symbol, r);
  const [watchStances, watchQuotes, watchCloses, watchSignals] = await Promise.all([
    stanceMap(watchSyms),
    getQuotes(watchSyms),
    Promise.all(watchPicked.map((w) => getCloses(w.symbol, 40).catch(() => []))),
    Promise.all(watchPicked.map((w) => contractSignals(w.symbol).catch(() => null))),
  ]);
  const watchSparkBy = new Map(watchPicked.map((w, i) => [w.symbol, watchCloses[i].slice(-30).map((c) => c.closeCents)]));
  const watchItems = watchPicked.map((w, i) => {
    const u = uBy.get(w.symbol)!;
    const q = watchQuotes.get(w.symbol);
    const cur = q?.midCents ?? null;
    const person = personByName(w.addedBy);
    const watcher = person?.name ?? (w.addedBy && w.addedBy !== "agent" ? w.addedBy : "Agent");
    const spark = watchSparkBy.get(w.symbol) ?? [];
    const dd = watchDossierBy.get(w.symbol);
    const farBps = cur && dd?.targetFarCents != null ? Math.round(((dd.targetFarCents - cur) / cur) * 10_000) : null;
    const nearBps = cur && dd?.targetNearCents != null ? Math.round(((dd.targetNearCents - cur) / cur) * 10_000) : null;
    return {
      id: `watch:${w.symbol}`,
      kind: "watch",
      at: w.addedAt.toISOString(),
      symbol: w.symbol,
      name: u.name,
      currency: u.currency ?? "CAD",
      logoUrl: u.logoUrl || fmpLogo(w.symbol),
      lastCents: cur,
      dayChangeBps: q?.dayChangeBps ?? null,
      call: stanceToCall(dd?.stance) ?? stanceToCall(watchStances.get(w.symbol)),
      farBps,
      nearBps,
      nearDays: dd?.targetNearDays ?? null,
      nearHorizon: wireHorizon(dd?.targetNearDays),
      targetNearCents: dd?.targetNearCents ?? null,
      targetFarCents: dd?.targetFarCents ?? null,
      confidence: dd?.confidence ?? null,
      signals: watchSignals[i],
      blurb: dd?.bottomLine ?? (dd?.body ? firstLine(dd.body) : null),
      bullets: toBullets(dd?.bottomLine, dd?.body, 3),
      spark: spark.length >= 2 ? spark : null,
      tag: [u.exchange, u.sector].filter(Boolean).join(" · ") || null,
      watcher,
      watcherKey: person?.key ?? "agent",
    };
  });

  // 4) Articles — general market headlines + stock-tied news on tracked names
  // (Phase 2 #3). We pull fresh per-symbol news for a few names already in the feed
  // so an article carries the ticker it's about → tap a chip straight to the dossier.
  const articleSyms = [...new Set([...dossierPicked.map((d) => d.symbol as string), ...watchPicked.map((w) => w.symbol)])]
    .filter((s) => uBy.has(s))
    .slice(0, 4);
  const stockNewsLists = fmpEnabled()
    ? await Promise.all(articleSyms.map((s) => fmpStockNews(s, 2).catch(() => [])))
    : [];
  const stockArticleItems = articleSyms
    .map((sym, i) => {
      const n = stockNewsLists[i]?.[0];
      if (!n) return null;
      const u = uBy.get(sym)!;
      return {
        id: `stocknews:${sym}`,
        kind: "article",
        at: n.at || now.toISOString(),
        title: n.title,
        publisher: n.publisher || null,
        imageUrl: n.image || null,
        url: n.url || null,
        symbol: sym,
        name: u.name,
        currency: u.currency ?? "CAD",
        logoUrl: u.logoUrl || fmpLogo(sym),
        relatedTickers: [sym],
        tag: [u.exchange, u.sector].filter(Boolean).join(" · ") || "Market",
      };
    })
    .filter(Boolean) as object[];

  const generalArticleItems = news.slice(0, 6).map((n, i) => ({
    id: `article:${i}`,
    kind: "article",
    at: n.at || now.toISOString(),
    title: n.title,
    publisher: n.publisher || null,
    imageUrl: n.image || null,
    url: n.url || null,
    tag: "Market",
  }));
  // Stock-tied first (more relevant), then general — one lane so the weave keeps them apart.
  const articleItems = [...stockArticleItems, ...generalArticleItems];

  // 5) Lessons — a few glossary explainers, rotated by day so the feed varies.
  const glossKeys = Object.keys(GLOSSARY);
  const seed = [...etDateStr()].reduce((a, c) => a + c.charCodeAt(0), 0);
  const lessonItems = glossKeys.length
    ? [0, 1, 2].map((j) => {
        const k = glossKeys[(seed + j * 7) % glossKeys.length];
        const g = GLOSSARY[k];
        // Resolve related slugs to self-contained {slug,term,def} so the card can
        // present a tapped term directly (the bundled iOS glossary is a subset).
        const related = (g.related ?? [])
          .filter((slug) => GLOSSARY[slug])
          .slice(0, 4)
          .map((slug) => ({ slug, term: GLOSSARY[slug].term, def: GLOSSARY[slug].def }));
        return {
          id: `lesson:${k}`,
          kind: "lesson",
          at: now.toISOString(),
          lessonTerm: g.term,
          lessonBody: g.def,
          lessonSlug: k,
          lessonExample: g.example ?? null,
          lessonRelated: related.length ? related : null,
          tag: "Learn",
        };
      })
    : [];

  // Lead with a find, then weave the rest so no two same-kind cards clump together.
  const items = weaveWire([findItems, dossierItems, articleItems, watchItems, lessonItems], cap);
  return { items };
}

/* ---------- /api/smart-money (A3) ---------- */
const tidyName = (s: string) =>
  s.replace(/\b(INC|CORP|CO|LTD|PLC|LP|LLC|N V|S A|GROUP|THE)\b\.?/gi, "").replace(/\s+/g, " ").trim() || s;

export async function smartMoneyResponse() {
  const [universe, portfolios, congress, funds, insiders, clusters, fresh, narrative] = await Promise.all([
    allUniverse(),
    getPortfolios(),
    getCongressLeaderboard(90, 8),
    getFundsPilingIn(8),
    getInsiderTopBuys(14, 10),
    getInsiderClusters(30, 8),
    getSmartMoneyFreshness(),
    prisma.journalEntry.findFirst({ where: { kind: "RESEARCH", title: { startsWith: "Smart money" } }, orderBy: { at: "desc" } }),
  ]);

  const overlap = new Map<string, "universe" | "watching">();
  for (const u of universe) {
    if (u.status === "ACTIVE") overlap.set(u.symbol, "universe");
    else if (u.status === "CANDIDATE") overlap.set(u.symbol, "watching");
  }

  let narrSources: string[] = [];
  try {
    narrSources = narrative?.sourcesJson ? JSON.parse(narrative.sourcesJson) : [];
  } catch {
    narrSources = [];
  }

  return {
    portfolios: portfolios.map((p) => ({
      slug: p.slug,
      name: p.name,
      subtitle: p.firm || p.blurb || null,
      asOf: p.asOf ?? null,
      totalValueUsd: p.totalValueUsd ?? null,
      topHoldings: p.topHoldings.map((h) => ({
        symbol: h.symbol,
        name: h.name ?? null,
        changeKind: h.action ?? null,
        valueUsd: h.valueUsd ?? null,
        weightBps: h.pctOfPort != null ? Math.round(h.pctOfPort * 100) : null,
        putCall: h.putCall ?? null,
        overlap: overlap.get(h.symbol) ?? null,
      })),
    })),
    congress: congress.map((c) => ({
      symbol: c.symbol,
      name: tidyName(c.assetName),
      primary: `${c.buyers} member${c.buyers > 1 ? "s" : ""}`,
      secondary: `${c.trades} trade${c.trades > 1 ? "s" : ""}`,
      overlap: overlap.get(c.symbol) ?? null,
    })),
    funds: funds.map((f) => ({
      symbol: f.symbol,
      name: tidyName(f.name),
      primary: `${f.funds} fund${f.funds > 1 ? "s" : ""}`,
      secondary: fmtUsd(f.totalValueUsd),
      overlap: overlap.get(f.symbol) ?? null,
    })),
    insiders: insiders.map((t) => ({
      symbol: t.symbol,
      name: t.insiderName.length > 26 ? `${t.insiderName.slice(0, 26)}…` : t.insiderName,
      primary: fmtUsd(t.valueUsd),
      secondary: t.insiderTitle ? t.insiderTitle.split(/[,:]/)[0] : null,
      overlap: overlap.get(t.symbol) ?? null,
    })),
    clusters: clusters.map((c) => ({ symbol: c.symbol, insiders: c.insiders, totalValueUsd: c.totalValueUsd ?? null })),
    narrative: narrative ? { title: narrative.title, body: narrative.body, at: iso(narrative.at), sources: narrSources } : null,
    updatedAt: iso(fresh.congress ?? fresh.insider ?? fresh.portfolio),
  };
}

/* ---------- /api/reports (A10) ---------- */
function firstLine(body: string): string {
  const line = body.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  return line.length > 160 ? line.slice(0, 160) + "…" : line;
}

// Strip markdown/wiki markup to plain text — The Wire cards render fixed, designed
// rows (no markdown renderer), so the server hands them clean strings: no [[wiki]],
// no **bold**, no ~~strike~~, no `code`, no links.
function stripInline(s: string): string {
  return s
    .replace(/\[\[([^\]]+)\]\]/g, "$1") // [[wiki]] → wiki
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // [text](url) → text
    .replace(/~~([^~]+)~~/g, "$1") // ~~strike~~ → strike
    .replace(/`([^`]+)`/g, "$1") // `code` → code
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1") // **bold** / *italic*
    .replace(/[*_~`]/g, "") // stray markers
    .replace(/\s+/g, " ")
    .trim();
}

// Turn a dossier's bottom line (or body, as a fallback) into a SHORT list of clean
// bullets for a card. Prefers existing bullet/numbered lines; otherwise splits prose
// into a few sentences. Caps count + per-bullet length so the card never needs to scroll.
function toBullets(primary: string | null | undefined, fallback: string | null | undefined, max = 4): string[] {
  const src = (primary && primary.trim()) || (fallback && fallback.trim()) || "";
  if (!src) return [];
  const lines = src.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const bulletLines = lines.filter((l) => /^([-*•]|\d+[.)])\s+/.test(l));
  const items =
    bulletLines.length >= 2
      ? bulletLines.map((l) => l.replace(/^([-*•]|\d+[.)])\s+/, ""))
      : lines.join(" ").split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/);
  return items
    .map(stripInline)
    .map((s) => (s.length > 150 ? s.slice(0, 147).trimEnd() + "…" : s))
    .filter((s) => s.length > 1)
    .slice(0, max);
}

export async function reportsResponse(limit = 40) {
  const reports = await prisma.report.findMany({ orderBy: { date: "desc" }, take: limit });
  return {
    reports: reports.map((r) => ({
      id: String(r.id),
      kind: r.kind,
      dateISO: etDateStr(r.date),
      title: r.title,
      summary: firstLine(r.body),
    })),
  };
}

export async function reportDayResponse(date: string) {
  // date = YYYY-MM-DD (ET). Match the EOD report whose ET calendar date matches.
  const reports = await prisma.report.findMany({ where: { kind: "EOD" }, orderBy: { date: "desc" }, take: 120 });
  const match = reports.find((r) => etDateStr(r.date) === date);
  if (!match) return null;
  return { id: String(match.id), title: match.title, dateISO: etDateStr(match.date), bodyMarkdown: match.body };
}

/* ---------- /api/dossier/[symbol] ---------- */
export async function dossierResponse(symbol: string) {
  const sym = symbol.toUpperCase();
  const all = await allUniverse();
  const entry = all.find((u) => u.symbol === sym);
  if (!entry) return null;

  const [quote, journal, signals, sigFull, analyst, directiveRow, pendingResearch, peers] = await Promise.all([
    getQuote(sym).catch(() => null),
    prisma.journalEntry.findMany({ where: { symbol: sym }, orderBy: { at: "desc" }, take: 50 }),
    contractSignals(sym).catch(() => null),
    computeSignals(sym).catch(() => null),
    fmpEnabled() ? fmpAnalystTarget(entry.yahoo).catch(() => null) : Promise.resolve(null),
    prisma.symbolDirective.findUnique({ where: { symbol: sym } }).catch(() => null),
    prisma.researchRequest.count({ where: { symbol: sym, status: { in: ["QUEUED", "RUNNING"] } } }).catch(() => 0),
    fmpEnabled() ? fmpPeerComparison(entry.yahoo).catch(() => []) : Promise.resolve([]),
  ]);

  const currentRead = journal.find((j) => j.kind === "RESEARCH" || j.kind === "DECISION");
  const stanceEntry = journal.find((j) => j.stance);
  const targetEntry = journal.find((j) => j.targetFarCents != null || j.targetNearCents != null);
  const bottomLineEntry = journal.find((j) => j.bottomLine);
  const cur = quote?.midCents ?? null;
  const farBps = cur && targetEntry?.targetFarCents ? Math.round(((targetEntry.targetFarCents - cur) / cur) * 10_000) : null;
  const nearWeeks = targetEntry?.targetNearDays ? Math.max(1, Math.round(targetEntry.targetNearDays / 5)) : null;

  // The technical-lean fallback rating (the deterministic signal consensus), tagged
  // as such so the app's RatingBar always has an axis even before GRQ files a call.
  const rec = sigFull ? overallSignal(sigFull) : null;
  const recMeta = rec ? stanceMeta(rec.label) : null;
  const selfPeer = (peers as Array<{ self?: boolean; peTtm?: number | null }>).find((p) => p.self);

  const body =
    currentRead?.body ??
    bottomLineEntry?.bottomLine ??
    "No dossier filed yet — the agent writes the business, the bull and bear case, and a verdict here once it researches this name.";

  return {
    symbol: sym,
    name: entry.name,
    currency: entry.currency ?? "CAD",
    lastCents: cur,
    bodyMarkdown: body,
    call: stanceToCall(stanceEntry?.stance),
    target: {
      nearCents: targetEntry?.targetNearCents ?? null,
      nearHorizon: nearWeeks ? `${nearWeeks}–${nearWeeks + 4} weeks` : null,
      farCents: targetEntry?.targetFarCents ?? null,
      expectedReturnBps: farBps,
      confidence: targetEntry?.confidence ?? null,
    },
    signals,
    analystTargetCents: analyst?.consensusCents ?? null,
    marketCapCents: entry.marketCapM != null ? entry.marketCapM * 100_000_000 : null,
    peRatio: selfPeer?.peTtm ?? null,
    freeCashFlowCents: null,
    dividendYieldBps: null,
    filedAt: iso((currentRead ?? stanceEntry ?? targetEntry)?.at ?? null),
    // A5 enrichment — the app's rich dossier (rating bar, status, bottom line, controls).
    logoUrl: entry.logoUrl ?? null,
    status: entry.status,
    watch: watchFor(entry.status),
    rating: ratingFor(stanceEntry?.stance),
    recLabel: recMeta?.label ?? null,
    recPos: recMeta?.pos ?? null,
    bottomLine: bottomLineEntry?.bottomLine ?? null,
    researching: pendingResearch > 0,
    directive: directiveToContract(directiveRow?.directive),
  };
}
