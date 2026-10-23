// Company financials — the PURE half (D140, docs/COMPANY-FINANCIALS.md §4.3). No I/O, no Prisma:
// everything takes plain rows and returns numbers, so test/financials-derive.test.ts can pin every
// formula and every edge case. Money stays in integer minor units (bigint) until a RATIO is taken;
// ratios come back as integer basis points.

// ── Converting FMP's floats to our integers ──────────────────────────────────────────────────

/** FMP money (a float in whole currency units) → integer minor units (cents). Whole values (the
 *  usual case for statement lines) convert exactly, however large; fractional ones round to the cent. */
export function toMinor(v: unknown): bigint | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  if (Number.isInteger(v)) return BigInt(v) * 100n;
  return BigInt(Math.round(v * 100));
}

/** A share or count field → whole units. */
export function toWhole(v: unknown): bigint | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return BigInt(Math.round(v));
}

/** EPS → × 10,000, rounding half away from zero (P0 R8: −0.0022 must stay −22, not −21). */
export function toEps4(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.sign(v) * Math.round(Math.abs(v) * 10_000);
}

/** A price-like float (DCF, per-share value) → integer cents. */
export function toCents(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.round(v * 100);
}

// ── Growth: the one rule that keeps a panel honest ───────────────────────────────────────────

/** A change from a base. `nm` = not meaningful: growth off a zero or negative base is not a
 *  percentage (a loss of $1 becoming a profit of $1 is not "+200%"). The panel prints "n/m". */
export type Growth = { kind: "ok"; bps: number } | { kind: "nm"; reason: "zero-base" | "negative-base" | "basis-changed" };

export function growth(cur: bigint | number | null | undefined, prev: bigint | number | null | undefined): Growth | null {
  if (cur == null || prev == null) return null;
  const c = Number(cur);
  const p = Number(prev);
  if (p === 0) return { kind: "nm", reason: "zero-base" };
  if (p < 0) return { kind: "nm", reason: "negative-base" };
  return { kind: "ok", bps: Math.round(((c - p) / p) * 10_000) };
}

/** part ÷ whole as basis points; null when the whole is missing or not positive. */
export function ratioBps(part: bigint | number | null | undefined, whole: bigint | number | null | undefined): number | null {
  if (part == null || whole == null) return null;
  const w = Number(whole);
  if (!(w > 0)) return null;
  return Math.round((Number(part) / w) * 10_000);
}

// ── Periods ──────────────────────────────────────────────────────────────────────────────────

export type PeriodRow = {
  period: string; // "Q1".."Q4" | "FY"
  fiscalYear: number;
  periodEnd: string; // YYYY-MM-DD
  currency: string;
  revenue: bigint | null;
  costOfRevenue: bigint | null;
  grossProfit: bigint | null;
  operatingIncome: bigint | null;
  netIncome: bigint | null;
  epsDiluted4: number | null;
  sharesDiluted: bigint | null;
  operatingCashFlow: bigint | null;
  capex: bigint | null;
  freeCashFlow: bigint | null;
  cash: bigint | null;
  totalDebt: bigint | null;
  totalEquity: bigint | null;
  // Optional: older fixtures and callers don't carry them; null/undefined both mean "not reported".
  interestExpense?: bigint | null;
  buybacks?: bigint | null; // negative = cash out
  dividendsPaid?: bigint | null; // negative = cash out
  stockComp?: bigint | null;
};

const DAY = 86_400_000;
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);

/** Quarterly rows only, newest first. */
export function quarters(rows: PeriodRow[]): PeriodRow[] {
  return rows.filter((r) => /^Q[1-4]$/.test(r.period)).sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
}

/** Annual rows only, newest first. */
export function years(rows: PeriodRow[]): PeriodRow[] {
  return rows.filter((r) => r.period === "FY").sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
}

/** The same fiscal quarter one fiscal year earlier — matched by FMP's labels, never by calendar
 *  (NVDA's Q2 ends in July; P0 R10). Falls back to "the quarter ending ~1 year earlier" only when
 *  the labels don't line up (a company that changed its fiscal year), with a ±45-day tolerance. */
export function yearAgo(qs: PeriodRow[], cur: PeriodRow): PeriodRow | null {
  const byLabel = qs.find((q) => q.period === cur.period && q.fiscalYear === cur.fiscalYear - 1);
  if (byLabel) return byLabel;
  const target = ms(cur.periodEnd) - 365 * DAY;
  return qs.find((q) => Math.abs(ms(q.periodEnd) - target) <= 45 * DAY) ?? null;
}

/** The quarter immediately before (sequential). Requires it to end 60–120 days earlier, so a gap
 *  in the data is never mistaken for the previous quarter. */
export function prevQuarter(qs: PeriodRow[], cur: PeriodRow): PeriodRow | null {
  const i = qs.indexOf(cur);
  const p = i >= 0 ? qs[i + 1] : undefined;
  if (!p) return null;
  const gap = (ms(cur.periodEnd) - ms(p.periodEnd)) / DAY;
  return gap >= 60 && gap <= 120 ? p : null;
}

type MoneyField = "revenue" | "grossProfit" | "operatingIncome" | "netIncome" | "operatingCashFlow" | "freeCashFlow" | "interestExpense" | "buybacks" | "dividendsPaid" | "stockComp";

/** Trailing twelve months: the sum of 4 consecutive quarters starting at `from` (index into the
 *  newest-first list). null if any quarter is missing, the field is null in any, or the four don't
 *  span ~a year (never annualise a partial year). */
export function ttm(qs: PeriodRow[], field: MoneyField | "fcf", from = 0): bigint | null {
  const four = qs.slice(from, from + 4);
  if (four.length < 4) return null;
  const span = (ms(four[0].periodEnd) - ms(four[3].periodEnd)) / DAY;
  if (span < 240 || span > 300) return null; // 3 quarter-gaps ≈ 273 days
  let sum = 0n;
  for (const q of four) {
    const v = field === "fcf" ? fcf(q) : q[field];
    if (v == null) return null;
    sum += v;
  }
  return sum;
}

/** TTM revenue; null across a basis change (a sum of two different definitions is no number at all). */
export function ttmRevenue(qs: PeriodRow[], financial: boolean, from = 0): bigint | null {
  const four = qs.slice(from, from + 4);
  const sum = ttm(qs, "revenue", from);
  if (sum == null || four.some((q) => basisChanged(q, four[0], financial))) return null;
  return sum;
}

/** Free cash flow: FMP's own figure when present, else operating cash flow less capex. Capex is
 *  reported negative (cash out) but some rows carry it positive — either way it is subtracted. */
export function fcf(q: Pick<PeriodRow, "freeCashFlow" | "operatingCashFlow" | "capex">): bigint | null {
  if (q.freeCashFlow != null) return q.freeCashFlow;
  if (q.operatingCashFlow == null || q.capex == null) return null;
  const capex = q.capex < 0n ? -q.capex : q.capex;
  return q.operatingCashFlow - capex;
}

export function netDebt(q: Pick<PeriodRow, "totalDebt" | "cash">): bigint | null {
  if (q.totalDebt == null || q.cash == null) return null;
  return q.totalDebt - q.cash;
}

// ── Splits and dilution ──────────────────────────────────────────────────────────────────────

export type Split = { date: string; numerator: number; denominator: number };

/** Share-count change over a year, split-aware (P0 R9). A split between the two periods multiplies
 *  the share count by numerator/denominator; whether FMP already restated the older count is not
 *  something we know per row, so we adjust only when the raw ratio sits closer to the split factor
 *  than to 1 — i.e. when the older count is visibly NOT restated. */
export function shareChange(cur: PeriodRow, prev: PeriodRow, splits: Split[]): Growth | null {
  if (cur.sharesDiluted == null || prev.sharesDiluted == null) return null;
  let factor = 1;
  for (const s of splits) {
    if (s.date > prev.periodEnd && s.date <= cur.periodEnd && s.denominator > 0) factor *= s.numerator / s.denominator;
  }
  const c = Number(cur.sharesDiluted);
  let p = Number(prev.sharesDiluted);
  if (factor !== 1 && p > 0) {
    const raw = c / p;
    if (Math.abs(Math.log(raw / factor)) < Math.abs(Math.log(raw))) p *= factor;
  }
  return growth(c, Math.round(p));
}

// ── Revenue basis: FMP changes how it books some companies' revenue between quarters ─────────

/** Did FMP change how it counts a FINANCIAL company's revenue between two periods? It does this to
 *  banks and insurers: RY moved from net to gross revenue in late 2025 and C from gross to net in Q3
 *  2026, which read as +140% and −46% "growth" (and BNS, NA, IFC, MFC show the same in their history).
 *  Two tells: a cost-of-revenue line appearing or vanishing (RY), or its share of revenue jumping more
 *  than 25 points (C: 51% → 11%).
 *
 *  Only financials are tested. Surveyed across the universe 2026-10-22, the same tells on other
 *  companies were real business — NVDA's April 2025 inventory write-down (costs ×3 in a real +69%
 *  revenue quarter), POET's first sales, gold and memory price booms — so for them revenue is measured
 *  as reported. A first version applied the zero/non-zero tell to everyone and would have called real
 *  growth "n/m".
 *
 *  Across a change, revenue growth is "n/m" — it is not rebuilt. A second version (also 2026-10-22)
 *  rebuilt bank revenue as revenue minus cost of revenue and read RY at +22.9% while RBC's own call
 *  said about 9%: FMP's gross-basis "cost of revenue" is not the deduction RBC makes. Profit and EPS
 *  don't flip and agree with what the banks report (RY +11% / +12.8%), so a bank's card leads with them. */
export function basisChanged(
  a: Pick<PeriodRow, "costOfRevenue" | "revenue">,
  b: Pick<PeriodRow, "costOfRevenue" | "revenue">,
  financial: boolean,
): boolean {
  if (!financial || a.costOfRevenue == null || b.costOfRevenue == null) return false;
  if ((a.costOfRevenue === 0n) !== (b.costOfRevenue === 0n)) return true;
  const share = (q: Pick<PeriodRow, "costOfRevenue" | "revenue">) =>
    q.revenue != null && q.revenue > 0n ? Number(q.costOfRevenue) / Number(q.revenue) : null;
  const sa = share(a);
  const sb = share(b);
  return sa != null && sb != null && Math.abs(sa - sb) > BASIS_SHIFT;
}

/** How far cost-of-revenue's share of revenue may move between two compared quarters of a financial
 *  company before we treat it as the feed re-classifying. */
export const BASIS_SHIFT = 0.25;

function revenueGrowth(cur: PeriodRow, prev: PeriodRow | null, fin: boolean): Growth | null {
  if (!prev) return null;
  if (basisChanged(cur, prev, fin)) return { kind: "nm", reason: "basis-changed" };
  return growth(cur.revenue, prev.revenue);
}

/** A margin change across a basis change is no more real than the revenue change. */
function marginChange(cur: PeriodRow, prev: PeriodRow | null, field: "operatingIncome" | "netIncome", fin: boolean): number | null {
  if (!prev || basisChanged(cur, prev, fin)) return null;
  const a = ratioBps(cur[field], cur.revenue);
  const b = ratioBps(prev[field], prev.revenue);
  return a != null && b != null ? a - b : null;
}

// ── The headline numbers for one company ─────────────────────────────────────────────────────

/** Banks and insurers: FMP synthesises a "gross profit", flips their revenue basis, and the Altman Z
 *  formula reads them as distressed (P0 R3). Their card leads with profit, EPS and return on equity,
 *  and drops gross margin, Altman Z, net debt, free cash flow and the DCF. */
/** A lender or insurer: its revenue flips gross/net, its "debt" is its funding and interest is its cost of
 *  goods, so it gets the bank card. FMP's "Financial Services" sector also holds firms that are none of
 *  those — exchanges and data vendors (CME, SPGI, FDS) and insurance BROKERS (AON, AJG), which earn fees
 *  and carry ordinary debt — so those industries read as ordinary companies. Not separable by industry:
 *  V and MA share "Credit Services" with the lenders AXP and COF, and stay on the bank card. */
const NOT_LENDERS = /data & stock exchanges|insurance - brokers/i;
export function isFinancialSector(sector: string | null | undefined, industry?: string | null): boolean {
  return /financial/i.test(sector ?? "") && !NOT_LENDERS.test(industry ?? "");
}

export type Headline = {
  asOf: string; // newest quarter's period end
  label: string; // "FY2027 Q2"
  currency: string;
  revenueTtm: bigint | null; // null when the last four quarters straddle a basis change
  revenueQ: bigint | null;
  revenueQYearAgo: bigint | null; // the same fiscal quarter a year earlier, same basis only — for "up $X" (dollars first)
  revenueYoY: Growth | null; // latest quarter vs same quarter a year earlier
  revenueQoQ: Growth | null;
  revenueAccelBps: number | null; // YoY growth now − YoY growth two quarters ago
  epsQ4: number | null;
  epsQ4YearAgo: number | null;
  epsYoY: Growth | null;
  netIncomeQ: bigint | null;
  operatingIncomeQ: bigint | null;
  netIncomeQYearAgo: bigint | null;
  netIncomeYoY: Growth | null;
  netIncomeTtm: bigint | null;
  roeBps: number | null; // profit over the last year ÷ shareholders' equity now
  grossMarginBps: number | null; // null for financials
  operatingMarginBps: number | null;
  netMarginBps: number | null;
  operatingMarginChangeBps: number | null; // vs the same quarter a year earlier (same basis only)
  netMarginChangeBps: number | null;
  preRevenue: boolean; // no sales (an explorer, a biotech) — the card leads with cash, not growth
  fcfTtm: bigint | null;
  fcfMarginBps: number | null;
  netDebt: bigint | null;
  shareChangeYoY: Growth | null; // + = dilution, − = buybacks
  quartersAvailable: number;
};

export function headline(rows: PeriodRow[], opts: { sector?: string | null; industry?: string | null; splits?: Split[] } = {}): Headline | null {
  const qs = quarters(rows);
  const q0 = qs[0];
  if (!q0) return null;
  const fin = isFinancialSector(opts.sector, opts.industry);
  const ya = yearAgo(qs, q0);
  const pq = prevQuarter(qs, q0);
  const q2 = qs[2] ?? null;
  const q2ya = q2 ? yearAgo(qs, q2) : null;

  const yoyNow = revenueGrowth(q0, ya, fin);
  const yoyThen = q2 ? revenueGrowth(q2, q2ya, fin) : null;
  const accel = yoyNow?.kind === "ok" && yoyThen?.kind === "ok" ? yoyNow.bps - yoyThen.bps : null;
  const revTtm = ttmRevenue(qs, fin);
  const fcfTtm = ttm(qs, "fcf");
  const niTtm = ttm(qs, "netIncome");

  return {
    asOf: q0.periodEnd,
    label: `FY${q0.fiscalYear} ${q0.period}`,
    currency: q0.currency,
    revenueTtm: revTtm,
    revenueQ: q0.revenue,
    revenueQYearAgo: ya && !basisChanged(q0, ya, fin) ? ya.revenue : null,
    revenueYoY: yoyNow,
    revenueQoQ: revenueGrowth(q0, pq, fin),
    revenueAccelBps: accel,
    epsQ4: q0.epsDiluted4,
    epsQ4YearAgo: ya?.epsDiluted4 ?? null,
    epsYoY: ya ? growth(q0.epsDiluted4, ya.epsDiluted4) : null,
    netIncomeQ: q0.netIncome,
    operatingIncomeQ: q0.operatingIncome,
    netIncomeQYearAgo: ya?.netIncome ?? null,
    netIncomeYoY: ya ? growth(q0.netIncome, ya.netIncome) : null,
    netIncomeTtm: niTtm,
    roeBps: ratioBps(niTtm, q0.totalEquity),
    grossMarginBps: fin ? null : ratioBps(q0.grossProfit, q0.revenue),
    operatingMarginBps: ratioBps(q0.operatingIncome, q0.revenue),
    netMarginBps: ratioBps(q0.netIncome, q0.revenue),
    operatingMarginChangeBps: marginChange(q0, ya, "operatingIncome", fin),
    netMarginChangeBps: marginChange(q0, ya, "netIncome", fin),
    preRevenue: (revTtm ?? q0.revenue ?? 0n) <= 0n,
    fcfTtm: fin ? null : fcfTtm, // a lender's cash flow statement is its loan book moving, not "free cash"
    fcfMarginBps: fin ? null : ratioBps(fcfTtm, revTtm),
    netDebt: fin ? null : netDebt(q0), // a bank's "debt" is its funding — not leverage in this sense
    shareChangeYoY: ya ? shareChange(q0, ya, opts.splits ?? []) : null,
    quartersAvailable: qs.length,
  };
}

/** Per-quarter series for a trend chart, oldest → newest, with YoY growth where a year-ago quarter exists. */
export function quarterSeries(rows: PeriodRow[], n = 8, sector?: string | null, industry?: string | null) {
  const fin = isFinancialSector(sector, industry);
  const qs = quarters(rows);
  return qs
    .slice(0, n)
    .map((q) => {
      const ya = yearAgo(qs, q);
      return {
        periodEnd: q.periodEnd,
        label: `${q.period} FY${q.fiscalYear}`,
        revenue: q.revenue,
        netIncome: q.netIncome,
        epsQ4: q.epsDiluted4,
        fcf: fcf(q),
        operatingMarginBps: ratioBps(q.operatingIncome, q.revenue),
        netMarginBps: ratioBps(q.netIncome, q.revenue),
        revenueYoY: revenueGrowth(q, ya, fin),
        epsYoY: ya ? growth(q.epsDiluted4, ya.epsDiluted4) : null,
        netIncomeYoY: ya ? growth(q.netIncome, ya.netIncome) : null,
      };
    })
    .reverse();
}

// ── Estimates: storing on change, and reading revisions back ─────────────────────────────────

export type EstimateRow = {
  period: string; // "FY" | "Q"
  targetEnd: string;
  asOf: string;
  revenueAvg: bigint | null;
  revenueLow: bigint | null;
  revenueHigh: bigint | null;
  netIncomeAvg: bigint | null;
  epsAvg4: number | null;
  epsLow4: number | null;
  epsHigh4: number | null;
  analystsRevenue: number | null;
  analystsEps: number | null;
};

type EstimateValues = Omit<EstimateRow, "period" | "targetEnd" | "asOf">;

/** Has the consensus moved since the last row we stored? (Only then do we write a new row.) */
export function estimateChanged(prev: EstimateValues | null | undefined, next: EstimateValues): boolean {
  if (!prev) return true;
  return (
    prev.revenueAvg !== next.revenueAvg ||
    prev.revenueLow !== next.revenueLow ||
    prev.revenueHigh !== next.revenueHigh ||
    prev.netIncomeAvg !== next.netIncomeAvg ||
    prev.epsAvg4 !== next.epsAvg4 ||
    prev.epsLow4 !== next.epsLow4 ||
    prev.epsHigh4 !== next.epsHigh4 ||
    prev.analystsRevenue !== next.analystsRevenue ||
    prev.analystsEps !== next.analystsEps
  );
}

/** The consensus in force on `day`: the newest row first seen on or before it. */
export function consensusOn(history: EstimateRow[], day: string): EstimateRow | null {
  let best: EstimateRow | null = null;
  for (const r of history) if (r.asOf <= day && (!best || r.asOf > best.asOf)) best = r;
  return best;
}

export type Revision =
  | { kind: "ok"; days: number; eps: Growth | null; revenue: Growth | null }
  | { kind: "building"; daysOfHistory: number }; // our history doesn't reach back that far yet

/** How the consensus for one target moved over the last `days` days, from OUR snapshots only. */
export function revision(history: EstimateRow[], today: string, days: number): Revision {
  if (history.length === 0) return { kind: "building", daysOfHistory: 0 };
  const first = history.reduce((a, r) => (r.asOf < a ? r.asOf : a), history[0].asOf);
  const back = new Date(ms(today) - days * DAY).toISOString().slice(0, 10);
  if (first > back) return { kind: "building", daysOfHistory: Math.round((ms(today) - ms(first)) / DAY) };
  const now = consensusOn(history, today);
  const then = consensusOn(history, back);
  if (!now || !then) return { kind: "building", daysOfHistory: Math.round((ms(today) - ms(first)) / DAY) };
  return { kind: "ok", days, eps: growth(now.epsAvg4, then.epsAvg4), revenue: growth(now.revenueAvg, then.revenueAvg) };
}

/** The fiscal targets worth keeping: the next `fy` fiscal years and next `q` quarters whose period
 *  hasn't ended (plus the one that just ended, still unreported for a few weeks). FMP returns
 *  decades of rows; history for targets years out is noise we'd pay disk for. */
export function targetsToKeep(rows: Array<{ date: string }>, today: string, n: number): string[] {
  const grace = new Date(ms(today) - 75 * DAY).toISOString().slice(0, 10);
  return rows
    .map((r) => r.date)
    .filter((d) => d >= grace)
    .sort()
    .slice(0, n);
}

// ── Filings ──────────────────────────────────────────────────────────────────────────────────

/** The forms worth showing (P0 R6). Everything else — structured-note prospectuses (424B2, FWP),
 *  fund filings, Form 4 (already on the insider panel) — is dropped. */
export const FILING_FORMS = new Set(["8-K", "10-Q", "10-K", "6-K", "40-F", "20-F", "S-1", "DEF 14A", "SC 13D", "SC 13D/A", "10-K/A", "10-Q/A", "8-K/A"]);

export function keepFiling(form: string): boolean {
  return FILING_FORMS.has(form.trim().toUpperCase());
}

// ── Health, in dollars (display round 2) ───────────────────────────────────────────────────────
// The scores (Piotroski, Altman Z) come from FMP; these are the plain facts behind "is it healthy",
// computed from the statements so every one can be said in dollars: what it owes vs holds, how long
// its cash would take to clear the debt, how many times profit covers interest, how long the cash
// lasts if it burns, and what it handed back to owners. Banks get none of the debt/interest lines
// (their debt is their funding and interest is their cost of goods).

export type HealthFacts = {
  financial: boolean;
  cash: bigint | null;
  debt: bigint | null;
  netDebt: bigint | null; // + owes more than it holds
  fcfTtm: bigint | null;
  operatingIncomeTtm: bigint | null;
  interestTtm: bigint | null;
  interestCoverX10: number | null; // operating profit ÷ interest, ×10 (85 = 8.5×)
  debtYearsX10: number | null; // net debt ÷ yearly free cash, ×10 (only when it owes and has free cash)
  runwayMonths: number | null; // only when it burns cash and holds more cash than debt
  buybacksTtm: bigint | null; // positive = spent buying back
  dividendsTtm: bigint | null; // positive = paid out
  stockCompTtm: bigint | null;
};

const out = (v: bigint | null) => (v == null ? null : v < 0n ? -v : 0n);

export function healthFacts(rows: PeriodRow[], sector?: string | null, industry?: string | null): HealthFacts | null {
  const qs = quarters(rows);
  const q0 = qs[0];
  if (!q0) return null;
  const fin = isFinancialSector(sector, industry);
  const fcfT = ttm(qs, "fcf");
  const opT = ttm(qs, "operatingIncome");
  const intT = fin ? null : ttm(qs, "interestExpense");
  const nd = fin ? null : netDebt(q0);
  let cover: number | null = null;
  if (intT != null && intT > 0n && opT != null) cover = Number((opT * 10n) / intT);
  const debtYears = nd != null && nd > 0n && fcfT != null && fcfT > 0n ? Number((nd * 10n) / fcfT) : null;
  const runway = nd != null && nd < 0n && fcfT != null && fcfT < 0n ? Math.round((Number(-nd) * 12) / Number(-fcfT)) : null;
  return {
    financial: fin,
    cash: fin ? null : q0.cash,
    debt: fin ? null : q0.totalDebt,
    netDebt: nd,
    fcfTtm: fin ? null : fcfT,
    operatingIncomeTtm: opT,
    interestTtm: intT,
    interestCoverX10: cover,
    debtYearsX10: debtYears,
    runwayMonths: runway,
    buybacksTtm: out(ttm(qs, "buybacks")),
    dividendsTtm: out(ttm(qs, "dividendsPaid")),
    stockCompTtm: ttm(qs, "stockComp"),
  };
}

export type CheckTone = "good" | "ok" | "bad";
export type HealthCheck = { key: "debt" | "interest" | "cash" | "shares" | "profit" | "trend"; tone: CheckTone };

/** The checklist grades. Thresholds are deliberately round and stated in the panel's own words:
 *  debt payable from ≤ 3 years of free cash is fine, > 6 is heavy; profit ≥ 8× interest is easy,
 *  < 3× is tight (unless it holds more cash than debt: then it could repay it all today); burning cash with ≥ 2 years of runway is a watch, less is a problem; share count
 *  up ≤ 2% a year is normal, > 5% is real dilution. Banks: return on equity ≥ 10% good, < 5% weak. */
export function healthChecks(f: HealthFacts, opts: { roeBps: number | null; netIncomeYoY: Growth | null; shareChangeYoY: Growth | null }): HealthCheck[] {
  const c: HealthCheck[] = [];
  if (f.financial) {
    if (opts.roeBps != null) c.push({ key: "profit", tone: opts.roeBps >= 1000 ? "good" : opts.roeBps >= 500 ? "ok" : "bad" });
    const g = opts.netIncomeYoY;
    if (g?.kind === "ok") c.push({ key: "trend", tone: g.bps >= 0 ? "good" : g.bps >= -1000 ? "ok" : "bad" });
  } else {
    if (f.netDebt != null) {
      const tone: CheckTone =
        f.netDebt <= 0n ? "good" : f.debtYearsX10 == null ? "bad" : f.debtYearsX10 <= 30 ? "good" : f.debtYearsX10 <= 60 ? "ok" : "bad";
      c.push({ key: "debt", tone });
    }
    if (f.netDebt != null && f.netDebt <= 0n && f.interestTtm != null) {
      c.push({ key: "interest", tone: "good" }); // more cash than debt: it could repay the lot today, so the bill can't bite
    } else if (f.interestCoverX10 != null) {
      c.push({ key: "interest", tone: f.interestCoverX10 >= 80 ? "good" : f.interestCoverX10 >= 30 ? "ok" : "bad" });
    }
    if (f.fcfTtm != null) {
      const tone: CheckTone = f.fcfTtm > 0n ? "good" : f.runwayMonths != null && f.runwayMonths >= 24 ? "ok" : "bad";
      c.push({ key: "cash", tone });
    }
  }
  const s = opts.shareChangeYoY;
  if (s?.kind === "ok") c.push({ key: "shares", tone: s.bps <= 200 ? "good" : s.bps <= 500 ? "ok" : "bad" });
  return c;
}

// ── What a forecast is compared with (display round 3) ────────────────────────────────────────
/** The reported period a year before a forecast's target: next quarter vs the same quarter last year,
 *  a fiscal year vs the year before it. Matched by end date (±45 days), the same tolerance as yearAgo.
 *  Revenue is withheld for a bank: analysts' "revenue" and our feed's can be counted differently. */
export function estimateBaseline(
  rows: PeriodRow[],
  period: "FY" | "Q",
  targetEnd: string,
  financial: boolean,
): { periodEnd: string; revenue: bigint | null; epsDiluted4: number | null } | null {
  const pool = period === "FY" ? years(rows) : quarters(rows);
  const want = ms(targetEnd) - 365 * DAY;
  const hit = pool.find((r) => Math.abs(ms(r.periodEnd) - want) <= 45 * DAY);
  if (!hit) return null;
  return { periodEnd: hit.periodEnd, revenue: financial ? null : hit.revenue, epsDiluted4: hit.epsDiluted4 };
}
