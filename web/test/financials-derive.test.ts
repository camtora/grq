// D140 — the pure financials math (lib/financials/derive.ts). Every rule a panel could quietly lie by.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  toMinor, toEps4, toWhole, growth, ratioBps, quarters, yearAgo, prevQuarter, ttm, fcf, shareChange,
  headline, quarterSeries, estimateChanged, consensusOn, revision, targetsToKeep, keepFiling, isFinancialSector,
  type PeriodRow, type EstimateRow,
} from "../lib/financials/derive";

const B = (n: number) => BigInt(n) * 100n; // whole units → cents

function q(period: string, fiscalYear: number, periodEnd: string, over: Partial<PeriodRow> = {}): PeriodRow {
  return {
    period, fiscalYear, periodEnd, currency: "USD",
    revenue: B(100), costOfRevenue: B(40), grossProfit: B(60), operatingIncome: B(20), netIncome: B(15), epsDiluted4: 10_000,
    sharesDiluted: 1000n, operatingCashFlow: B(25), capex: B(-5), freeCashFlow: B(20), cash: B(50), totalDebt: B(30),
    ...over,
  };
}

// NVDA-shaped: fiscal year ends late January, so Q2 ends in July.
const nvdaLike = (): PeriodRow[] => [
  q("Q2", 2027, "2026-07-26", { revenue: B(200), epsDiluted4: 24_600, sharesDiluted: 1000n }),
  q("Q1", 2027, "2026-04-26", { revenue: B(180) }),
  q("Q4", 2026, "2026-01-25", { revenue: B(160) }),
  q("Q3", 2026, "2025-10-26", { revenue: B(140) }),
  q("Q2", 2026, "2025-07-27", { revenue: B(100), epsDiluted4: 12_300, sharesDiluted: 1010n }),
  q("Q1", 2026, "2025-04-27", { revenue: B(90) }),
  q("Q4", 2025, "2025-01-26", { revenue: B(80) }),
  q("FY", 2026, "2026-01-25", { revenue: B(570) }),
];

describe("conversion from FMP floats", () => {
  it("money to cents, exactly, however large", () => {
    assert.equal(toMinor(96221000000), 9622100000000n);
    assert.equal(toMinor(441630656000000), 44163065600000000n); // TSM-scale TWD, past 2^53 in cents
    assert.equal(toMinor(12.345), 1235n);
    assert.equal(toMinor(null), null);
    assert.equal(toMinor(NaN), null);
  });
  it("EPS to 4 dp, half away from zero (P0 R8)", () => {
    assert.equal(toEps4(-0.0022), -22);
    assert.equal(toEps4(0.0579), 579);
    assert.equal(toEps4(-0.00005), -1);
    assert.equal(toEps4(2.46), 24_600);
  });
  it("counts to whole units", () => assert.equal(toWhole(1841385000.4), 1841385000n));
});

describe("growth never prints a fake percentage", () => {
  it("ordinary growth in bps", () => assert.deepEqual(growth(B(120), B(100)), { kind: "ok", bps: 2000 }));
  it("a negative base is n/m, not +200%", () => assert.deepEqual(growth(B(1), B(-1)), { kind: "nm", reason: "negative-base" }));
  it("a zero base is n/m", () => assert.deepEqual(growth(5, 0), { kind: "nm", reason: "zero-base" }));
  it("a fall from a positive base into a loss is still a real number", () => assert.deepEqual(growth(-50, 100), { kind: "ok", bps: -15000 }));
  it("missing either side → null", () => assert.equal(growth(null, 5), null));
  it("ratio needs a positive whole", () => {
    assert.equal(ratioBps(B(20), B(100)), 2000);
    assert.equal(ratioBps(B(20), B(0)), null);
    assert.equal(ratioBps(B(20), B(-5)), null);
  });
});

describe("fiscal periods (P0 R10)", () => {
  it("year-ago is the same FISCAL quarter, by label", () => {
    const qs = quarters(nvdaLike());
    assert.equal(yearAgo(qs, qs[0])?.periodEnd, "2025-07-27");
  });
  it("annual rows never leak into the quarter list", () => assert.ok(quarters(nvdaLike()).every((r) => r.period !== "FY")));
  it("falls back to ~1 year earlier by date when labels don't line up", () => {
    const qs = quarters([q("Q1", 2026, "2026-03-31"), q("Q4", 2024, "2025-03-31")]); // fiscal-year change
    assert.equal(yearAgo(qs, qs[0])?.periodEnd, "2025-03-31");
  });
  it("a gap in the data is not the previous quarter", () => {
    const qs = quarters([q("Q3", 2026, "2026-09-30"), q("Q1", 2026, "2026-03-31")]);
    assert.equal(prevQuarter(qs, qs[0]), null);
  });
  it("TTM needs four consecutive quarters, never annualises", () => {
    const qs = quarters(nvdaLike());
    assert.equal(ttm(qs, "revenue"), B(200 + 180 + 160 + 140));
    assert.equal(ttm(qs.slice(0, 3), "revenue"), null);
    const gappy = quarters([q("Q4", 2026, "2026-12-31"), q("Q3", 2026, "2026-09-30"), q("Q1", 2026, "2026-03-31"), q("Q4", 2025, "2025-12-31")]);
    assert.equal(ttm(gappy, "revenue"), null);
  });
});

describe("cash flow", () => {
  it("prefers FMP's own free cash flow", () => assert.equal(fcf({ freeCashFlow: B(7), operatingCashFlow: B(25), capex: B(-5) }), B(7)));
  it("otherwise OCF less capex, whichever sign capex carries", () => {
    assert.equal(fcf({ freeCashFlow: null, operatingCashFlow: B(25), capex: B(-5) }), B(20));
    assert.equal(fcf({ freeCashFlow: null, operatingCashFlow: B(25), capex: B(5) }), B(20));
  });
});

describe("splits (P0 R9)", () => {
  const splits = [{ date: "2024-06-10", numerator: 10, denominator: 1 }];
  it("an unrestated pre-split count is adjusted, not reported as +900% dilution", () => {
    const cur = q("Q2", 2025, "2024-07-28", { sharesDiluted: 24_500n });
    const prev = q("Q2", 2024, "2023-07-30", { sharesDiluted: 2_490n });
    const g = shareChange(cur, prev, splits);
    assert.equal(g?.kind, "ok");
    assert.ok(g?.kind === "ok" && Math.abs(g.bps) < 200, `got ${JSON.stringify(g)}`);
  });
  it("an already-restated count is left alone", () => {
    const cur = q("Q2", 2025, "2024-07-28", { sharesDiluted: 24_500n });
    const prev = q("Q2", 2024, "2023-07-30", { sharesDiluted: 24_900n });
    const g = shareChange(cur, prev, splits);
    assert.ok(g?.kind === "ok" && g.bps < 0 && g.bps > -300);
  });
});

describe("the headline", () => {
  it("growth, acceleration, EPS and buybacks from an NVDA-shaped company", () => {
    const h = headline(nvdaLike())!;
    assert.equal(h.label, "FY2027 Q2");
    assert.deepEqual(h.revenueYoY, { kind: "ok", bps: 10000 }); // 200 vs 100
    // two quarters back: Q4 FY26 160 vs Q4 FY25 80 = +100% → acceleration 0
    assert.equal(h.revenueAccelBps, 0);
    assert.deepEqual(h.epsYoY, { kind: "ok", bps: 10000 });
    assert.ok(h.shareChangeYoY?.kind === "ok" && h.shareChangeYoY.bps < 0); // 1010 → 1000 = buybacks
    assert.equal(h.grossMarginBps, 3000); // 60 / 200
    assert.equal(h.quartersAvailable, 7);
  });
  it("a bank's revenue is NET of interest paid, so FMP's gross/net flip isn't growth (measured on C, RY)", () => {
    // C as FMP served it 2026-10-22: Q3 2026 on a NET basis, Q3 2025 on a GROSS basis.
    const c = [
      q("Q3", 2026, "2026-09-30", { revenue: B(23813), costOfRevenue: B(2586) }),
      q("Q3", 2025, "2025-09-30", { revenue: B(43845), costOfRevenue: B(24188) }),
    ];
    const h = headline(c, { sector: "Financial Services" })!;
    assert.equal(h.revenueBasis, "net-revenue");
    assert.deepEqual(h.revenueYoY, { kind: "ok", bps: 799 }); // 21227 vs 19657, not −45.7%
    // RY: gross now, net (cost of revenue 0) a year ago.
    const ry = [q("Q3", 2026, "2026-07-31", { revenue: B(38632), costOfRevenue: B(18841) }), q("Q3", 2025, "2025-07-31", { revenue: B(16104), costOfRevenue: B(0) })];
    assert.deepEqual(headline(ry, { sector: "Financial Services" })!.revenueYoY, { kind: "ok", bps: 2289 }); // 19791 vs 16104, not +139.9%
  });
  it("a non-financial whose basis flips is n/m, never a percentage", () => {
    const x = [q("Q3", 2026, "2026-09-30", { revenue: B(200), costOfRevenue: B(80) }), q("Q3", 2025, "2025-09-30", { revenue: B(100), costOfRevenue: B(0) })];
    assert.deepEqual(headline(x)!.revenueYoY, { kind: "nm", reason: "basis-changed" });
  });
  it("a bank's card drops gross margin, FCF margin and net debt (P0 R3)", () => {
    assert.ok(isFinancialSector("Financial Services"));
    const h = headline(nvdaLike(), { sector: "Financial Services" })!;
    assert.equal(h.grossMarginBps, null);
    assert.equal(h.fcfMarginBps, null);
    assert.equal(h.netDebt, null);
    assert.notEqual(h.netMarginBps, null);
  });
  it("no quarters → null", () => assert.equal(headline([q("FY", 2025, "2025-12-31")]), null));
  it("the series runs oldest → newest", () => {
    const s = quarterSeries(nvdaLike(), 4);
    assert.deepEqual(s.map((x) => x.periodEnd), ["2025-10-26", "2026-01-25", "2026-04-26", "2026-07-26"]);
  });
});

describe("estimates: stored on change, revisions from our own history (P0 R7)", () => {
  const e = (asOf: string, eps: number, rev = 1000): EstimateRow => ({
    period: "FY", targetEnd: "2027-01-31", asOf,
    revenueAvg: B(rev), revenueLow: null, revenueHigh: null, netIncomeAvg: null,
    epsAvg4: eps, epsLow4: null, epsHigh4: null, analystsRevenue: 10, analystsEps: 10,
  });
  it("only a moved consensus is written", () => {
    assert.equal(estimateChanged(null, e("2026-10-01", 100)), true);
    assert.equal(estimateChanged(e("2026-10-01", 100), e("2026-10-02", 100)), false);
    assert.equal(estimateChanged(e("2026-10-01", 100), e("2026-10-02", 101)), true);
  });
  it("the consensus on a day is the newest row first seen by then", () => {
    const h = [e("2026-08-01", 100), e("2026-09-15", 110), e("2026-10-10", 120)];
    assert.equal(consensusOn(h, "2026-09-30")?.epsAvg4, 110);
    assert.equal(consensusOn(h, "2026-07-01"), null);
  });
  it("a 30-day revision", () => {
    const h = [e("2026-08-01", 100, 1000), e("2026-10-10", 110, 1050)];
    const r = revision(h, "2026-10-22", 30);
    assert.deepEqual(r, { kind: "ok", days: 30, eps: { kind: "ok", bps: 1000 }, revenue: { kind: "ok", bps: 500 } });
  });
  it("says 'building' until our history reaches back far enough", () => {
    assert.deepEqual(revision([e("2026-10-15", 100)], "2026-10-22", 30), { kind: "building", daysOfHistory: 7 });
    assert.deepEqual(revision([], "2026-10-22", 30), { kind: "building", daysOfHistory: 0 });
  });
  it("keeps only the near targets, plus one just ended", () => {
    const rows = ["2031-01-25", "2030-01-25", "2029-01-25", "2028-01-25", "2027-01-25", "2026-01-25", "2026-09-01"].map((date) => ({ date }));
    assert.deepEqual(targetsToKeep(rows, "2026-10-22", 3), ["2026-09-01", "2027-01-25", "2028-01-25"]);
  });
});

describe("filings (P0 R6)", () => {
  it("keeps the forms that matter, drops the bank-note flood and Form 4", () => {
    for (const f of ["8-K", "10-Q", "10-K", "6-K", "40-F", "DEF 14A"]) assert.ok(keepFiling(f), f);
    for (const f of ["424B2", "FWP", "4", "4/A", "NPORT-P", "497"]) assert.ok(!keepFiling(f), f);
  });
});
