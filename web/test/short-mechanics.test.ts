import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  proceedsCents,
  liabilityCents,
  shortUnrealizedCents,
  coverRealizedCents,
  accrueBorrowCents,
  modeledBorrowBps,
  bookEquityCents,
  maintenanceReqCents,
  marginHealth,
} from "@/lib/short/mechanics";

// All cents / whole shares. Educational, modeled — the fund never shorts (rule #3). These lock the
// short-selling mechanics, above all the MARGIN CALL (docs/SHORT-LAB.md).

describe("short P&L direction — profit falls, loss is unbounded", () => {
  it("opens with proceeds credited and a buy-back liability", () => {
    assert.equal(proceedsCents(100, 5000), 500000); // short 100 @ $50 → $5,000 cash in
    assert.equal(liabilityCents(100, 5000), 500000); // owe $5,000 to buy back at $50
  });
  it("profits as the price falls", () => {
    assert.equal(shortUnrealizedCents(100, 5000, 4000), 100000); // $50 → $40 = +$1,000
  });
  it("loses as the price rises — and the loss has no cap", () => {
    assert.equal(shortUnrealizedCents(100, 5000, 6000), -100000); // $50 → $60 = −$1,000
    assert.equal(shortUnrealizedCents(100, 5000, 20000), -1_500_000); // $50 → $200 = −$15,000 (unbounded)
  });
  it("nets borrow carry out of unrealized P&L", () => {
    assert.equal(shortUnrealizedCents(100, 5000, 4000, 3000), 97000); // +$1,000 minus $30 borrow
  });
  it("realizes P&L on cover net of borrow + commission", () => {
    assert.equal(coverRealizedCents(100, 5000, 4200, 1500, 100), 78400); // ($50−$42)×100 − $15 − $1
  });
});

describe("borrow carry — the rent on a short", () => {
  it("accrues notional × rate × days/365", () => {
    assert.equal(accrueBorrowCents(500000, 500, 365), 25000); // $5,000 @ 5%/yr for a year = $250
    assert.equal(accrueBorrowCents(500000, 500, 30), 2055); // ~a month
    assert.equal(accrueBorrowCents(500000, 0, 365), 0); // free to borrow → nothing
  });
  it("models a steeper rate for hard-to-borrow names", () => {
    assert.ok(modeledBorrowBps({ priceCents: 20000, shortInterestPct: 35 }) > modeledBorrowBps({ priceCents: 20000, shortInterestPct: 2 }));
    assert.equal(modeledBorrowBps({ priceCents: 20000 }), 50); // liquid large cap default
    assert.ok(modeledBorrowBps({ priceCents: 200 }) >= 2000); // sub-$3 name is expensive
  });
});

describe("MARGIN CALL — why shorts blow up", () => {
  const cash = 15_000_000; // $100k starting collateral + $5m proceeds from the short below
  // Short 1000 shares @ $50 → proceeds $5m already folded into `cash`.
  it("equity equals the starting collateral at open (mark = short price)", () => {
    const lots = [{ qty: 1000, markCents: 5000 }];
    assert.equal(bookEquityCents(cash, lots), 10_000_000); // back to the $100k collateral
    const h = marginHealth(cash, lots, 30);
    assert.equal(h.call, false);
    assert.equal(h.requiredCents, 1_500_000); // 30% of $5m short value
  });
  it("a modest drop is fine and profitable", () => {
    const h = marginHealth(cash, [{ qty: 1000, markCents: 4000 }], 30); // $50 → $40
    assert.equal(h.call, false);
    assert.equal(h.equityCents, 11_000_000); // +$10k profit on the collateral
    assert.ok(h.cushionCents > 9_000_000); // cushion grew (equity up, requirement down)
  });
  it("a big rally erases the collateral and triggers a forced-cover call BEFORE equity hits zero", () => {
    const lots = [{ qty: 1000, markCents: 14500 }]; // $50 → $145 (a 2.9× squeeze)
    const h = marginHealth(cash, lots, 30);
    assert.equal(bookEquityCents(cash, lots), 500_000); // still +$5k of equity...
    assert.equal(h.requiredCents, 4_350_000); // ...but 30% of a $14.5m short position is way more
    assert.equal(h.call, true); // equity < requirement → margin call
    assert.ok(h.cushionCents < 0);
  });
  it("no positions ⇒ never a call", () => {
    assert.equal(marginHealth(10_000_000, [], 30).call, false);
  });
});

describe("book-level aggregates", () => {
  it("maintenance requirement is maintPct of total short market value across lots", () => {
    const lots = [{ qty: 100, markCents: 5000 }, { qty: 50, markCents: 20000 }]; // $5k + $10k = $15k
    assert.equal(maintenanceReqCents(lots, 30), 450000); // 30% of $15,000
  });
});
