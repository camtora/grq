// The stock page's 10-tier data-coverage map (lib/coverage.ts) — one builder for web + app.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildCoverage, type CoverageIn } from "../lib/coverage";

const base: CoverageIn = {
  closes: 180, analyst: true, grades: true, marketCap: true, cadListing: false,
  refused: { analyst: false, earnings: false, thirteenF: false },
  earnings: { next: "2026-11-20", last: "2026-08-26" }, callSummarized: true, news: 5,
  institutional: { holders: 1988, change: -460 }, options: { regime: "positive", pcOI: 0.99 }, social: { mentions: 40, velocity: 0.6 },
  financials: { quarters: 12, estimates: true, health: true, segments: true },
  insiders: { sec: { crossListed: false, filesUsReports: true }, pulled: true, buys: 0, sells: 213, buyCents: 0, sellCents: 170_500_000_000 },
  insiderBuys90d: 0,
};
const row = (c: CoverageIn, tier: number) => buildCoverage(c).find((r) => r.tier === tier)!;

describe("coverage map", () => {
  it("lists every tier in order", () => assert.deepEqual(buildCoverage(base).map((r) => r.tier), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
  it("fundamentals name what's actually behind the page", () => {
    assert.equal(row(base, 2).detail, "statements (12 quarters) · analyst forecasts · price targets · ratings · health scores · segments");
    assert.equal(row(base, 2).status, "live");
  });
  it("a Toronto name never blames the data plan without a real refusal (the Starter-week copy did, forever)", () => {
    const ca = { ...base, cadListing: true, analyst: false, grades: false, financials: null, earnings: null };
    assert.doesNotMatch(row(ca, 2).detail + row(ca, 6).detail, /plan/);
    const refused = { ...ca, refused: { analyst: true, earnings: true, thirteenF: false } };
    assert.match(row(refused, 2).detail, /market-data plan/);
    assert.match(row(refused, 6).detail, /market-data plan/);
  });
  it("insiders: a year of the company's own Form 4s, in dollars", () => {
    assert.equal(row(base, 4).detail, "213 sales (US$1.7B), no buys in 12 months · the company's own open-market Form 4s");
    assert.equal(row(base, 4).status, "live");
  });
  it("insiders: a 40-F filer's people report on SEDI — partial, said so", () => {
    const ry = { ...base, insiders: { ...base.insiders!, sec: { crossListed: true, filesUsReports: false }, sells: 0, sellCents: 0 } };
    assert.equal(row(ry, 4).status, "partial");
    assert.match(row(ry, 4).detail, /40-F/);
  });
  it("insiders: no SEC filer we can match → partial", () => assert.equal(row({ ...base, insiders: { ...base.insiders!, sec: null } }, 4).status, "partial"));
  it("macro is Canada AND the US", () => assert.match(row(base, 9).detail, /Bank of Canada \+ FRED/));
  it("options and social are live when present (the app's old copy called them 'later')", () => {
    assert.equal(row(base, 3).status, "live");
    assert.equal(row(base, 8).status, "live");
  });
  it("the earnings line says when the last call is summarized", () => assert.equal(row(base, 6).detail, "next 2026-11-20 · last call summarized"));
});
