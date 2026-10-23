// Company financials — the read model a stock page (web or GRQ Go) renders (D140). One call assembles
// everything, applying the P0 display rules so no client has to remember them:
//   R3 banks/insurers: no gross margin, Altman Z or DCF; revenue is NET (derive.revenueOf)
//   R4 FMP's DCF only when > 0
//   R5 ETFs/funds: { kind: "etf" } and nothing else
//   segments older than 15 months are hidden
// Money leaves here as integer minor units in a JS number (cents), with its currency beside it. Every
// figure we hold fits a double exactly (TSM's TWD TTM revenue ≈ 5e14 cents < 2^53 ≈ 9e15).

import { prisma } from "../db";
import { etDateStr } from "../../agent/calendar";
import { getPeriods, getEstimates, getStatus, splitsOf } from "./store";
import { headline, quarterSeries, revision, consensusOn, isFinancialSector, type Growth, type EstimateRow } from "./derive";
import type { CallSummary } from "./call-summary";

const n = (v: bigint | null | undefined): number | null => (v == null ? null : Number(v));
const SEGMENT_MAX_AGE_DAYS = 456; // ~15 months

export type FinancialsView =
  | { kind: "none"; reason: "not-fetched" | "no-statements" }
  | { kind: "etf"; name: string | null }
  | {
      kind: "company";
      name: string | null;
      sector: string | null;
      financial: boolean; // bank/insurer card (R3)
      currency: string; // the company's REPORTING currency — not necessarily the listing's (R2)
      headline: ReturnType<typeof headlineOut>;
      quarters: ReturnType<typeof seriesOut>;
      estimates: EstimatesOut | null;
      health: HealthOut | null;
      segments: { product: SegmentOut | null; geographic: SegmentOut | null };
      call: CallOut | null;
      filings: Array<{ form: string; filedAt: string; url: string; docUrl: string | null }>;
      insider: Array<{ year: number; quarter: number; buys: number; sells: number; acquired: number; disposed: number }>;
      updatedAt: string | null;
    };

function headlineOut(h: NonNullable<ReturnType<typeof headline>>) {
  return {
    ...h,
    revenueTtm: n(h.revenueTtm),
    revenueQ: n(h.revenueQ),
    revenueQYearAgo: n(h.revenueQYearAgo),
    netIncomeTtm: n(h.netIncomeTtm),
    netIncomeQ: n(h.netIncomeQ),
    operatingIncomeQ: n(h.operatingIncomeQ),
    netIncomeQYearAgo: n(h.netIncomeQYearAgo),
    fcfTtm: n(h.fcfTtm),
    netDebt: n(h.netDebt),
  };
}

function seriesOut(s: ReturnType<typeof quarterSeries>) {
  return s.map((q) => ({ ...q, revenue: n(q.revenue), netIncome: n(q.netIncome), fcf: n(q.fcf) }));
}

type EstimateTarget = {
  targetEnd: string;
  revenueAvg: number | null;
  revenueLow: number | null;
  revenueHigh: number | null;
  epsAvg4: number | null;
  epsLow4: number | null;
  epsHigh4: number | null;
  analysts: number | null;
  rev30: ReturnType<typeof revision>;
  rev90: ReturnType<typeof revision>;
};
type EstimatesOut = { nextYear: EstimateTarget | null; followingYear: EstimateTarget | null; nextQuarter: EstimateTarget | null; historySince: string | null };

function target(history: EstimateRow[], today: string): EstimateTarget | null {
  const now = consensusOn(history, today);
  if (!now) return null;
  // A "forecast" with no analysts behind it is FMP's placeholder (TN.CN: 0 analysts, EPS $0.00) — not a forecast.
  if (!((now.analystsEps ?? 0) > 0 || (now.analystsRevenue ?? 0) > 0)) return null;
  return {
    targetEnd: now.targetEnd,
    revenueAvg: n(now.revenueAvg),
    revenueLow: n(now.revenueLow),
    revenueHigh: n(now.revenueHigh),
    epsAvg4: now.epsAvg4,
    epsLow4: now.epsLow4,
    epsHigh4: now.epsHigh4,
    analysts: now.analystsEps ?? now.analystsRevenue,
    rev30: revision(history, today, 30),
    rev90: revision(history, today, 90),
  };
}

/** `after` = the newest REPORTED period end: "next quarter" is the first one not yet reported, which
 *  can already be in the past (SHOP's Sep quarter, reported in November). */
function estimatesOut(rows: EstimateRow[], today: string, after: string): EstimatesOut | null {
  if (rows.length === 0) return null;
  const by = new Map<string, EstimateRow[]>();
  for (const r of rows) {
    const k = `${r.period}|${r.targetEnd}`;
    by.set(k, [...(by.get(k) ?? []), r]);
  }
  const future = (period: string) =>
    [...by.entries()]
      .filter(([k]) => k.startsWith(`${period}|`) && k.split("|")[1] > after)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, h]) => h);
  const fy = future("FY");
  const q = future("Q");
  return {
    nextYear: fy[0] ? target(fy[0], today) : null,
    followingYear: fy[1] ? target(fy[1], today) : null,
    nextQuarter: q[0] ? target(q[0], today) : null,
    historySince: rows.reduce<string | null>((a, r) => (a == null || r.asOf < a ? r.asOf : a), null),
  };
}

type HealthOut = {
  date: string;
  piotroski: number | null;
  altmanZ: number | null; // null for financials (R3)
  freeFloatBps: number | null;
  sharesOutstanding: number | null;
  fmpRating: string | null;
  fmpDcfCents: number | null; // null when ≤ 0 or financial (R4)
  fmpDcfPriceCents: number | null;
};

type SegmentOut = { periodEnd: string; period: string; currency: string | null; parts: Array<{ name: string; cents: number }> };

function segmentOut(row: { periodEnd: string; period: string; currency: string | null; data: unknown } | null, today: string): SegmentOut | null {
  if (!row) return null;
  const age = (Date.parse(today) - Date.parse(row.periodEnd)) / 86_400_000;
  if (age > SEGMENT_MAX_AGE_DAYS) return null;
  const parts = Object.entries((row.data ?? {}) as Record<string, number>)
    .filter(([, v]) => typeof v === "number" && v > 0)
    .map(([name, cents]) => ({ name, cents }))
    .sort((a, b) => b.cents - a.cents);
  return parts.length >= 2 ? { periodEnd: row.periodEnd, period: row.period, currency: row.currency, parts } : null; // one segment is no chart
}

type CallOut = { fiscalYear: number; fiscalQuarter: number; callDate: string; summary: CallSummary | null };

export async function financialsView(key: string): Promise<FinancialsView> {
  const k = key.toUpperCase();
  const today = etDateStr();
  const st = await getStatus(k);
  if (!st) return { kind: "none", reason: "not-fetched" };
  if (st.isEtf || st.isFund) return { kind: "etf", name: st.companyName };
  const periods = await getPeriods(k);
  const h = headline(periods, { sector: st.sector, splits: splitsOf(st) });
  if (!h) return { kind: "none", reason: st.statementsCovered === false ? "no-statements" : "not-fetched" };
  const financial = isFinancialSector(st.sector);

  const [est, health, product, geographic, call, filings, insider] = await Promise.all([
    getEstimates(k),
    prisma.companyHealth.findFirst({ where: { symbol: k }, orderBy: { date: "desc" } }),
    prisma.revenueSegment.findFirst({ where: { symbol: k, kind: "product" }, orderBy: [{ periodEnd: "desc" }, { period: "asc" }] }),
    prisma.revenueSegment.findFirst({ where: { symbol: k, kind: "geographic" }, orderBy: [{ periodEnd: "desc" }, { period: "asc" }] }),
    prisma.earningsCall.findFirst({ where: { symbol: k }, orderBy: { callDate: "desc" } }),
    prisma.companyFiling.findMany({ where: { symbol: k }, orderBy: { filedAt: "desc" }, take: 8 }),
    prisma.insiderQuarter.findMany({ where: { symbol: k }, orderBy: [{ year: "desc" }, { quarter: "desc" }], take: 8 }),
  ]);

  return {
    kind: "company",
    name: st.companyName,
    sector: st.sector,
    financial,
    currency: h.currency,
    headline: headlineOut(h),
    quarters: seriesOut(quarterSeries(periods, 8, st.sector)),
    estimates: estimatesOut(est, today, h.asOf),
    health: health
      ? {
          date: health.date,
          piotroski: health.piotroski,
          altmanZ: financial ? null : health.altmanZ,
          freeFloatBps: health.freeFloatBps,
          sharesOutstanding: n(health.sharesOutstanding),
          fmpRating: health.fmpRating,
          fmpDcfCents: !financial && health.fmpDcfCents != null && health.fmpDcfCents > 0 ? health.fmpDcfCents : null,
          fmpDcfPriceCents: health.fmpDcfPriceCents,
        }
      : null,
    segments: { product: segmentOut(product, today), geographic: segmentOut(geographic, today) },
    call: call ? { fiscalYear: call.fiscalYear, fiscalQuarter: call.fiscalQuarter, callDate: call.callDate, summary: (call.summary as CallSummary | null) ?? null } : null,
    filings: filings.map((f) => ({ form: f.form, filedAt: f.filedAt, url: f.url, docUrl: f.docUrl })),
    insider: insider.map((r) => ({ year: r.year, quarter: r.quarter, buys: r.buys, sells: r.sells, acquired: r.acquired, disposed: r.disposed })),
    updatedAt: st.statementsAt?.toISOString() ?? null,
  };
}

export type { Growth };
