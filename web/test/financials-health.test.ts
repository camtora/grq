// D140 display round 2 — health in dollars (lib/financials/derive.ts healthFacts/healthChecks).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { healthFacts, healthChecks, growth, type PeriodRow } from "../lib/financials/derive";

const B = (n: number) => BigInt(n) * 100n;

function q(periodEnd: string, over: Partial<PeriodRow> = {}): PeriodRow {
  return {
    period: "Q1", fiscalYear: 2026, periodEnd, currency: "USD",
    revenue: B(100), costOfRevenue: B(40), grossProfit: B(60), totalEquity: B(500), operatingIncome: B(20), netIncome: B(15), epsDiluted4: 10_000,
    sharesDiluted: 1000n, operatingCashFlow: B(25), capex: B(-5), freeCashFlow: B(20), cash: B(50), totalDebt: B(30),
    interestExpense: B(1), buybacks: B(-3), dividendsPaid: B(-2), stockComp: B(1),
    ...over,
  };
}
const four = (over: Partial<PeriodRow> = {}, latest: Partial<PeriodRow> = {}) => [
  q("2026-06-30", { ...over, ...latest }),
  q("2026-03-31", over),
  q("2025-12-31", over),
  q("2025-09-30", over),
];
const keys = (c: ReturnType<typeof healthChecks>) => Object.fromEntries(c.map((x) => [x.key, x.tone]));
const none = { roeBps: null, netIncomeYoY: null, shareChangeYoY: null };

describe("health facts", () => {
  it("a year of interest and payouts, in dollars", () => {
    const f = healthFacts(four())!;
    assert.equal(f.interestTtm, B(4));
    assert.equal(f.interestCoverX10, 200); // 80 of operating profit ÷ 4 of interest = 20×
    assert.equal(f.buybacksTtm, B(12)); // cash out reads positive
    assert.equal(f.dividendsTtm, B(8));
    assert.equal(f.netDebt, B(-20)); // 30 debt − 50 cash
    assert.equal(f.debtYearsX10, null); // holds more cash than debt: nothing to pay off
  });
  it("years to clear the debt from free cash", () => {
    const f = healthFacts(four({}, { cash: B(10), totalDebt: B(250) }))!;
    assert.equal(f.debtYearsX10, 30); // 240 ÷ 80 a year = 3.0 years
  });
  it("runway only when it burns cash and holds net cash", () => {
    const f = healthFacts(four({ freeCashFlow: B(-10) }, { cash: B(100), totalDebt: B(10) }))!;
    assert.equal(f.runwayMonths, 27); // 90 ÷ 40 a year × 12 = 27
    assert.equal(healthFacts(four({ freeCashFlow: B(-10) }, { cash: B(41), totalDebt: B(10) }))!.runwayMonths, 9); // 9.3 rounds, never floors past a month
    assert.equal(healthFacts(four({ freeCashFlow: B(-10) }, { cash: B(5), totalDebt: B(10) }))!.runwayMonths, null);
  });
  it("a missing quarter blanks the year, never quietly sums three", () => {
    const rows = four();
    rows[2] = { ...rows[2], interestExpense: null };
    assert.equal(healthFacts(rows)!.interestTtm, null);
    assert.equal(healthFacts(rows)!.interestCoverX10, null);
  });
  it("a bank gets no debt, interest or free-cash lines", () => {
    const f = healthFacts(four(), "Financial Services")!;
    assert.equal(f.financial, true);
    assert.equal(f.netDebt, null);
    assert.equal(f.interestTtm, null);
    assert.equal(f.fcfTtm, null);
    assert.equal(f.dividendsTtm, B(8)); // payouts still count
  });
});

describe("the checklist grades", () => {
  it("cash-rich and covering interest 20× is green across", () => {
    const c = keys(healthChecks(healthFacts(four())!, { ...none, shareChangeYoY: growth(990, 1000) }));
    assert.deepEqual(c, { debt: "good", interest: "good", cash: "good", shares: "good" });
  });
  it("debt beyond six years of free cash is heavy; owing with no free cash is bad", () => {
    assert.equal(keys(healthChecks(healthFacts(four({}, { cash: B(0), totalDebt: B(500) }))!, none)).debt, "bad"); // 6.25 yrs
    assert.equal(keys(healthChecks(healthFacts(four({}, { cash: B(0), totalDebt: B(400) }))!, none)).debt, "ok"); // 5.0 yrs
    assert.equal(keys(healthChecks(healthFacts(four({ freeCashFlow: B(-1) }, { cash: B(0), totalDebt: B(10) }))!, none)).debt, "bad");
  });
  it("interest cover bands: ≥ 8× easy, 3–8× ok, < 3× tight (for a company that owes more than it holds)", () => {
    const at = (op: number) => keys(healthChecks(healthFacts(four({ operatingIncome: B(op), interestExpense: B(1) }, { cash: B(0), totalDebt: B(100) }))!, none)).interest;
    assert.equal(at(8), "good");
    assert.equal(at(5), "ok");
    assert.equal(at(2), "bad");
    assert.equal(at(-5), "bad"); // losing money at the operating line
  });
  it("a loss-maker holding more cash than debt isn't flagged on interest (TN.CN: $3.7K of interest, $878K net cash)", () => {
    assert.equal(keys(healthChecks(healthFacts(four({ operatingIncome: B(-50), interestExpense: B(1) }))!, none)).interest, "good");
  });
  it("no interest bill counts as fine only when it holds more cash than debt", () => {
    assert.equal(keys(healthChecks(healthFacts(four({ interestExpense: 0n }))!, none)).interest, "good");
    assert.equal(keys(healthChecks(healthFacts(four({ interestExpense: 0n }, { cash: B(0), totalDebt: B(100) }))!, none)).interest, undefined);
  });
  it("burning cash: two years of runway is a watch, less is a problem", () => {
    assert.equal(keys(healthChecks(healthFacts(four({ freeCashFlow: B(-10) }, { cash: B(100), totalDebt: B(10) }))!, none)).cash, "ok");
    assert.equal(keys(healthChecks(healthFacts(four({ freeCashFlow: B(-10) }, { cash: B(50), totalDebt: B(10) }))!, none)).cash, "bad");
  });
  it("dilution bands", () => {
    const at = (cur: number) => keys(healthChecks(healthFacts(four())!, { ...none, shareChangeYoY: growth(cur, 1000) })).shares;
    assert.equal(at(1020), "good");
    assert.equal(at(1050), "ok");
    assert.equal(at(1060), "bad");
  });
  it("a bank is graded on return on equity and its profit trend", () => {
    const c = keys(healthChecks(healthFacts(four(), "Financial Services")!, { roeBps: 1450, netIncomeYoY: growth(111, 100), shareChangeYoY: null }));
    assert.deepEqual(c, { profit: "good", trend: "good" });
  });
});
