import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isValidQty,
  meetsConviction,
  breachesPositionCap,
  breachesCashFloor,
  fundingShortfallCents,
  breachesFeeEdge,
} from "@/lib/broker/guardrails";
import { ibkrFixedCommissionCents } from "@/lib/broker/sim";

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

describe("breachesFeeEdge — edge must clear feeEdgeMultiple × round-trip commissions", () => {
  it("breaches when edge is below the multiple of commissions", () => {
    assert.equal(breachesFeeEdge(599, 100, 100, 3), true); // threshold 600
  });
  it("allows at or above the threshold", () => {
    assert.equal(breachesFeeEdge(600, 100, 100, 3), false);
    assert.equal(breachesFeeEdge(601, 100, 100, 3), false);
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
});
