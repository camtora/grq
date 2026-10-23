// Company financials — the I/O half (D140, docs/COMPANY-FINANCIALS.md). Fetch from FMP, normalise
// through derive.ts, upsert. Every table is keyed by the FMP key = the listing symbol (P0 R1).
// Display + storage only: nothing here is read by the agent (§3.1).
//
// runFinancialsRefresh() is the daily job (runner, pre-open). It is idempotent per name per feed
// (FinancialsStatus records what was checked when — `dueFeeds` is the pure rule), so a restart or a
// second run in a day costs a handful of status reads and no FMP calls.

import { prisma } from "../db";
import { fmpGetStrict, FmpError } from "../fmp";
import { etDateStr } from "../../agent/calendar";
import { allWatches } from "../watch";
import {
  toMinor, toWhole, toEps4, toCents, estimateChanged, targetsToKeep, keepFiling,
  type EstimateRow, type PeriodRow, type Split,
} from "./derive";
import type { FinancialsStatus, Prisma } from "@prisma/client";

type Row = Record<string, unknown>;
const rows = (d: unknown): Row[] => (Array.isArray(d) ? (d as Row[]) : []);
const str = (v: unknown): string | null => (v == null || v === "" ? null : String(v));
const int = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);
const enc = encodeURIComponent;

const DAY_MS = 86_400_000;

// ── Fetching: paced, retried, and never mistaking a failure for "no data" ───────────────────
// FMP rate-limits per MINUTE (a 40-call burst passes; ~75/s for a minute does not). One pacer for the
// whole process keeps this job well under the plan's limit with room for the site's own calls; a 429
// or 5xx backs off and retries; anything still failing THROWS, so the feed stays due for next time.
const MIN_GAP_MS = 200; // ≤ 5 calls/sec ≈ 300/min
let nextSlot = 0;
async function paced(): Promise<void> {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + MIN_GAP_MS;
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
}

async function fmpGet(path: string): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    await paced();
    try {
      return await fmpGetStrict<unknown>(path);
    } catch (e) {
      const status = e instanceof FmpError ? e.status : 0;
      const retryable = status === 429 || status === 0 || status >= 500;
      if (!retryable || attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, (status === 429 ? 15_000 : 2_000) * (attempt + 1)));
    }
  }
}
const WEEK_MS = 7 * DAY_MS;

// ── Which names ──────────────────────────────────────────────────────────────────────────────

export type FinTarget = { key: string; deep: boolean }; // key = FMP key (listing symbol)

/** Tracked = every non-retired universe name. Deep (segments' sibling feeds that cost more: filings,
 *  call summaries) = ACTIVE + held + watched + Alfred's focus. Untracked names are fetched on demand
 *  when someone opens their page (`ensureFinancials`), never by this job. */
export async function financialsTargets(): Promise<FinTarget[]> {
  const [members, positions, watches, focus] = await Promise.all([
    prisma.universeMember.findMany({ where: { status: { not: "RETIRED" } }, select: { symbol: true, yahoo: true, status: true } }),
    prisma.position.findMany({ select: { symbol: true } }),
    allWatches(),
    prisma.agentFocus.findMany({ select: { symbol: true } }),
  ]);
  const deepSyms = new Set<string>([...positions.map((p) => p.symbol), ...watches.keys(), ...focus.map((f) => f.symbol)].map((s) => s.toUpperCase()));
  return members.map((m) => ({ key: m.yahoo.toUpperCase(), deep: m.status === "ACTIVE" || deepSyms.has(m.symbol.toUpperCase()) }));
}

// ── What is due (pure) ───────────────────────────────────────────────────────────────────────

export type Feed = "profile" | "statements" | "estimates" | "health" | "segments" | "filings" | "insider" | "calls";

/** Which feeds a name needs now. Statements: weekly, but DAILY once the newest quarter we hold is
 *  80+ days old (the next report is due — P0 R11). ETFs/funds stop after the profile. */
export function dueFeeds(st: Pick<FinancialsStatus, "profileAt" | "statementsAt" | "latestPeriodEnd" | "estimatesDay" | "healthAt" | "segmentsAt" | "filingsDay" | "insiderAt" | "callsDay" | "isEtf" | "isFund" | "usFiler" | "statementsCovered"> | null, deep: boolean, now: Date, today: string): Feed[] {
  const older = (d: Date | null | undefined, maxMs: number) => !d || now.getTime() - d.getTime() > maxMs;
  const out: Feed[] = [];
  if (!st || older(st.profileAt, WEEK_MS)) out.push("profile");
  if (st && (st.isEtf || st.isFund)) return out;
  const newQuarterDue = st?.latestPeriodEnd != null && now.getTime() - Date.parse(`${st.latestPeriodEnd}T00:00:00Z`) > 80 * DAY_MS;
  if (!st || older(st.statementsAt, WEEK_MS) || (newQuarterDue && older(st.statementsAt, 20 * 3600_000))) out.push("statements");
  if (st?.statementsCovered === false) return out; // nothing to estimate or score until statements exist
  if (st?.estimatesDay !== today) out.push("estimates");
  if (!st || older(st.healthAt, WEEK_MS)) out.push("health");
  if (!st || older(st.segmentsAt, WEEK_MS)) out.push("segments");
  const us = st?.usFiler ?? false;
  if (us && deep && st?.filingsDay !== today) out.push("filings");
  if (us && (!st || older(st.insiderAt, WEEK_MS))) out.push("insider");
  if (deep && st?.callsDay !== today) out.push("calls");
  return out;
}

// ── Feeds ────────────────────────────────────────────────────────────────────────────────────

const US_EXCHANGES = new Set(["NASDAQ", "NYSE", "AMEX", "NYSEARCA", "BATS", "CBOE"]);

async function refreshProfile(key: string): Promise<void> {
  const [p] = rows(await fmpGet(`profile?symbol=${enc(key)}`));
  const splits = rows(await fmpGet(`splits?symbol=${enc(key)}`))
    .map((s) => ({ date: String(s.date ?? ""), numerator: Number(s.numerator), denominator: Number(s.denominator) }))
    .filter((s) => s.date && s.numerator > 0 && s.denominator > 0);
  const data = {
    companyName: str(p?.companyName),
    sector: str(p?.sector),
    industry: str(p?.industry),
    isEtf: p?.isEtf === true,
    isFund: p?.isFund === true,
    usFiler: !!p?.cik && US_EXCHANGES.has(String(p?.exchange ?? "").toUpperCase()),
    splits: splits as unknown as Prisma.InputJsonValue,
    profileAt: new Date(),
  };
  await prisma.financialsStatus.upsert({ where: { symbol: key }, create: { symbol: key, ...data }, update: data });
}

async function refreshStatements(key: string): Promise<void> {
  const get = (kind: string, period: string, limit: number) => fmpGet(`${kind}?symbol=${enc(key)}&period=${period}&limit=${limit}`).then(rows);
  const [iq, cq, bq, ia, ca, ba] = await Promise.all([
    get("income-statement", "quarter", 12),
    get("cash-flow-statement", "quarter", 12),
    get("balance-sheet-statement", "quarter", 12),
    get("income-statement", "annual", 5),
    get("cash-flow-statement", "annual", 5),
    get("balance-sheet-statement", "annual", 5),
  ]);
  const merged = new Map<string, { i?: Row; c?: Row; b?: Row }>();
  const add = (list: Row[], slot: "i" | "c" | "b") => {
    for (const r of list) {
      const k = `${r.period}|${r.date}`;
      const m = merged.get(k) ?? {};
      m[slot] = r;
      merged.set(k, m);
    }
  };
  add([...iq, ...ia], "i");
  add([...cq, ...ca], "c");
  add([...bq, ...ba], "b");

  let latestQ: string | null = null;
  for (const { i, c, b } of merged.values()) {
    if (!i) continue; // the income statement anchors a period
    const period = String(i.period ?? "");
    const periodEnd = String(i.date ?? "");
    const fiscalYear = Number(i.fiscalYear);
    if (!period || !periodEnd || !Number.isFinite(fiscalYear)) continue;
    if (/^Q[1-4]$/.test(period) && (!latestQ || periodEnd > latestQ)) latestQ = periodEnd;
    const cashOnly = toMinor(b?.cashAndShortTermInvestments) ?? toMinor(b?.cashAndCashEquivalents);
    const data = {
      fiscalYear,
      filingDate: str(i.filingDate),
      acceptedAt: str(i.acceptedDate),
      currency: String(i.reportedCurrency ?? "USD"),
      revenue: toMinor(i.revenue),
      costOfRevenue: toMinor(i.costOfRevenue),
      grossProfit: toMinor(i.grossProfit),
      operatingIncome: toMinor(i.operatingIncome),
      netIncome: toMinor(i.netIncome),
      ebitda: toMinor(i.ebitda),
      epsDiluted4: toEps4(i.epsDiluted),
      sharesDiluted: toWhole(i.weightedAverageShsOutDil),
      operatingCashFlow: toMinor(c?.operatingCashFlow ?? c?.netCashProvidedByOperatingActivities),
      capex: toMinor(c?.capitalExpenditure ?? c?.investmentsInPropertyPlantAndEquipment),
      freeCashFlow: toMinor(c?.freeCashFlow),
      buybacks: toMinor(c?.commonStockRepurchased),
      dividendsPaid: toMinor(c?.commonDividendsPaid),
      stockComp: toMinor(c?.stockBasedCompensation),
      cash: cashOnly,
      totalDebt: toMinor(b?.totalDebt),
      totalAssets: toMinor(b?.totalAssets),
      totalEquity: toMinor(b?.totalStockholdersEquity ?? b?.totalEquity),
      raw: { income: i, cashflow: c ?? null, balance: b ?? null } as unknown as Prisma.InputJsonValue,
      fetchedAt: new Date(),
    };
    await prisma.financialPeriod.upsert({
      where: { symbol_period_periodEnd: { symbol: key, period, periodEnd } },
      create: { symbol: key, period, periodEnd, ...data },
      update: data,
    });
  }
  const covered = iq.length > 0 || ia.length > 0;
  await prisma.financialsStatus.update({
    where: { symbol: key },
    data: { statementsAt: new Date(), statementsCovered: covered, ...(latestQ ? { latestPeriodEnd: latestQ } : {}) },
  });
}

function estimateValues(r: Row) {
  return {
    revenueAvg: toMinor(r.revenueAvg),
    revenueLow: toMinor(r.revenueLow),
    revenueHigh: toMinor(r.revenueHigh),
    netIncomeAvg: toMinor(r.netIncomeAvg),
    epsAvg4: toEps4(r.epsAvg),
    epsLow4: toEps4(r.epsLow),
    epsHigh4: toEps4(r.epsHigh),
    analystsRevenue: int(r.numAnalystsRevenue),
    analystsEps: int(r.numAnalystsEps),
  };
}

/** Snapshot the consensus for the next 3 fiscal years and next 4 quarters, writing a row only when
 *  it moved (P0 R7: this history is the only history there is). */
async function refreshEstimates(key: string, today: string): Promise<void> {
  const [fy, qt] = await Promise.all([
    fmpGet(`analyst-estimates?symbol=${enc(key)}&period=annual&limit=30`).then(rows),
    fmpGet(`analyst-estimates?symbol=${enc(key)}&period=quarter&limit=40`).then(rows), // P0 R7: limit≥20 reaches the near quarters
  ]);
  for (const [period, list, n] of [["FY", fy, 3], ["Q", qt, 4]] as const) {
    const keep = new Set(targetsToKeep(list.map((r) => ({ date: String(r.date ?? "") })), today, n));
    for (const r of list) {
      const targetEnd = String(r.date ?? "");
      if (!keep.has(targetEnd)) continue;
      const v = estimateValues(r);
      const last = await prisma.estimateSnapshot.findFirst({ where: { symbol: key, period, targetEnd }, orderBy: { asOf: "desc" } });
      if (last && !estimateChanged(last, v)) {
        if (last.lastSeen !== today) await prisma.estimateSnapshot.update({ where: { id: last.id }, data: { lastSeen: today } });
        continue;
      }
      await prisma.estimateSnapshot.upsert({
        where: { symbol_period_targetEnd_asOf: { symbol: key, period, targetEnd, asOf: today } },
        create: { symbol: key, period, targetEnd, asOf: today, lastSeen: today, ...v },
        update: { ...v, lastSeen: today },
      });
    }
  }
  await prisma.financialsStatus.update({ where: { symbol: key }, data: { estimatesDay: today } });
}

async function refreshHealth(key: string, today: string): Promise<void> {
  const [[sc], [fl], [rt], [dcf]] = await Promise.all([
    fmpGet(`financial-scores?symbol=${enc(key)}`).then(rows),
    fmpGet(`shares-float?symbol=${enc(key)}`).then(rows),
    fmpGet(`ratings-snapshot?symbol=${enc(key)}`).then(rows),
    fmpGet(`discounted-cash-flow?symbol=${enc(key)}`).then(rows),
  ]);
  const freeFloat = typeof fl?.freeFloat === "number" && Number.isFinite(fl.freeFloat) ? Math.round(fl.freeFloat * 100) : null;
  const data = {
    currency: str(sc?.reportedCurrency),
    piotroski: int(sc?.piotroskiScore),
    altmanZ: typeof sc?.altmanZScore === "number" && Number.isFinite(sc.altmanZScore) ? sc.altmanZScore : null,
    freeFloatBps: freeFloat,
    floatShares: toWhole(fl?.floatShares),
    sharesOutstanding: toWhole(fl?.outstandingShares),
    fmpRating: str(rt?.rating),
    fmpRatingScore: int(rt?.overallScore),
    fmpDcfCents: toCents(dcf?.dcf),
    fmpDcfPriceCents: toCents(dcf?.["Stock Price"]),
    fetchedAt: new Date(),
  };
  await prisma.companyHealth.upsert({ where: { symbol_date: { symbol: key, date: today } }, create: { symbol: key, date: today, ...data }, update: data });
  await prisma.financialsStatus.update({ where: { symbol: key }, data: { healthAt: new Date() } });
}

async function refreshSegments(key: string): Promise<void> {
  for (const kind of ["product", "geographic"] as const) {
    for (const period of ["quarter", "annual"]) {
      const list = rows(await fmpGet(`revenue-${kind}-segmentation?symbol=${enc(key)}&period=${period}`));
      for (const r of list.slice(0, 12)) {
        const periodEnd = String(r.date ?? "");
        const p = String(r.period ?? (period === "annual" ? "FY" : ""));
        if (!periodEnd || !p || !r.data || typeof r.data !== "object") continue;
        const data: Record<string, number> = {};
        for (const [name, v] of Object.entries(r.data as Row)) {
          const m = toMinor(v);
          if (m != null) data[name] = Number(m); // a segment's cents fit a double exactly (< 2^53)
        }
        const row = { fiscalYear: Number(r.fiscalYear) || 0, currency: str(r.reportedCurrency), data };
        await prisma.revenueSegment.upsert({
          where: { symbol_kind_period_periodEnd: { symbol: key, kind, period: p, periodEnd } },
          create: { symbol: key, kind, period: p, periodEnd, ...row },
          update: row,
        });
      }
    }
  }
  await prisma.financialsStatus.update({ where: { symbol: key }, data: { segmentsAt: new Date() } });
}

/** SEC filings in a window, split in half whenever FMP's 100-row page fills (a bank's note flood
 *  would otherwise push a real 8-K off the page). */
async function filingsWindow(key: string, from: string, to: string, depth = 0): Promise<Row[]> {
  const list = rows(await fmpGet(`sec-filings-search/symbol?symbol=${enc(key)}&from=${from}&to=${to}&limit=100`));
  if (list.length >= 100 && from < to && depth < 6) {
    const mid = new Date((Date.parse(from) + Date.parse(to)) / 2).toISOString().slice(0, 10);
    const next = new Date(Date.parse(mid) + DAY_MS).toISOString().slice(0, 10);
    return [...(await filingsWindow(key, from, mid, depth + 1)), ...(await filingsWindow(key, next, to, depth + 1))];
  }
  return list;
}

async function refreshFilings(key: string, today: string, firstTime: boolean): Promise<void> {
  const from = new Date(Date.parse(today) - (firstTime ? 365 : 10) * DAY_MS).toISOString().slice(0, 10);
  const list = await filingsWindow(key, from, today);
  for (const f of list) {
    const form = String(f.formType ?? "");
    const url = str(f.link);
    if (!url || !keepFiling(form)) continue;
    const data = { form, filedAt: String(f.filingDate ?? "").slice(0, 10), acceptedAt: str(f.acceptedDate), docUrl: str(f.finalLink) };
    await prisma.companyFiling.upsert({ where: { symbol_url: { symbol: key, url } }, create: { symbol: key, url, ...data }, update: data });
  }
  await prisma.financialsStatus.update({ where: { symbol: key }, data: { filingsDay: today } });
}

async function refreshInsider(key: string): Promise<void> {
  const list = rows(await fmpGet(`insider-trading/statistics?symbol=${enc(key)}`));
  for (const r of list.slice(0, 12)) {
    const year = int(r.year);
    const quarter = int(r.quarter);
    if (year == null || quarter == null) continue;
    const data = {
      buys: int(r.totalPurchases) ?? 0,
      sells: int(r.totalSales) ?? 0,
      acquired: int(r.acquiredTransactions) ?? 0,
      disposed: int(r.disposedTransactions) ?? 0,
      sharesAcquired: toWhole(r.totalAcquired),
      sharesDisposed: toWhole(r.totalDisposed),
      fetchedAt: new Date(),
    };
    await prisma.insiderQuarter.upsert({ where: { symbol_year_quarter: { symbol: key, year, quarter } }, create: { symbol: key, year, quarter, ...data }, update: data });
  }
  await prisma.financialsStatus.update({ where: { symbol: key }, data: { insiderAt: new Date() } });
}

/** Record which earnings calls have transcripts (the last 8). Summaries are written separately, by
 *  the agent-side job (agent/earnings-call.ts) — this module never calls Claude. */
async function refreshCallList(key: string, today: string): Promise<void> {
  const list = rows(await fmpGet(`earning-call-transcript-dates?symbol=${enc(key)}`));
  const recent = list
    .map((r) => ({ fiscalYear: int(r.fiscalYear ?? r.year), fiscalQuarter: int(r.quarter), callDate: String(r.date ?? "").slice(0, 10) }))
    .filter((r): r is { fiscalYear: number; fiscalQuarter: number; callDate: string } => r.fiscalYear != null && r.fiscalQuarter != null && !!r.callDate)
    .sort((a, b) => b.callDate.localeCompare(a.callDate))
    .slice(0, 8);
  for (const c of recent) {
    await prisma.earningsCall.upsert({
      where: { symbol_fiscalYear_fiscalQuarter: { symbol: key, fiscalYear: c.fiscalYear, fiscalQuarter: c.fiscalQuarter } },
      create: { symbol: key, ...c },
      update: { callDate: c.callDate },
    });
  }
  await prisma.financialsStatus.update({ where: { symbol: key }, data: { callsDay: today } });
}

/** The full transcript, fetched on demand (never stored — §4.5). FMP labels by FISCAL year. */
export async function fetchTranscript(key: string, fiscalYear: number, fiscalQuarter: number): Promise<{ content: string; date: string } | null> {
  const [t] = rows(await fmpGet(`earning-call-transcript?symbol=${enc(key)}&year=${fiscalYear}&quarter=${fiscalQuarter}`));
  const content = str(t?.content);
  return content ? { content, date: String(t?.date ?? "") } : null;
}

// ── Orchestration ────────────────────────────────────────────────────────────────────────────

/** Bring one name up to date. Each feed is isolated: one failing never blocks the others. */
export async function refreshName(key: string, deep: boolean, opts: { today?: string; only?: Feed[] } = {}): Promise<Feed[]> {
  const today = opts.today ?? etDateStr();
  let st = await prisma.financialsStatus.findUnique({ where: { symbol: key } });
  let due = dueFeeds(st, deep, new Date(), today);
  if (opts.only) due = due.filter((f) => opts.only!.includes(f));
  if (due.includes("profile")) {
    await refreshProfile(key).catch((e) => console.error(`[financials] ${key} profile:`, e instanceof Error ? e.message : e));
    st = await prisma.financialsStatus.findUnique({ where: { symbol: key } });
    if (!st) return ["profile"];
    // The profile may have just revealed an ETF, a fund or a US filer: recompute.
    due = ["profile", ...dueFeeds(st, deep, new Date(), today).filter((f) => f !== "profile" && (!opts.only || opts.only.includes(f)))];
  }
  if (!st) return due;
  const run = async (f: Feed, fn: () => Promise<void>) => {
    if (!due.includes(f)) return;
    await fn().catch((e) => console.error(`[financials] ${key} ${f}:`, e instanceof Error ? e.message : e));
  };
  await run("statements", () => refreshStatements(key));
  const after = await prisma.financialsStatus.findUnique({ where: { symbol: key }, select: { statementsCovered: true } });
  if (after?.statementsCovered === false) return due.filter((f) => f === "profile" || f === "statements");
  await run("estimates", () => refreshEstimates(key, today));
  await run("health", () => refreshHealth(key, today));
  await run("segments", () => refreshSegments(key));
  await run("filings", () => refreshFilings(key, today, st!.filingsDay == null));
  await run("insider", () => refreshInsider(key));
  await run("calls", () => refreshCallList(key, today));
  return due;
}

let running = false;

/** The daily pass over every tracked name. A few names at a time — FMP is well inside its rate limit
 *  at ~3 calls/sec, and a background job has no reason to hurry. */
export async function runFinancialsRefresh(concurrency = 3): Promise<{ names: number; calls: number; skipped: boolean }> {
  if (running) return { names: 0, calls: 0, skipped: true };
  running = true;
  try {
    const targets = await financialsTargets();
    const today = etDateStr();
    let names = 0;
    let calls = 0;
    for (let i = 0; i < targets.length; i += concurrency) {
      const batch = targets.slice(i, i + concurrency);
      const done = await Promise.all(batch.map((t) => refreshName(t.key, t.deep, { today }).catch(() => [] as Feed[])));
      for (const d of done) {
        if (d.length) names++;
        calls += d.length;
      }
    }
    return { names, calls, skipped: false };
  } finally {
    running = false;
  }
}

/** On demand, for a stock page of a name the daily job doesn't cover. FMP only — never Claude
 *  (§3.9) — and only the cheap feeds; filings and calls stay with tracked names. */
export async function ensureFinancials(key: string): Promise<void> {
  await refreshName(key.toUpperCase(), false, { only: ["profile", "statements", "estimates", "health", "segments", "insider"] });
}

// ── Reads ────────────────────────────────────────────────────────────────────────────────────

export async function getPeriods(key: string): Promise<PeriodRow[]> {
  return prisma.financialPeriod.findMany({
    where: { symbol: key.toUpperCase() },
    orderBy: { periodEnd: "desc" },
    select: {
      period: true, fiscalYear: true, periodEnd: true, currency: true, revenue: true, costOfRevenue: true, grossProfit: true, operatingIncome: true,
      netIncome: true, epsDiluted4: true, sharesDiluted: true, operatingCashFlow: true, capex: true, freeCashFlow: true,
      cash: true, totalDebt: true, totalEquity: true,
    },
  });
}

export async function getEstimates(key: string): Promise<EstimateRow[]> {
  return prisma.estimateSnapshot.findMany({ where: { symbol: key.toUpperCase() }, orderBy: [{ targetEnd: "asc" }, { asOf: "asc" }] });
}

export async function getStatus(key: string) {
  return prisma.financialsStatus.findUnique({ where: { symbol: key.toUpperCase() } });
}

export function splitsOf(st: { splits: unknown } | null): Split[] {
  return Array.isArray(st?.splits) ? (st!.splits as Split[]) : [];
}
