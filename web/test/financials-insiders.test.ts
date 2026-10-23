// D140 display round 5 — insiders in dollars (lib/financials/insiders.ts).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { insiderSummary, insiderRole, insiderDisplayName } from "../lib/financials/insiders";

const t = (name: string, side: string, usd: number, day: string, title: string | null = "director") => ({ insiderName: name, insiderTitle: title, side, valueUsd: usd, shares: 1, txnDate: new Date(`${day}T00:00:00Z`) });

describe("insider summary", () => {
  const trades = [
    t("Huang Jen Hsun", "SELL", 100_000_000.4, "2026-09-01", "officer: President and CEO"),
    t("Huang Jen Hsun", "SELL", 50_000_000, "2026-06-01", "officer: President and CEO"),
    t("Stevens Mark A", "SELL", 20_000_000, "2026-03-01"),
    t("Dabiri John", "BUY", 1_000_000, "2026-08-15"),
    t("Old Seller", "SELL", 999_000_000, "2025-09-01"), // outside the year
  ];
  const s = insiderSummary(trades, "2026-10-23");
  it("sums a year of buys and sells in cents, by trade and by person", () => {
    assert.equal(s.since, "2025-10-23");
    assert.deepEqual(s.sells, { count: 3, cents: 17_000_000_040, people: 2 });
    assert.deepEqual(s.buys, { count: 1, cents: 100_000_000, people: 1 });
  });
  it("ranks people by dollars traded, either way", () => {
    assert.deepEqual(s.people.map((p) => [p.name, p.soldCents, p.boughtCents, p.trades, p.last]), [
      ["Jen Hsun Huang", 15_000_000_040, 0, 2, "2026-09-01"],
      ["Mark A. Stevens", 2_000_000_000, 0, 1, "2026-03-01"],
      ["John Dabiri", 0, 100_000_000, 1, "2026-08-15"],
    ]);
    assert.equal(s.people[0].title, "President and CEO");
  });
  it("nothing traded → zeros, not a crash", () => assert.deepEqual(insiderSummary([], "2026-10-23").sells, { count: 0, cents: 0, people: 0 }));
  it("roles read plainly", () => {
    assert.equal(insiderRole("officer: EVP, Worldwide Field Ops"), "EVP, Worldwide Field Ops");
    assert.equal(insiderRole("10 percent owner"), "10% owner");
    assert.equal(insiderRole("director"), "Director");
    assert.equal(insiderRole("director, officer: Chief Executive Officer"), "Director, Chief Executive Officer");
  });
  it("names read the usual way round; entities are left alone", () => {
    assert.equal(insiderDisplayName("STEVENS MARK A"), "Mark A. Stevens");
    assert.equal(insiderDisplayName("Kress Colette"), "Colette Kress");
    assert.equal(insiderDisplayName("Shopify Strategic Holdings 3 LLC"), "Shopify Strategic Holdings 3 LLC");
    assert.equal(insiderDisplayName("Madonna"), "Madonna");
  });
});
