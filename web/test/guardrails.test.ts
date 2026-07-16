import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isValidQty,
  meetsConviction,
  breachesPositionCap,
  breachesCashFloor,
  fundingShortfallCents,
  shortingShortfallQty,
  breachesFeeBudget,
  breachesFeeEdge,
  breachesOptionPremiumCap,
  optionPremiumCents,
} from "@/lib/broker/guardrails";
import { ibkrFixedCommissionCents, ibkrOptionCommissionCents } from "@/lib/broker/sim";

describe("isValidQty — rule #4: whole, positive shares", () => {
  it("accepts positive whole numbers", () => {
    assert.equal(isValidQty(1), true);
    assert.equal(isValidQty(100), true);
  });
  it("rejects zero and negatives", () => {
    assert.equal(isValidQty(0), false);
    assert.equal(isValidQty(-1), false);
  });
  it("rejects fractional shares (no floats, ever)", () => {
    assert.equal(isValidQty(1.5), false);
    assert.equal(isValidQty(0.5), false);
    assert.equal(isValidQty(10.0001), false);
  });
  it("rejects NaN and Infinity", () => {
    assert.equal(isValidQty(NaN), false);
    assert.equal(isValidQty(Infinity), false);
  });
});

describe("meetsConviction — BUYs need ≥ minBuyConfidence", () => {
  it("passes at or above the bar", () => {
    assert.equal(meetsConviction(80, 75), true);
    assert.equal(meetsConviction(75, 75), true); // boundary inclusive
  });
  it("fails below the bar", () => {
    assert.equal(meetsConviction(74, 75), false);
  });
  it("fails when confidence is unstated or not a number", () => {
    assert.equal(meetsConviction(undefined, 75), false);
    assert.equal(meetsConviction(NaN, 75), false);
  });
});

describe("breachesPositionCap — ≤ maxPositionPct of NAV", () => {
  const nav = 1_000_000; // cap at 20% = 200_000
  it("breaches strictly above the cap", () => {
    assert.equal(breachesPositionCap(200_001, nav, 20), true);
  });
  it("allows exactly at the cap and below", () => {
    assert.equal(breachesPositionCap(200_000, nav, 20), false);
    assert.equal(breachesPositionCap(199_999, nav, 20), false);
  });
});

describe("breachesCashFloor — cash after buy ≥ cashFloorPct of NAV", () => {
  const nav = 1_000_000; // floor at 10% = 100_000
  it("breaches strictly below the floor", () => {
    assert.equal(breachesCashFloor(99_999, nav, 10), true);
  });
  it("allows exactly at the floor and above", () => {
    assert.equal(breachesCashFloor(100_000, nav, 10), false);
    assert.equal(breachesCashFloor(100_001, nav, 10), false);
  });
});

describe("fundingShortfallCents — no margin (guardrail #3)", () => {
  it("reports the positive shortfall when underfunded", () => {
    // 10 @ $100 + $1 commission = $1001; hold $1000 → short $1
    assert.equal(fundingShortfallCents(10, 10000, 100, 100_000), 100);
  });
  it("is ≤ 0 (covered) when cash meets or exceeds the cost", () => {
    assert.equal(fundingShortfallCents(10, 10000, 100, 100_100), 0); // exactly covered
    assert.ok(fundingShortfallCents(10, 10000, 100, 200_000) < 0); // ample
  });
});

describe("shortingShortfallQty — no shorting (guardrail #3)", () => {
  it("allows selling less than, or exactly, what is held", () => {
    assert.ok(shortingShortfallQty(10, 24) < 0); // partial exit
    assert.equal(shortingShortfallQty(24, 24), 0); // full exit, exactly flat
  });
  it("reports the positive shortfall when the sale would exceed the position", () => {
    assert.equal(shortingShortfallQty(25, 24), 1);
  });
  it("refuses any sale once flat — a held qty of 0 can't fund a single share", () => {
    assert.equal(shortingShortfallQty(1, 0), 1);
  });
  it("refuses to deepen an existing short (negative held qty)", () => {
    assert.equal(shortingShortfallQty(24, -72), 96);
  });
  it("rejects the 2026-07-16 CCO oversell: a stop re-firing against an unabsorbed fill", () => {
    // The mirror still read 24 shares, but the first stop had already sold all 24. The gate's
    // input is the EFFECTIVE holding (mirror 24 − unmirrored fill 24 = 0), so the re-fire is
    // refused instead of selling the position a second time and opening a short.
    const mirroredQty = 24;
    const unmirroredFills = 24;
    assert.equal(shortingShortfallQty(24, mirroredQty - unmirroredFills), 24);
    // Trusting the raw mirror is what actually happened — it reads as perfectly fundable.
    assert.equal(shortingShortfallQty(24, mirroredQty), 0);
  });
});

describe("breachesFeeBudget — the §6 monthly hard stop", () => {
  it("allows an order that fits inside the budget", () => {
    assert.equal(breachesFeeBudget(1700, 100, 50_000), false); // $17 spent + $1 vs the live $500 budget
  });
  it("allows an order that lands exactly on the budget", () => {
    assert.equal(breachesFeeBudget(1900, 100, 2000), false); // $19 + $1 = $20 exactly
  });
  it("breaches on the order that would cross it", () => {
    assert.equal(breachesFeeBudget(1950, 100, 2000), true); // $19.50 + $1 > $20
  });
  it("stays breached once spend is already over", () => {
    assert.equal(breachesFeeBudget(2500, 100, 2000), true);
  });
  it("would NOT have fired on penny-priced market fills — the D118 failure", () => {
    // 20 stops billed at the buggy 1¢ read as 20¢ of spend: the $20 default budget looks 99% unused.
    assert.equal(breachesFeeBudget(20, 1, 2000), false);
    // The same 20 stops priced honestly at $1.00 are exactly what the budget was meant to catch.
    assert.equal(breachesFeeBudget(2000, 100, 2000), true);
  });
});

describe("breachesFeeEdge — edge must clear feeEdgeMultiple × round-trip commissions", () => {
  it("breaches when edge is below the multiple of commissions", () => {
    assert.equal(breachesFeeEdge(599, 100, 100, 3), true); // threshold 600
  });
  it("allows at or above the threshold", () => {
    assert.equal(breachesFeeEdge(600, 100, 100, 3), false);
    assert.equal(breachesFeeEdge(601, 100, 100, 3), false);
  });
});

describe("optionPremiumCents — contracts × multiplier × per-share premium (D99)", () => {
  it("computes the dollar premium of a leg", () => {
    // 2 contracts × 100 shares × $3.50 premium = $700.00 = 70_000¢
    assert.equal(optionPremiumCents(2, 100, 350), 70_000);
  });
  it("stays integer cents (whole contracts, no floats — rule #4)", () => {
    assert.equal(optionPremiumCents(1, 100, 1), 100);
    assert.equal(Number.isInteger(optionPremiumCents(3, 100, 127)), true);
  });
});

describe("breachesOptionPremiumCap — premium-at-risk ≤ maxPremiumPct of NAV (D99)", () => {
  const nav = 5_000_000; // US$50k; 4% cap = $2,000 = 200_000¢
  it("breaches strictly above the cap", () => {
    assert.equal(breachesOptionPremiumCap(200_001, nav, 4), true);
  });
  it("allows exactly at the cap and below", () => {
    assert.equal(breachesOptionPremiumCap(200_000, nav, 4), false);
    assert.equal(breachesOptionPremiumCap(199_999, nav, 4), false);
  });
  it("a defined-risk leg under the cap passes; an oversized one fails", () => {
    const small = optionPremiumCents(2, 100, 350); // $700 premium
    const big = optionPremiumCents(10, 100, 350); // $3,500 premium
    assert.equal(breachesOptionPremiumCap(small, nav, 4), false);
    assert.equal(breachesOptionPremiumCap(big, nav, 4), true);
  });
});

describe("ibkrFixedCommissionCents — $0.01/share, $1.00 min, 0.5% cap", () => {
  it("hits the $1.00 (100¢) minimum on a normal small lot", () => {
    assert.equal(ibkrFixedCommissionCents(10, 43000), 100); // perShare 100 < cap 2150
  });
  it("charges $0.01/share once the lot is large", () => {
    assert.equal(ibkrFixedCommissionCents(1000, 43000), 1000); // 1000¢ < cap 215000
    assert.equal(ibkrFixedCommissionCents(200, 50000), 200);
  });
  it("lets the 0.5% cap undercut the minimum on tiny-value orders", () => {
    assert.equal(ibkrFixedCommissionCents(1, 1000), 5); // 0.5% of $10 = 5¢ < $1 min
  });
  it("never goes below the 1¢ floor", () => {
    assert.equal(ibkrFixedCommissionCents(1, 10), 1); // cap rounds to 0 → floored at 1¢
  });
  // An ABSENT price is not a cheap trade. Passing 0 used to fall through to value 0 → cap 0 → the 1¢
  // floor, which reads as a real fee: that is how every MARKET order booked $0.01 vs IBKR's ~$1.00
  // from Phase 3 until D118 (the caller passed `limitPriceCents ?? 0`, which a MARKET order lacks).
  // With no price the 0.5% cap is uncomputable, so we return the uncapped estimate — erring HIGH,
  // because a fee guardrail fed a flattering number is a guardrail that never fires.
  it("returns the $1.00 minimum — not 1¢ — when the price is absent (the D118 trap)", () => {
    assert.equal(ibkrFixedCommissionCents(24, 0), 100);
    assert.notEqual(ibkrFixedCommissionCents(24, 0), 1); // the old behaviour
  });
  it("errs high on a large lot with no price, rather than flattering the fund", () => {
    assert.equal(ibkrFixedCommissionCents(500, 0), 500); // 1¢/share uncapped, ≥ $1.00 min
  });
  it("treats a negative or non-finite price as absent, not as a discount", () => {
    assert.equal(ibkrFixedCommissionCents(24, -100), 100);
    assert.equal(ibkrFixedCommissionCents(24, NaN), 100);
  });
  it("prices a real market fill the same as the equivalent limit order", () => {
    // The D118 fix: placeOrder now passes the FILL price, so a MARKET stop is charged like a LIMIT.
    assert.equal(ibkrFixedCommissionCents(96, 12256), 100); // the CCO cover — $1.00, not $0.01
  });
});

describe("ibkrOptionCommissionCents — $0.65/contract, $1.00 min (D99)", () => {
  it("hits the $1.00 (100¢) minimum on one contract", () => {
    assert.equal(ibkrOptionCommissionCents(1), 100); // 65¢ < $1 min
    assert.equal(ibkrOptionCommissionCents(2), 130); // 130¢ > min
  });
  it("charges $0.65/contract once above the minimum", () => {
    assert.equal(ibkrOptionCommissionCents(10), 650);
    assert.equal(ibkrOptionCommissionCents(100), 6500);
  });
});
