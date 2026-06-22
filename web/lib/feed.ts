import { prisma } from "./db";
import type { Session } from "./session";
import { getPortfolio } from "./portfolio";
import { getQuotes, getQuote } from "./broker/quotes";
import { allUniverse, type UniverseRow } from "./universe";
import { computeSignals, overallSignal } from "@/agent/signals";
import { DIALS } from "@/agent/policy";
import { etParts, etDateStr, isMarketDay, startOfEtDay } from "@/agent/calendar";
import { fmpEnabled, fmpAnalystTarget, fmpIndices, fmpPeerComparison } from "./fmp";
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
      confidence: d.confidence ?? null,
      body: d.body,
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
