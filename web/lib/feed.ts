import { prisma } from "./db";
import type { Session } from "./session";
import { getPortfolio } from "./portfolio";
import { dailyQuote } from "./dailyquote";
import { soakStatus } from "./soak";
import { listFxRequests } from "./fx-requests";
import { getQuotes, getQuote } from "./broker/quotes";
import { allUniverse, type UniverseRow, bareTicker, yahooForListing } from "./universe";
import { computeSignals, overallSignal } from "@/agent/signals";
import { DIALS } from "@/agent/policy";
import { etParts, etDateStr, isMarketDay, isMarketOpen, startOfEtDay } from "@/agent/calendar";
import {
  fmpEnabled, fmpAnalystTarget, fmpIndices, fmpPeerComparison, fmpNews, fmpStockNews,
  fmpGrades, fmpGradeActions, fmpGradesTrend, fmpTargetTrend, fmpEarningsReport, fmpInstitutional, fmpTopHolders,
  fmpGainers, fmpEarningsCalendar, stripSuffix,
} from "./fmp";
import { todayHeadlines } from "./news/queries";
import { getMacro, macroLine } from "./macro";
import { funFactOfDay } from "./funfacts";
import { getScoreboard } from "./scoreboard";
import { GLOSSARY } from "./glossary";
import { watchersFor, allWatches } from "./watch";
import { usdCadRate } from "./fx";
import { personByName, personByEmail, ownerKeyFor } from "./people";
import { userForEmail, memberEmails } from "./users";
import { accountsForMembers, personalPositionsFor } from "./external/store";
import { getOptions, optionsLine } from "./options/store";
import { getSocial, socialLine } from "./social/store";
import { parseBoard, buildPlayViews, chessRefsForSymbol, bareChainKey } from "./chess";
import { relatedFor } from "./graph/related";
import { parseConfidenceLevers } from "./confidence-levers";
import { loadStandings } from "./race/standings";
import { loadBullRace, listRaces } from "./race/bulls";
import { loadDesk, listDesks } from "./options-desk/desk";
import { loadReportCard } from "./report-card/load";
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
  getCongressMembers,
  getSmartMoneyFreshness,
  getSmartMoneyForSymbol,
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

// Alfred's call as the 7-point rating object (mirrors lib/stance.ts `stanceMeta`) — the
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
    cadCashCents: pf.cadCashCents,
    usdCashCents: pf.usdCashCents,
    fxUsdCad: pf.fxUsdCad,
    positions: pf.positions.map((p) => ({
      symbol: p.symbol,
      qty: p.qty,
      avgCostCents: p.avgCostCents,
      lastCents: p.lastCents,
      marketValueCents: p.marketValueCents,
      unrealizedPnlCents: p.unrealizedPnlCents,
      dayChangeBps: p.dayChangeBps,
      openedAt: p.openedAt.toISOString(),
      currency: p.currency,
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
    // Soak gate (PROJECT_PLAN §9): ≥4 clean weeks total (28d) + ≥2 on IBKR paper (14d).
    // Elapsed calendar days from each inception (lib/soak.ts). Was a v0 placeholder that
    // returned 0 (env unset + hardcoded 0) → the iOS counter "never started".
    ...(() => {
      const s = soakStatus();
      return {
        soakDaysClean: s.totalDays,
        soakDaysRequired: s.totalRequired,
        soakPaperDaysClean: s.paperDays,
        soakPaperDaysRequired: s.paperRequired,
      };
    })(),
  };
}

/* ---------- /api/fx (GET — mobile FX panel state, D62) ---------- */
export async function fxStateResponse() {
  const [pf, settings, reqs] = await Promise.all([
    getPortfolio(),
    prisma.settings.findUnique({ where: { id: 1 } }),
    listFxRequests(),
  ]);
  const usdCashCadCents = pf.cashCents - pf.cadCashCents;
  const usdPositionsCadCents = pf.positions.filter((p) => p.currency === "USD").reduce((s, p) => s + p.marketValueCadCents, 0);
  const usdPct = pf.navCents > 0 ? Math.round(((usdCashCadCents + usdPositionsCadCents) / pf.navCents) * 1000) / 10 : 0;
  const row = (r: Awaited<ReturnType<typeof listFxRequests>>["pending"][number]) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    fromCurrency: r.fromCurrency,
    toCurrency: r.toCurrency,
    amountUsdCents: r.amountUsdCents,
    estCadCents: r.estCadCents,
    reason: r.reason,
    symbol: r.symbol,
    status: r.status,
    requestedBy: r.requestedBy,
    decidedBy: r.decidedBy,
    note: r.note,
    executedRate: r.executedRate,
    executedCadCents: r.executedCadCents,
    executedUsdCents: r.executedUsdCents,
    failReason: r.failReason,
  });
  return {
    cadCashCents: pf.cadCashCents,
    usdCashCents: pf.usdCashCents,
    fxUsdCad: pf.fxUsdCad,
    usdPct,
    fxMaxPerRequestCents: settings?.fxMaxPerRequestCents ?? 0,
    fxMaxPerWeekCents: settings?.fxMaxPerWeekCents ?? 0,
    usdAllocationCapPct: settings?.usdAllocationCapPct ?? 100,
    pending: reqs.pending.map(row),
    recent: reqs.recent.map(row),
  };
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

  const [quotes, directives, stances, sigList, watchersMap] = await Promise.all([
    getQuotes(symbols),
    prisma.symbolDirective.findMany(),
    stanceMap(symbols),
    Promise.all(symbols.map((s) => contractSignals(s).catch(() => null))),
    watchersFor(symbols),
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
      // Members watching this name (D78) — key+name only (iOS picks the bundled avatar).
      watchers: (watchersMap.get(r.symbol) ?? []).map((w) => ({ key: w.key, name: w.name })),
    };
  };

  // IA-v2: Universe = the investable set (ACTIVE only); Watchlist = candidates.
  return {
    universe: tracked.filter((r) => r.status === "ACTIVE").map(toName),
    watchlist: tracked.filter((r) => r.status === "CANDIDATE").map(toName),
  };
}

/* ---------- /api/wire?seed&page — the infinite research shelf (GRQ Go) ----------
 * Once the curated wire runs out, the app keeps scrolling: every name we hold a
 * dossier on, shuffled deterministically by the client's session seed, served in
 * pages that wrap around forever. Latest dossier per symbol + a live quote. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function wireMoreResponse(seed: number, page: number, take = 15) {
  const dossiers = await prisma.journalEntry.findMany({
    where: { kind: "RESEARCH", title: { startsWith: "Dossier" }, symbol: { not: null } },
    orderBy: { at: "desc" },
    distinct: ["symbol"],
    select: {
      symbol: true, companyName: true, stance: true, confidence: true, at: true,
      targetNearCents: true, targetFarCents: true, targetNearDays: true, bottomLine: true,
    },
  });
  if (dossiers.length === 0) return { items: [], pool: 0 };

  // Deterministic shuffle by the session seed, then slice with wraparound —
  // the shelf never runs dry.
  const rand = mulberry32(seed || 1);
  const shuffled = [...dossiers];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const start = (page * take) % shuffled.length;
  const slice = [...shuffled, ...shuffled].slice(start, start + Math.min(take, shuffled.length));

  const all = await allUniverse();
  const uBy = new Map(all.map((u) => [u.symbol, u]));
  const quotes = await getQuotes(slice.map((d) => d.symbol as string));

  const items = slice.map((d) => {
    const sym = d.symbol as string;
    const u = uBy.get(sym);
    const q = quotes.get(sym);
    const cur = q?.midCents ?? null;
    const nearBps = cur && d.targetNearCents ? Math.round(((d.targetNearCents - cur) / cur) * 10_000) : null;
    const farBps = cur && d.targetFarCents ? Math.round(((d.targetFarCents - cur) / cur) * 10_000) : null;
    // The bottom line is bullet-markdown — lift clean bullets for the card body.
    const bullets = (d.bottomLine ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("- "))
      .map((l) => l.slice(2).replace(/\[\[(.+?)\]\]/g, "$1").replace(/\*\*/g, "").trim())
      .filter(Boolean)
      .slice(0, 4);
    return {
      id: `shelf:${sym}:${page}`,
      kind: "dossier" as const,
      at: d.at.toISOString(),
      symbol: sym,
      name: u?.name ?? d.companyName ?? sym,
      currency: u?.currency ?? null,
      logoUrl: u?.logoUrl || fmpLogo(sym),
      lastCents: cur,
      dayChangeBps: q?.dayChangeBps ?? null,
      call: stanceToCall(d.stance),
      nearBps,
      farBps,
      nearDays: d.targetNearDays ?? null,
      nearHorizon: d.targetNearDays ? `~${Math.max(1, Math.round(d.targetNearDays / 5))} weeks` : null,
      targetNearCents: d.targetNearCents ?? null,
      targetFarCents: d.targetFarCents ?? null,
      confidence: d.confidence ?? null,
      bullets: bullets.length ? bullets : undefined,
      tag: "from the research shelf",
    };
  });
  return { items, pool: dossiers.length };
}

/* ---------- /api/watchlist — the watch-driven list (D78), GRQ Go's Watchlist ----------
 * Mirrors web/app/market/watchlist/page.tsx: names any member personally watches
 * (candidates AND promoted names), pinned first then alphabetical, with Alfred's
 * call + the latest dossier's targets/confidence/bottom line. NOT the old
 * marketResponse.watchlist (that's IA-v2 candidate-status semantics). */
export async function watchlistResponse() {
  const [universe, watchMap, running, directives] = await Promise.all([
    allUniverse(),
    allWatches(),
    prisma.researchRequest.findMany({ where: { status: "RUNNING" }, select: { symbol: true } }),
    prisma.symbolDirective.findMany(),
  ]);
  const bySym = new Map(universe.map((u) => [u.symbol, u]));
  const tracked = [...watchMap.keys()]
    .map((sym) => bySym.get(sym))
    .filter((u): u is UniverseRow => !!u && u.status !== "RETIRED");
  const symbols = tracked.map((c) => c.symbol);

  const [quotes, stances, dossiers] = await Promise.all([
    getQuotes(symbols),
    stanceMap(symbols),
    prisma.journalEntry.findMany({
      where: { kind: "RESEARCH", title: { startsWith: "Dossier" }, symbol: { in: symbols } },
      orderBy: { at: "desc" },
    }),
  ]);
  const dossierBy = new Map<string, (typeof dossiers)[number]>();
  for (const d of dossiers) if (d.symbol && !dossierBy.has(d.symbol)) dossierBy.set(d.symbol, d);
  const dirBy = new Map(directives.map((d) => [d.symbol, d]));
  const runningSet = new Set(running.map((r) => r.symbol));

  const rows = tracked
    .map((c) => {
      const q = quotes.get(c.symbol);
      const doss = dossierBy.get(c.symbol);
      const dir = dirBy.get(c.symbol);
      const cur = q?.midCents ?? null;
      const sm = stanceMeta(stances.get(c.symbol));
      return {
        symbol: c.symbol,
        name: c.name,
        logoUrl: c.logoUrl ?? null,
        currency: c.currency ?? "CAD",
        exchange: c.exchange ?? null,
        lastCents: cur,
        dayBps: q?.dayChangeBps ?? null,
        stance: sm?.label ?? null,
        stanceTone: sm?.tone ?? null,
        stanceBlurb: sm?.blurb ?? null,
        watchers: (watchMap.get(c.symbol) ?? []).map((w) => ({ key: w.key, name: w.name })),
        pinnedBy: dir?.directive === "PINNED" ? (dir.by ?? null) : null,
        blocked: dir?.directive === "BLOCKED",
        status: c.status,
        researchInFlight: runningSet.has(c.symbol),
        upsidePct: cur && doss?.targetFarCents != null ? (doss.targetFarCents - cur) / cur : null,
        nearPct: cur && doss?.targetNearCents != null ? (doss.targetNearCents - cur) / cur : null,
        nearDays: doss?.targetNearDays ?? null,
        confidence: doss?.confidence ?? null,
        bottomLine: doss?.bottomLine ?? null,
      };
    })
    .sort((a, b) =>
      !!a.pinnedBy !== !!b.pinnedBy ? (a.pinnedBy ? -1 : 1) : a.symbol.localeCompare(b.symbol),
    );
  return { rows };
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

  const [pf, dayOpenSnap, todaySnaps, premorning, latestPlan, midday, checkin, latestEod, weekly, xicQuote, all] = await Promise.all([
    getPortfolio(),
    prisma.navSnapshot.findFirst({ where: { at: { lt: start } }, orderBy: { at: "desc" } }),
    prisma.navSnapshot.findMany({ where: { at: { gte: start, lt: end } }, orderBy: { at: "asc" } }),
    // The evolving "latest briefing" slot — same sources the web Portfolio page reads
    // (web/app/portfolio/page.tsx): newest-of-its-kind for each brief type, then pick
    // whichever timestamp is freshest (below). NOT date-scoped, so a weekend shows the
    // last active report.
    prisma.journalEntry.findFirst({ where: { kind: "RESEARCH", title: { startsWith: "Pre-morning read" } }, orderBy: { at: "desc" } }),
    prisma.journalEntry.findFirst({ where: { kind: "RESEARCH", title: { startsWith: "Game plan" } }, orderBy: { at: "desc" } }),
    prisma.journalEntry.findFirst({ where: { kind: "RESEARCH", title: { startsWith: "Midday brief" } }, orderBy: { at: "desc" } }),
    // Intraday check-ins write a "Check-in — …" RESEARCH note. Fund-level check-ins leave
    // `symbol` null; a held-position trigger escalation tags the holding (symbol). Require
    // symbol:null so a noisy single-name trigger (e.g. ATD) can't take the brief — matches
    // the web Portfolio page; the per-name note still lives on its stock page (Cam 2026-06-24).
    prisma.journalEntry.findFirst({ where: { kind: "RESEARCH", title: { contains: "check-in", mode: "insensitive" }, symbol: null }, orderBy: { at: "desc" } }),
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
    premorning && { title: "Pre-Morning Read · what changed overnight", body: premorning.body, at: premorning.at },
    latestPlan && { title: "Morning Brief · the pre-market read", body: latestPlan.body, at: latestPlan.at },
    midday && { title: "Midday Review · the afternoon read", body: midday.body, at: midday.at },
    checkin && { title: "Intraday Check-in · the latest read", body: checkin.body, at: checkin.at },
    latestEod && { title: "Evening Brief · the day's close", body: latestEod.body, at: latestEod.createdAt },
    weekly && { title: "Weekly Review · the week in receipts", body: weekly.body, at: weekly.createdAt },
  ].filter((b): b is NonNullable<typeof b> => Boolean(b));
  const lead = briefs.sort((a, b) => b.at.getTime() - a.at.getTime())[0] ?? null;
  const leadTitle = lead?.title ?? "From the desk";

  // ---- The newspaper sections the web Today grew (D106 mobile parity, additive) ----
  const todayStr = etDateStr();
  const earnFrom = etDateStr(new Date(start.getTime() - 7 * 24 * 60 * 60 * 1000));
  const earnTo = etDateStr(new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000));
  const [headlines, brief, gainers, macro, earnCal, stanceRows] = await Promise.all([
    todayHeadlines(12).catch(() => []),
    prisma.marketBrief.findFirst({ where: { date: todayStr }, orderBy: { createdAt: "desc" } }).catch(() => null),
    fmpEnabled() ? fmpGainers().catch(() => []) : Promise.resolve([]),
    getMacro().catch(() => null),
    fmpEnabled() ? fmpEarningsCalendar(earnFrom, earnTo).catch(() => []) : Promise.resolve([]),
    prisma.journalEntry.findMany({
      where: { stance: { not: null }, symbol: { not: null } },
      orderBy: { at: "desc" },
      select: { symbol: true, stance: true },
    }),
  ]);
  const stanceBy = new Map<string, string>();
  for (const s of stanceRows) if (s.symbol && !stanceBy.has(s.symbol)) stanceBy.set(s.symbol, s.stance as string);

  // Earnings calendar → our names, matched on the bare *yahoo* ticker (AMD.US is
  // stored with yahoo "AMD"), RETIRED CDR shells skipped — the web page's logic, compact.
  const bareToU = new Map<string, UniverseRow>();
  for (const u of all) {
    if (u.status === "RETIRED") continue;
    const key = stripSuffix(u.yahoo || u.symbol).toUpperCase();
    if (!bareToU.has(key) || u.status === "ACTIVE") bareToU.set(key, u);
  }
  const dayBpsBy = new Map([...quotes.entries()].map(([sym, q]) => [sym, q.dayChangeBps ?? 0]));
  const earnSeen = new Set<string>();
  const earnMatched = earnCal.flatMap((r) => {
    const u = bareToU.get(stripSuffix(r.symbol).toUpperCase());
    if (!u) return [];
    const key = `${u.symbol}|${r.date}`;
    if (earnSeen.has(key)) return [];
    earnSeen.add(key);
    return [{
      symbol: u.symbol,
      name: u.name,
      logoUrl: u.logoUrl ?? null,
      date: r.date,
      epsEstimated: r.epsEstimated,
      epsActual: r.epsActual,
      revenueEstimated: r.revenueEstimated,
      revenueActual: r.revenueActual,
      dayBps: dayBpsBy.get(u.symbol) ?? null,
      stance: stanceBy.get(u.symbol) ?? null,
    }];
  });
  const earningsReported = earnMatched
    .filter((e) => e.epsActual != null || e.revenueActual != null)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);
  const earningsUpcoming = earnMatched
    .filter((e) => e.date >= todayStr && e.epsActual == null && e.revenueActual == null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 8)
    .map((e) => ({ symbol: e.symbol, name: e.name, logoUrl: e.logoUrl, date: e.date }));

  // Sector breakdown — average day move across tracked names.
  const sectorAcc = new Map<string, { sum: number; n: number }>();
  for (const u of all) {
    if (!u.sector || u.status === "RETIRED") continue;
    const bps = dayBpsBy.get(u.symbol);
    if (bps == null) continue;
    const e = sectorAcc.get(u.sector) ?? { sum: 0, n: 0 };
    e.sum += bps;
    e.n += 1;
    sectorAcc.set(u.sector, e);
  }
  const sectors = [...sectorAcc.entries()]
    .map(([name, { sum, n }]) => ({ name, avgBps: Math.round(sum / n), n }))
    .sort((a, b) => b.avgBps - a.avgBps);

  const marketGainers = gainers.slice(0, 6).map((g) => ({
    symbol: g.symbol,
    name: g.name,
    priceCents: g.priceCents,
    changeBps: Math.round(g.changePct * 10_000),
    exchange: g.exchange,
    inUniverse: bareToU.has(stripSuffix(g.symbol).toUpperCase()),
  }));

  return {
    edition: editionNow(),
    dateISO: etDateStr(),
    quote: await dailyQuote(),
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
    // Newspaper sections (additive; the old app ignores unknown keys).
    marketOpen: isMarketOpen(),
    dayLabel: new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto", weekday: "long", month: "long", day: "numeric" }),
    funFact: funFactOfDay(),
    macroLine: macro ? macroLine(macro) : null,
    macroNote: macro ? `${macro.fedFunds != null ? "Bank of Canada · US FRED" : "Bank of Canada"} · as of ${macro.asOf}` : null,
    marketBrief: brief ? { body: brief.body, edition: brief.edition, date: brief.date } : null,
    headlines: headlines.map((n) => ({
      at: n.at,
      title: n.title,
      url: n.url,
      publisher: n.publisher,
      image: n.image,
      summary: n.summary,
      sentiment: n.sentiment,
    })),
    earningsReported,
    earningsUpcoming,
    sectors,
    marketGainers,
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
  // D51 exact-listing resolution (web market-page parity): a bare untracked ticker is
  // ambiguous (AII = NYSE insurance or TSX tungsten) — suffix it via the agent-captured
  // exchange so quote, bars AND logo key off the real listing. Tracked names keep theirs.
  const listingOf = (d: (typeof picked)[number]): string => {
    const sym = d.symbol as string;
    return uBy.has(sym) ? sym : yahooForListing(sym, d.exchange);
  };
  const [quotes, watchersMap] = await Promise.all([
    getQuotes(picked.map(listingOf)),
    watchersFor(symbols), // the human watcher stack per find (D78) — [] for most leads
  ]);

  // 30-day closes power the redesign's heat ranking + sparklines (mirror of
  // web/app/market/page.tsx). Daily bars exist only for tracked names, so backfill any
  // find with too little history once (then it's cached); the rest renormalize.
  const closesBySym = new Map<string, { date: Date; closeCents: number }[]>();
  const listings = picked.map(listingOf);
  await Promise.all(listings.map(async (s) => closesBySym.set(s, await getCloses(s, 40))));
  const missing = listings.filter((s) => (closesBySym.get(s)?.length ?? 0) < 8);
  if (missing.length) {
    await refreshBars(missing, "3mo").catch(() => 0);
    await Promise.all(missing.map(async (s) => closesBySym.set(s, await getCloses(s, 40))));
  }

  const finds = picked.map((d) => {
    const sym = d.symbol as string;
    const u = uBy.get(sym);
    const listing = listingOf(d);
    const q = quotes.get(listing);
    const cur = q?.midCents ?? null;
    const nearBps = cur && d.targetNearCents != null ? Math.round(((d.targetNearCents - cur) / cur) * 10_000) : null;
    const farBps = cur && d.targetFarCents != null ? Math.round(((d.targetFarCents - cur) / cur) * 10_000) : null;
    const spark = (closesBySym.get(listing) ?? []).slice(-30).map((c) => c.closeCents);
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
      // FMP-confirmed company name for the resolved listing (D51) > tracked name > ticker.
      name: d.companyName ?? u?.name ?? sym,
      logoUrl: u?.logoUrl || fmpLogo(listing),
      currency: u?.currency ?? null,
      cur,
      // The live-quote key: the phone polls /api/quotes by this (the resolved listing).
      quoteSymbol: listing,
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
      tag: [u?.exchange ?? d.exchange, u?.sector].filter(Boolean).join(" · ") || null,
      watch: watchFor(statusBy.get(sym)),
      watchers: (watchersMap.get(sym) ?? []).map((w) => ({ key: w.key, name: w.name })),
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
  // with the latest research we hold (Alfred's call, bottom line, targets, signals) so the
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
  const [universe, portfolios, congress, funds, insiders, clusters, members, fresh, narrative] = await Promise.all([
    allUniverse(),
    getPortfolios(),
    getCongressLeaderboard(90, 8),
    getFundsPilingIn(8),
    getInsiderTopBuys(14, 10),
    getInsiderClusters(30, 8),
    getCongressMembers(180, 8), // the tracked-congress "personal account" cards (Pelosi…)
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
      // Full card metadata (web PortfolioCard parity — GRQ Go's collapsible cards).
      firm: p.firm,
      blurb: p.blurb,
      avatar: p.avatar ?? null,
      holdingsCount: p.holdingsCount,
      hasPuts: p.hasPuts,
      perf1yPct: p.perf1yPct ?? null,
      securitiesAdded: p.securitiesAdded ?? null,
      securitiesRemoved: p.securitiesRemoved ?? null,
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
    // Tracked members of Congress — disclosed-trade cards (no 13F applies).
    members: members
      .filter((m) => m.trades.length > 0)
      .map((m) => ({
        slug: m.person.slug,
        name: m.person.name,
        role: m.person.role,
        blurb: m.person.blurb,
        avatar: m.person.avatar ?? null,
        trades: m.trades.map((t) => ({
          symbol: t.symbol,
          side: t.side,
          amountRange: t.amountRange,
          txnDate: t.txnDate,
          overlap: overlap.get(t.symbol) ?? null,
        })),
      })),
    congress: congress.map((c) => ({
      symbol: c.symbol,
      name: tidyName(c.assetName),
      primary: `${c.buyers} member${c.buyers > 1 ? "s" : ""}`,
      secondary: `${c.trades} trade${c.trades > 1 ? "s" : ""}`,
      value: c.buyers, // magnitude-bar scale (web Leaderboard parity)
      overlap: overlap.get(c.symbol) ?? null,
    })),
    funds: funds.map((f) => ({
      symbol: f.symbol,
      name: tidyName(f.name),
      primary: `${f.funds} fund${f.funds > 1 ? "s" : ""}`,
      secondary: fmtUsd(f.totalValueUsd),
      value: f.funds,
      overlap: overlap.get(f.symbol) ?? null,
    })),
    insiders: insiders.map((t) => ({
      symbol: t.symbol,
      name: t.insiderName.length > 26 ? `${t.insiderName.slice(0, 26)}…` : t.insiderName,
      primary: fmtUsd(t.valueUsd),
      secondary: t.insiderTitle ? t.insiderTitle.split(/[,:]/)[0] : null,
      value: t.valueUsd,
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

// External/personal accounts (SnapTrade — TD TFSA etc.) for the mobile "Accounts" screen.
// Mirrors the web /accounts page: VISIBILITY ONLY (read-only at source, never traded),
// the signed-in member first, then the other member. Reuses the same store the web uses
// (lib/external/store.accountsForMembers) so mobile sees identical holdings.
export async function accountsResponse(meEmail: string) {
  const everyone = memberEmails();
  const ordered = [meEmail, ...everyone.filter((e) => e !== meEmail)];
  const [views, dailyRows, allU, fxUsdCad] = await Promise.all([
    accountsForMembers(ordered),
    // The nightly personal-value series (ExternalDailyValue) — powers the app's
    // Personal tape. Last ~30 points per member, CAD-valued.
    prisma.externalDailyValue.findMany({
      where: { ownerEmail: { in: ordered } },
      orderBy: { date: "asc" },
    }),
    allUniverse(),
    usdCadRate(), // the app renders NAV in CAD with the US$ equivalent below
  ]);
  // Company logos for the personal book — tracked names use their resolved logo,
  // the rest FMP's ticker-keyed image (join on the bare yahoo ticker, the
  // universe-symbol convention for external symbols).
  const logoByBare = new Map<string, string>();
  for (const u of allU) {
    if (u.status === "RETIRED" || !u.logoUrl) continue;
    const key = bareTicker(u.yahoo || u.symbol).toUpperCase();
    if (!logoByBare.has(key)) logoByBare.set(key, u.logoUrl);
  }
  const dailyBy = new Map<string, { date: string; valueCents: number }[]>();
  for (const d of dailyRows) {
    const arr = dailyBy.get(d.ownerEmail) ?? [];
    arr.push({ date: d.date, valueCents: d.totalCadCents });
    dailyBy.set(d.ownerEmail, arr);
  }
  return {
    fxUsdCad,
    members: views.map((v) => ({
      email: v.email,
      name: personByEmail(v.email)?.name ?? v.email,
      isSelf: v.email === meEmail,
      connected: v.connected,
      dailyValues: (dailyBy.get(v.email) ?? []).slice(-30),
      accounts: v.accounts.map((a) => ({
        id: a.id,
        institution: a.institution,
        name: a.name,
        numberMasked: a.numberMasked,
        accountType: a.accountType,
        currency: a.currency,
        totalValueCents: a.totalValueCents,
        cashCents: a.cashCents,
        disabled: a.disabled,
        syncedAt: a.syncedAt,
        authorizationId: a.authorizationId, // the one-tap Reconnect key (app parity, D107)
        holdings: a.holdings.map((h) => ({
          symbol: h.symbol,
          description: h.description,
          qty: h.qty,
          priceCents: h.priceCents,
          marketValueCents: h.marketValueCents,
          currency: h.currency,
          openPnlCents: h.openPnlCents,
          quoteSymbol: h.quoteSymbol,
          logoUrl: logoByBare.get(bareTicker(h.quoteSymbol).toUpperCase()) ?? fmpLogo(h.quoteSymbol),
        })),
      })),
    })),
  };
}

// Chess Moves (docs/CHESS-MOVES.md) for mobile — the value-chain boards + ripple plays.
// List = non-retired themes newest-first with a tickers preview; detail = the parsed board,
// the heat-ranked plays (reusing lib/chess.buildPlayViews), the thesis + confidence levers.
export async function chessListResponse() {
  const themes = await prisma.chessTheme.findMany({
    where: { status: { not: "RETIRED" } },
    orderBy: { createdAt: "desc" },
    take: 40,
    include: { _count: { select: { plays: true } }, plays: { orderBy: { rank: "asc" }, take: 6, select: { symbol: true } } },
  });
  return {
    themes: themes.map((t) => ({
      id: t.id,
      title: t.title,
      anchor: t.anchor,
      kind: t.kind,
      status: t.status,
      bottomLine: t.bottomLine,
      requestedBy: t.requestedBy,
      createdAt: t.createdAt.toISOString(),
      playCount: t._count.plays,
      tickers: t.plays.map((p) => p.symbol),
    })),
  };
}

export async function chessBoardResponse(id: number) {
  const t = await prisma.chessTheme.findUnique({ where: { id }, include: { plays: { orderBy: { rank: "asc" } } } });
  if (!t || t.status === "RETIRED") return null;
  const board = parseBoard(t.boardJson);
  const plays = t.status === "READY" ? await buildPlayViews(t.plays) : [];
  const levers = parseConfidenceLevers(t.confidenceLeversJson);
  return {
    id: t.id,
    title: t.title,
    anchor: t.anchor,
    kind: t.kind,
    status: t.status,
    thesis: t.thesis,
    bottomLine: t.bottomLine,
    requestedBy: t.requestedBy,
    completedAt: (t.completedAt ?? t.createdAt).toISOString(),
    board, // { stages:[{label,role,items:[{symbol,name,note}]}], links:[{from,to,label}] }
    levers, // [{ gap, direction, magnitude, kind, trigger, retrievable }]
    plays: plays.map((p) => ({
      id: p.id,
      symbol: p.sym,
      name: p.name,
      role: p.role,
      direction: p.direction,
      effectOrder: p.effectOrder,
      thesis: p.thesis,
      conviction: p.conviction,
      obscurity: p.obscurity,
      tag: p.tag,
      logoUrl: p.logoUrl,
      currency: p.currency,
      lastCents: p.cur,
      change30d: p.change30d,
      heat: p.heat,
      tracked: p.tracked,
      stance: p.stance,
    })),
  };
}

// --- Experiments: Second Opinions (race) · Bull Race · Options Desk · Report Card ---
// Compact, mobile-shaped distillations of the web loaders (standings/leaderboards; full
// trade/call history stays on the web). All sandboxes/research — never the live fund.

export async function raceResponse() {
  const { models, fxUsdCad } = await loadStandings();
  return {
    fxUsdCad,
    models: models.map((m) => ({
      model: m.model, label: m.label, role: m.role,
      pnlCadCents: m.pnlCadCents, scoredCalls: m.scoredCalls, greens: m.greens,
      hitRate: m.hitRate, avgReturnBps: m.avgReturnBps, vsBenchmarkBps: m.vsBenchmarkBps,
      totalCalls: m.totalCalls, avgConfidence: m.avgConfidence, spark: m.spark,
    })),
  };
}

export async function bullsResponse(id?: number) {
  const [races, data] = await Promise.all([listRaces(), loadBullRace(id)]);
  return {
    races: races.map((r) => ({ id: r.id, name: r.name, status: r.status, leaderReturnPct: r.leader?.returnPct ?? null })),
    current: data && {
      race: { id: data.race.id, name: data.race.name, status: data.race.status, startingStakeCents: data.race.startingStakeCents },
      realFundReturnPct: data.realFund?.returnPct ?? null,
      bulls: data.bulls.map((b) => ({
        entrantId: b.entrantId, label: b.label, model: b.model, dial: b.dial,
        navCadCents: b.navCadCents, returnPct: b.returnPct, cashPct: b.cashPct, tradeCount: b.tradeCount,
        holdings: b.holdings.map((h) => ({ symbol: h.symbol, qty: h.qty, mvCadCents: h.mvCadCents, unrealCadCents: h.unrealCadCents })),
      })),
    },
  };
}

export async function deskResponse(id?: number) {
  const [desks, data] = await Promise.all([listDesks(), loadDesk(id)]);
  return {
    desks: desks.map((d) => ({ id: d.id, name: d.name, status: d.status })),
    current: data && {
      desk: { id: data.desk.id, name: data.desk.name, status: data.desk.status, startingStakeCents: data.desk.startingStakeCents },
      realFundReturnPct: data.realFund?.returnPct ?? null,
      arms: data.arms.map((a) => ({
        entrantId: a.entrantId, label: a.label, arm: a.arm, returnPct: a.returnPct,
        navCadCents: a.navCadCents, openOptionCount: a.openOptionCount, tradeCount: a.tradeCount,
        holdings: a.holdings.map((h) => ({
          kind: h.kind, underlying: h.underlying, qty: h.qty, mvCadCents: h.mvCadCents, unrealCadCents: h.unrealCadCents,
          strikeCents: h.strikeCents ?? null, expiry: h.expiry ?? null, daysLeft: h.daysLeft ?? null, card: h.card ?? null,
        })),
        resolved: a.resolved.map((r) => ({ kind: r.kind, underlying: r.underlying, returnPct: r.returnPct, realizedPnlCents: r.realizedPnlCents, card: r.card })),
      })),
    },
  };
}

export async function reportCardResponse() {
  const rc = await loadReportCard();
  const t = (x: typeof rc.overall) => ({ graded: x.graded, pending: x.pending, green: x.green, hitRate: x.hitRate, avgCalledReturnBps: x.avgCalledReturnBps });
  return {
    asOf: rc.asOf.toISOString(),
    overall: t(rc.overall),
    bySource: rc.bySource.map((s) => ({ source: s.source, label: s.label, tally: t(s.tally) })),
    byEffectOrder: rc.byEffectOrder.map((e) => ({ order: e.order, tally: t(e.tally) })),
    rows: rc.rows.slice(0, 60).map((r) => ({
      id: r.id, source: r.source, symbol: r.symbol, currency: r.currency, direction: r.direction,
      label: r.label, conviction: r.conviction, context: r.context, predictedAt: r.predictedAt.toISOString(),
      entryPriceCents: r.entryPriceCents, markCents: r.markCents, calledReturnBps: r.calledReturnBps,
      isGreen: r.isGreen, ageDays: r.ageDays,
    })),
  };
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

/* ---------- /api/briefings — Alfred's printouts (GRQ Go's Portfolio) ----------
 * The full desk output, newest first: pre-market read → morning plan → intraday
 * check-ins (fund-level only, symbol:null — the house rule) → midday brief →
 * EOD close → weekly review. Journal rows carry the intraday kinds; the Report
 * table carries EOD/WEEKLY. */
export async function briefingsResponse(limit = 20) {
  const [journal, reports] = await Promise.all([
    prisma.journalEntry.findMany({
      where: {
        kind: "RESEARCH",
        symbol: null,
        OR: [
          { title: { startsWith: "Pre-morning read" } },
          { title: { startsWith: "Game plan" } },
          { title: { startsWith: "Midday brief" } },
          { title: { contains: "check-in", mode: "insensitive" } },
        ],
      },
      orderBy: { at: "desc" },
      take: limit,
    }),
    prisma.report.findMany({ where: { kind: { in: ["EOD", "WEEKLY"] } }, orderBy: { date: "desc" }, take: 10 }),
  ]);
  const kindOf = (t: string): string =>
    t.startsWith("Pre-morning read") ? "premarket"
    : t.startsWith("Game plan") ? "plan"
    : t.startsWith("Midday brief") ? "midday"
    : "checkin";
  const items = [
    ...journal.map((j) => ({ id: `j${j.id}`, at: j.at.toISOString(), kind: kindOf(j.title), title: j.title, body: j.body })),
    ...reports.map((r) => ({
      id: `r${r.id}`,
      at: (r.createdAt ?? r.date).toISOString(),
      kind: r.kind === "EOD" ? "eod" : "weekly",
      title: r.title,
      body: r.body,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);
  return { items };
}

export async function reportDayResponse(date: string) {
  // date = YYYY-MM-DD (ET). Match the EOD report whose ET calendar date matches.
  const reports = await prisma.report.findMany({ where: { kind: "EOD" }, orderBy: { date: "desc" }, take: 120 });
  const match = reports.find((r) => etDateStr(r.date) === date);
  if (!match) return null;
  return { id: String(match.id), title: match.title, dateISO: etDateStr(match.date), bodyMarkdown: match.body };
}

/* ---------- /api/dossier/[symbol] ---------- */

// Parse a journal entry's sourcesJson ("the receipts") into a clean string[].
function parseSources(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

// The rich, web-parity dossier (2026-06-23): every panel app/stocks/[symbol]/page.tsx
// renders — position + bracket, analyst band, ratings + actions, earnings, signal
// families, peers, institutional, scoreboard, the price tape, smart money, the full
// record + trades, news, and the data-coverage map. Same Prisma/FMP source as the web
// page, so the app sees identical numbers.
export async function dossierResponse(symbol: string, opts?: { requestedBy?: string | null }) {
  const all = await allUniverse();
  // Canonicalise like the web stock page (D89): an exact symbol match first, else a non-RETIRED
  // member by bare ticker — so a stale `/api/dossier/MU.US` deep-link still resolves to bare `MU`
  // after the .US→bare rename. (mobile parity for the web /stocks/MU.US → /stocks/MU redirect.)
  const bare = (s: string) => s.toUpperCase().replace(/\.(TO|V|NE|CN|US)$/i, "");
  const req = symbol.toUpperCase();
  let entry = all.find((u) => u.symbol === req) ?? all.find((u) => u.status !== "RETIRED" && bare(u.symbol) === bare(req));
  if (!entry) {
    // Not in the universe — synthesise a row so a researched find / screened name renders
    // the SAME rich dossier as a tracked name (mirror of the web stock page's untracked
    // branch). A genuinely unknown symbol (no journal, no quote, no research) still 404s.
    const [pquote, pjournal, pending] = await Promise.all([
      getQuote(req).catch(() => null),
      prisma.journalEntry.findMany({ where: { symbol: req }, orderBy: { at: "desc" }, take: 30 }),
      prisma.researchRequest.findFirst({ where: { symbol: req, status: { in: ["QUEUED", "RUNNING"] } } }),
    ]);
    if (pjournal.length === 0 && !pquote && !pending) return null;

    // On-demand full dossier (D46): the hunt writes only LEADS — a member opening the
    // page kicks the FULL dossier, idempotently. Members only (requestedBy is null for
    // viewers), same as the web page.
    const hasResearch = pjournal.some((j) => j.kind === "RESEARCH");
    const hasFullDossier = pjournal.some((j) => j.kind === "RESEARCH" && j.title.startsWith("Dossier"));
    if (opts?.requestedBy && hasResearch && !hasFullDossier && !pending) {
      try {
        await prisma.researchRequest.create({ data: { symbol: bareTicker(req), requestedBy: opts.requestedBy } });
      } catch {
        /* best-effort — a race just means it's already queued */
      }
    }

    const listingEntry = pjournal.find((j) => j.kind === "RESEARCH" && j.exchange) ?? null;
    const yahooSyn = yahooForListing(req, listingEntry?.exchange);
    const cadSyn = /\.(TO|V|NE|CN)$/i.test(yahooSyn);
    entry = {
      symbol: req,
      yahoo: yahooSyn,
      name: pjournal.find((j) => j.companyName)?.companyName ?? req,
      tier: null,
      status: "CANDIDATE",
      addedBy: null,
      promotionRequestedBy: null,
      proposedTier: null,
      note: null,
      logoUrl: fmpLogo(yahooSyn),
      sector: null,
      industry: null,
      country: cadSyn ? "CA" : "US",
      currency: cadSyn ? "CAD" : "USD",
      exchange: listingEntry?.exchange ?? null,
      marketCapM: null,
    } as UniverseRow;
  }
  const sym = entry.symbol; // use the CANONICAL symbol for every downstream lookup, not the request

  // Members watching this name (D78) — key+name only (iOS picks the bundled avatar).
  const stockWatchers = ((await watchersFor([sym])).get(sym) ?? []).map((w) => ({ key: w.key, name: w.name }));

  const y = entry.yahoo;
  const cadListing = /\.(TO|V|NE|CN)$/i.test(y);
  const fmp = fmpEnabled();

  const [
    quote, journal, signals, sigFull, analyst, directiveRow, pendingResearch, peersRaw,
    position, tradesRaw, watch, settings, grades, gradeActionsRaw, gradesTrend, targetTrend,
    earnings, newsRaw, institutional, holdersRaw, scoreboardRaw, closesRaw, smart,
    optionsRow, socialRow, personalRaw, chessRefs,
  ] = await Promise.all([
    getQuote(sym).catch(() => null),
    prisma.journalEntry.findMany({ where: { symbol: sym }, orderBy: { at: "desc" }, take: 50 }),
    contractSignals(sym).catch(() => null),
    computeSignals(sym).catch(() => null),
    fmp ? fmpAnalystTarget(y).catch(() => null) : Promise.resolve(null),
    prisma.symbolDirective.findUnique({ where: { symbol: sym } }).catch(() => null),
    prisma.researchRequest.count({ where: { symbol: sym, status: { in: ["QUEUED", "RUNNING"] } } }).catch(() => 0),
    fmp ? fmpPeerComparison(y).catch(() => []) : Promise.resolve([]),
    prisma.position.findUnique({ where: { symbol: sym } }).catch(() => null),
    prisma.trade.findMany({ where: { symbol: sym }, orderBy: { at: "desc" }, take: 50 }).catch(() => []),
    prisma.agentFocus.findUnique({ where: { symbol: sym } }).catch(() => null),
    prisma.settings.findUnique({ where: { id: 1 } }).catch(() => null),
    fmp ? fmpGrades(y).catch(() => null) : Promise.resolve(null),
    fmp ? fmpGradeActions(y).catch(() => []) : Promise.resolve([]),
    fmp ? fmpGradesTrend(y).catch(() => null) : Promise.resolve(null),
    fmp ? fmpTargetTrend(y).catch(() => null) : Promise.resolve(null),
    fmp ? fmpEarningsReport(y).catch(() => null) : Promise.resolve(null),
    fmp ? fmpStockNews(y, 5).catch(() => []) : Promise.resolve([]),
    fmp ? fmpInstitutional(y).catch(() => null) : Promise.resolve(null),
    fmp ? fmpTopHolders(y).catch(() => []) : Promise.resolve([]),
    getScoreboard(sym).catch(() => []),
    getCloses(sym, 180).catch(() => []),
    getSmartMoneyForSymbol(bareTicker(sym)).catch(() => null),
    // Tier 3/8 — US-centric feeds; CA names come back uncovered (null).
    getOptions(bareTicker(sym)).catch(() => null),
    getSocial(bareTicker(sym)).catch(() => null),
    // Members' own money in this name (members-only — viewers/agents never see it, D97).
    opts?.requestedBy ? personalPositionsFor(memberEmails(), y).catch(() => []) : Promise.resolve([]),
    // Chess Moves boards that feature this name (the value-chain cards).
    chessRefsForSymbol(sym).catch(() => []),
  ]);

  const currentReadEntry = journal.find((j) => j.kind === "RESEARCH" || j.kind === "DECISION");
  const stanceEntry = journal.find((j) => j.stance);
  const targetEntry = journal.find((j) => j.targetFarCents != null || j.targetNearCents != null);
  const bottomLineEntry = journal.find((j) => j.bottomLine);
  const cur = quote?.midCents ?? null;
  const farBps = cur && targetEntry?.targetFarCents ? Math.round(((targetEntry.targetFarCents - cur) / cur) * 10_000) : null;
  const nearWeeks = targetEntry?.targetNearDays ? Math.max(1, Math.round(targetEntry.targetNearDays / 5)) : null;

  const rec = sigFull ? overallSignal(sigFull) : null;
  const recMeta = rec ? stanceMeta(rec.label) : null;
  const peers = peersRaw as Array<{ symbol: string; name: string; self: boolean; peTtm: number | null; pbTtm: number | null; marketCapM: number | null }>;
  const selfPeer = peers.find((p) => p.self);
  const dial = DIALS[settings?.riskLevel ?? "BALANCED"];

  // Held position + the deterministic bracket (stop / take-profit off the risk dial).
  const positionOut =
    position && cur != null
      ? {
          qty: position.qty,
          avgCostCents: position.avgCostCents,
          openedAt: position.openedAt.toISOString(),
          marketValueCents: position.qty * cur,
          unrealizedPnlCents: position.qty * (cur - position.avgCostCents),
          stopPct: dial.stopPct,
          takeProfitPct: dial.takeProfitPct,
          autoStopCents: Math.round(position.avgCostCents * (1 - dial.stopPct / 100)),
          takeProfitCents: Math.round(position.avgCostCents * (1 + dial.takeProfitPct / 100)),
        }
      : null;

  // Analyst price-target band, re-anchored to this listing's currency for CDRs/cross-
  // listings (same scale-invariant rescale the web page uses).
  let analystBand: {
    nowCents: number; consensusCents: number; lowCents: number; highCents: number;
    currency: string; upsidePct: number; reanchored: boolean;
    trendChangePct: number | null; trendRecentCount: number | null;
  } | null = null;
  if (analyst) {
    const pageCur = entry.currency ?? (cadListing ? "CAD" : "USD");
    const reanchor = cur != null && analyst.currency.toUpperCase() !== pageCur.toUpperCase();
    const usNow = analyst.upsidePct !== -1 ? analyst.consensusCents / (1 + analyst.upsidePct) : analyst.consensusCents;
    const anchor = reanchor ? (cur as number) : usNow;
    const sc = (v: number) => (usNow > 0 ? Math.round((anchor * v) / usNow) : v);
    analystBand = {
      nowCents: Math.round(anchor),
      consensusCents: sc(analyst.consensusCents),
      lowCents: sc(analyst.lowCents),
      highCents: sc(analyst.highCents),
      currency: reanchor ? pageCur : analyst.currency,
      upsidePct: analyst.upsidePct,
      reanchored: reanchor,
      trendChangePct: targetTrend?.changePct ?? null,
      trendRecentCount: targetTrend?.recentCount ?? null,
    };
  }

  const gradeActions = gradeActionsRaw as Array<{ company: string; action: string; fromGrade: string; toGrade: string; date: string }>;
  const gradesOut = grades
    ? {
        consensus: grades.consensus,
        total: grades.total,
        strongBuy: grades.strongBuy,
        buy: grades.buy,
        hold: grades.hold,
        sell: grades.sell,
        strongSell: grades.strongSell,
        trendDirection: gradesTrend?.direction ?? null,
        buyDelta: gradesTrend?.buyDelta ?? null,
        sellDelta: gradesTrend?.sellDelta ?? null,
        trendMonths: gradesTrend?.months ?? null,
        actions: gradeActions.slice(0, 6).map((a) => ({ company: a.company, action: a.action, fromGrade: a.fromGrade, toGrade: a.toGrade, date: a.date })),
      }
    : null;

  const earningsOut =
    earnings && (earnings.next || earnings.last)
      ? {
          next: earnings.next
            ? { date: earnings.next.date, epsEstimated: earnings.next.epsEstimated, epsActual: earnings.next.epsActual, revenueEstimated: earnings.next.revenueEstimated, revenueActual: earnings.next.revenueActual }
            : null,
          last: earnings.last
            ? { date: earnings.last.date, epsEstimated: earnings.last.epsEstimated, epsActual: earnings.last.epsActual, revenueEstimated: earnings.last.revenueEstimated, revenueActual: earnings.last.revenueActual }
            : null,
        }
      : null;

  const holders = holdersRaw as Array<{ name: string; isNew: boolean; ownershipPct: number; sharesChangePct: number }>;
  const institutionalOut = institutional
    ? {
        investorsHolding: institutional.investorsHolding,
        investorsHoldingChange: institutional.investorsHoldingChange,
        date: institutional.date,
        holders: holders.slice(0, 6).map((h) => ({ name: h.name, isNew: h.isNew, ownershipPct: h.ownershipPct, sharesChangePct: h.sharesChangePct })),
      }
    : null;

  const news = newsRaw as Array<{ title: string; url: string; publisher: string; at: string }>;
  const insiderBuys = smart?.insiderBuyers ?? 0;
  const coverage: Array<{ tier: number; name: string; status: string; detail: string }> = [
    { tier: 1, name: "Price/vol", status: closesRaw.length > 1 ? "live" : "partial", detail: `${closesRaw.length} sessions of OHLCV → signals` },
    { tier: 2, name: "Fundamentals", status: analyst || grades || entry.marketCapM ? "live" : "none", detail: analyst ? "analyst targets · peers · ratings" : "cap/sector only" },
    { tier: 6, name: "Earnings", status: earnings ? "live" : "none", detail: earnings ? (earnings.next ? `next ${earnings.next.date}` : `last ${earnings.last?.date}`) : "no FMP coverage for this name" },
    { tier: 7, name: "News", status: news.length > 0 ? "live" : "none", detail: news.length > 0 ? `${news.length} recent headlines` : "no FMP coverage for this name" },
    { tier: 9, name: "Macro", status: "live", detail: "BoC + FRED structured feed — rates/CPI/FX" },
    { tier: 4, name: "Insider", status: insiderBuys > 0 ? "live" : "partial", detail: insiderBuys > 0 ? `${insiderBuys} insider buy(s), 90d` : cadListing ? "CA insider via agent web-research" : "US Form 4 + OpenInsider wired — no recent buys" },
    { tier: 5, name: "Institutional", status: institutional ? "live" : "none", detail: institutional ? `${institutional.investorsHolding.toLocaleString()} institutions` : "13F is US-listed — empty for pure-TSX" },
    { tier: 3, name: "Options flow", status: "none", detail: "never traded; US-centric — later" },
    { tier: 8, name: "Social", status: "none", detail: "deliberately late — noisy, gameable" },
    { tier: 10, name: "Alt data", status: "none", detail: "paid + US-centric — revisit at scale" },
  ].sort((a, b) => a.tier - b.tier);

  const smartOut =
    smart && smart.hasAny
      ? {
          hasAny: smart.hasAny,
          congressBuyers: smart.congressBuyers,
          congressSellers: smart.congressSellers,
          insiderBuyers: smart.insiderBuyers,
          insiderBuyValueUsd: smart.insiderBuyValueUsd,
          fundHolders: smart.fundHolders.slice(0, 6).map((f) => ({ name: f.name, firm: f.firm, asOf: f.asOf, pctOfPort: f.pctOfPort, action: f.action, putCall: f.putCall })),
          people: smart.people.slice(0, 6).map((pp) => ({
            name: pp.name,
            role: pp.role,
            lastSide: pp.trades[0]?.side ?? null,
            lastAmountRange: pp.trades[0]?.amountRange ?? null,
            lastTxnDate: pp.trades[0]?.txnDate ?? null,
          })),
        }
      : null;

  const trades = tradesRaw as Array<{ id: number; side: string; qty: number; priceCents: number; realizedPnlCents: number | null; at: Date }>;
  const scoreboard = scoreboardRaw as Array<{ source: string; grades: number; hits: number; misses: number; neutral: number; hitRate: number | null }>;

  const body =
    currentReadEntry?.body ??
    bottomLineEntry?.bottomLine ??
    "No dossier filed yet — the agent writes the business, the bull and bear case, and a verdict here once it researches this name.";
  const lastResearched = journal.find((j) => j.kind === "RESEARCH")?.at ?? null;

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
    filedAt: iso((currentReadEntry ?? stanceEntry ?? targetEntry)?.at ?? null),
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
    // --- stock-page parity (2026-06-23) ---
    tier: entry.tier ?? null,
    agentWatching: !!watch,
    agentNote: watch?.note ?? null,
    lastResearchedAt: iso(lastResearched),
    position: positionOut,
    analystBand,
    grades: gradesOut,
    earnings: earningsOut,
    signalFamilies: sigFull ? sigFull.families.map((f) => ({ family: f.family, signal: f.signal, confidence: f.confidence, rationale: f.rationale })) : [],
    peers: peers.map((p) => ({ symbol: p.symbol, name: p.name, self: p.self, peTtm: p.peTtm, pbTtm: p.pbTtm, marketCapM: p.marketCapM })),
    institutional: institutionalOut,
    scoreboard: scoreboard.map((s) => ({ source: s.source, grades: s.grades, hits: s.hits, misses: s.misses, neutral: s.neutral, hitRate: s.hitRate })),
    closes: closesRaw.map((c) => ({ t: c.date.getTime(), c: c.closeCents })),
    news: news.map((n) => ({ title: n.title, url: n.url, publisher: n.publisher, at: n.at })),
    coverage,
    record: journal.map((j) => ({
      id: j.id,
      kind: j.kind,
      title: j.title,
      body: j.body,
      at: j.at.toISOString(),
      agentVersion: j.agentVersion ?? null,
      sources: parseSources(j.sourcesJson),
    })),
    trades: trades.map((t) => ({ id: t.id, side: t.side, qty: t.qty, priceCents: t.priceCents, realizedPnlCents: t.realizedPnlCents ?? null, at: t.at.toISOString() })),
    smartMoney: smartOut,
    currentRead: currentReadEntry
      ? { title: currentReadEntry.title, body: currentReadEntry.body, at: currentReadEntry.at.toISOString(), sources: parseSources(currentReadEntry.sourcesJson) }
      : null,
    watchers: stockWatchers,
    // What would change our mind (D93): the agent-filed levers + the structural
    // data gaps the coverage map exposes (web page parity).
    confidenceLevers: parseConfidenceLevers(journal.find((j) => j.confidenceLeversJson)?.confidenceLeversJson),
    structuralGaps: coverage
      .filter((c) => c.status !== "live" && [2, 4, 5, 6, 7].includes(c.tier))
      .map((c) => ({ name: c.name, detail: c.detail })),
    // Tier 3 — options positioning (D88): a signal Alfred weighs; NEVER traded.
    options: optionsRow
      ? {
          line: optionsLine(optionsRow),
          regime: optionsRow.regime,
          pcOI: optionsRow.pcOI,
          pcVol: optionsRow.pcVol,
          atmIvBps: optionsRow.atmIvBps,
          asOf: optionsRow.fetchedAt.toISOString().slice(0, 10),
        }
      : null,
    // Tier 8 — social crowding (D89): a RISK signal on probation; never gates a trade.
    social: socialRow
      ? {
          line: socialLine(socialRow),
          rank: socialRow.rank,
          velocity: socialRow.velocity,
          bullPct: socialRow.bullPct,
          asOf: socialRow.fetchedAt.toISOString().slice(0, 10),
        }
      : null,
    // Related names (knowledge graph, Slice 1 — same on-the-fly build as the web page).
    related: (await relatedFor({ symbol: sym, yahoo: y, peers, sector: entry.sector ?? null, limit: 8 }).catch(() => ({ items: [] }))).items.map((r) => ({
      ticker: r.ticker,
      name: r.name,
      weight: r.weight,
      why: r.why,
      symbol: r.symbol,
      logoUrl: r.logoUrl,
      stance: r.stance,
    })),
    // Chess Moves boards featuring this name → the swipeable value-chain cards
    // (Cam 2026-07-03): one card per stage, defaulting to the stock's own stage.
    chess: chessRefs.slice(0, 2).map((r) => {
      const bare = bareChainKey(sym);
      const stages = r.board.stages.map((st) => ({
        label: st.label,
        role: st.role ?? null,
        items: st.items.map((it) => ({ symbol: it.symbol ?? null, name: it.name, note: it.note ?? null })),
      }));
      const selfStage = Math.max(
        0,
        stages.findIndex((st) => st.items.some((it) => it.symbol && bareChainKey(it.symbol) === bare)),
      );
      return {
        themeId: r.themeId,
        title: r.title,
        anchor: r.anchor,
        role: ("role" in r ? (r.role as string | null) : null) ?? null,
        thesis: ("thesis" in r ? (r.thesis as string | null) : null) ?? null,
        selfStage,
        stages,
      };
    }),
    // Members' own money in this name (bought-at = avg cost). Empty for viewers.
    personalPositions: personalRaw.map((pp) => ({
      owner: personByEmail(pp.email)?.name ?? pp.email,
      ownerKey: ownerKeyFor(pp.email),
      institution: pp.institution,
      accountType: pp.accountType,
      qty: pp.qty,
      currency: pp.currency,
      avgCostCents: pp.avgCostCents,
      marketValueCents: pp.marketValueCents,
      openPnlCents: pp.openPnlCents,
    })),
  };
}
