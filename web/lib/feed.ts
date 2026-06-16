import { prisma } from "./db";
import type { Session } from "./session";
import { getPortfolio } from "./portfolio";
import { getQuotes, getQuote } from "./broker/quotes";
import { allUniverse, type UniverseRow } from "./universe";
import { computeSignals, overallSignal } from "@/agent/signals";
import { DIALS } from "@/agent/policy";
import { etParts, etDateStr, isMarketDay, startOfEtDay } from "@/agent/calendar";
import { fmpEnabled, fmpAnalystTarget } from "./fmp";

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
  const pf = await getPortfolio();
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
      lastCents: q?.midCents ?? 0,
      dayChangeBps: q?.dayChangeBps ?? 0,
      inUniverse: r.status === "ACTIVE",
      agentCall: stanceToCall(stances.get(r.symbol)),
      directive: directiveToContract(dirBy.get(r.symbol)),
      signals: sigBy.get(r.symbol) ?? null,
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
  call: AgentCall | null;
  target: { nearCents: number | null; nearHorizon: string | null; farCents: number | null; expectedReturnBps: number | null; confidence: number | null };
  unfamiliar: boolean;
};

export async function ideasResponse(limit = 12): Promise<IdeaShape[]> {
  const all = await allUniverse();
  const nameBy = new Map(all.map((u) => [u.symbol, u.name]));
  const tierBy = new Map(all.map((u) => [u.symbol, u.tier]));

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
      call: stanceToCall(d.stance),
      target: {
        nearCents: d.targetNearCents ?? null,
        nearHorizon: nearWeeks ? `${nearWeeks}–${nearWeeks + 4} weeks` : null,
        farCents: d.targetFarCents ?? null,
        expectedReturnBps: farBps,
        confidence: d.confidence ?? null,
      },
      unfamiliar: !HOUSEHOLD.has(sym),
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

  const [pf, dayOpenSnap, todaySnaps, eod, plan, midday, latestPlan, latestResearch, xicQuote, all] = await Promise.all([
    getPortfolio(),
    prisma.navSnapshot.findFirst({ where: { at: { lt: start } }, orderBy: { at: "desc" } }),
    prisma.navSnapshot.findMany({ where: { at: { gte: start, lt: end } }, orderBy: { at: "asc" } }),
    prisma.report.findFirst({ where: { kind: "EOD", date: { gte: start, lt: end } } }),
    prisma.journalEntry.findFirst({ where: { kind: "RESEARCH", title: { startsWith: "Game plan" }, at: { gte: start, lt: end } } }),
    prisma.journalEntry.findFirst({ where: { kind: "RESEARCH", title: { startsWith: "Midday brief" }, at: { gte: start, lt: end } } }),
    prisma.journalEntry.findFirst({ where: { kind: "RESEARCH", title: { startsWith: "Game plan" } }, orderBy: { at: "desc" } }),
    prisma.journalEntry.findFirst({ where: { kind: "RESEARCH" }, orderBy: { at: "desc" } }),
    getQuote("XIC").catch(() => null),
    allUniverse(),
  ]);

  const nameBy = new Map(all.map((u) => [u.symbol, u.name]));
  const trackedSymbols = all.filter((u) => u.status !== "RETIRED").map((u) => u.symbol);
  const quotes = await getQuotes(trackedSymbols);

  const dayOpenNav = dayOpenSnap?.navCents ?? pf.contributionsCents;
  const dayPnl = pf.navCents - dayOpenNav;
  const dayPnlBps = dayOpenNav > 0 ? Math.round((dayPnl / dayOpenNav) * 10_000) : 0;

  // The tape: open → now, labelled HH:MM ET.
  const tapeSnaps = dayOpenSnap ? [dayOpenSnap, ...todaySnaps] : todaySnaps;
  const tape = tapeSnaps.map((s) => ({
    at: s.at.toLocaleTimeString("en-CA", { timeZone: "America/Toronto", hour: "2-digit", minute: "2-digit", hour12: false }),
    navCents: s.navCents,
  }));

  // Movers across the universe, biggest up then biggest down.
  const moverRows = [...quotes.entries()]
    .filter(([sym]) => nameBy.has(sym))
    .map(([sym, q]) => ({ symbol: sym, name: nameBy.get(sym) ?? sym, lastCents: q.midCents, dayChangeBps: q.dayChangeBps ?? 0 }))
    .sort((a, b) => b.dayChangeBps - a.dayChangeBps);
  const movers = [...moverRows.filter((m) => m.dayChangeBps > 0).slice(0, 5), ...moverRows.filter((m) => m.dayChangeBps < 0).slice(-5).reverse()];

  const topHitters = [...pf.positions]
    .sort((a, b) => Math.abs(b.dayChangeBps) - Math.abs(a.dayChangeBps))
    .map((p) => ({ symbol: p.symbol, name: nameBy.get(p.symbol) ?? p.symbol, lastCents: p.lastCents, dayChangeBps: p.dayChangeBps }));

  const lead = eod ?? midday ?? plan ?? latestPlan ?? latestResearch;

  return {
    edition: editionNow(),
    dateISO: etDateStr(),
    navCents: pf.navCents,
    dayPnlCents: dayPnl,
    dayPnlBps,
    benchmarkBps: xicQuote?.dayChangeBps ?? null,
    tape,
    leadStoryMarkdown: lead?.body ?? null,
    movers,
    topHitters,
    onTheRadar: await ideasResponse(8),
  };
}

function editionNow(): Edition {
  if (!isMarketDay()) return "weekend";
  const m = etParts().minutesSinceMidnight;
  if (m < 9 * 60 + 30) return "morning";
  if (m < 16 * 60) return "midday";
  return "evening";
}

/* ---------- /api/dossier/[symbol] ---------- */
export async function dossierResponse(symbol: string) {
  const sym = symbol.toUpperCase();
  const all = await allUniverse();
  const entry = all.find((u) => u.symbol === sym);
  if (!entry) return null;

  const [quote, journal, signals, analyst] = await Promise.all([
    getQuote(sym).catch(() => null),
    prisma.journalEntry.findMany({ where: { symbol: sym }, orderBy: { at: "desc" }, take: 50 }),
    contractSignals(sym).catch(() => null),
    fmpEnabled() ? fmpAnalystTarget(entry.yahoo).catch(() => null) : Promise.resolve(null),
  ]);

  const currentRead = journal.find((j) => j.kind === "RESEARCH" || j.kind === "DECISION");
  const stanceEntry = journal.find((j) => j.stance);
  const targetEntry = journal.find((j) => j.targetFarCents != null || j.targetNearCents != null);
  const bottomLineEntry = journal.find((j) => j.bottomLine);
  const cur = quote?.midCents ?? null;
  const farBps = cur && targetEntry?.targetFarCents ? Math.round(((targetEntry.targetFarCents - cur) / cur) * 10_000) : null;
  const nearWeeks = targetEntry?.targetNearDays ? Math.max(1, Math.round(targetEntry.targetNearDays / 5)) : null;

  const body =
    currentRead?.body ??
    bottomLineEntry?.bottomLine ??
    "No dossier filed yet — the agent writes the business, the bull and bear case, and a verdict here once it researches this name.";

  return {
    symbol: sym,
    name: entry.name,
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
    peRatio: null,
    freeCashFlowCents: null,
    dividendYieldBps: null,
    filedAt: iso((currentRead ?? stanceEntry ?? targetEntry)?.at ?? null),
  };
}
