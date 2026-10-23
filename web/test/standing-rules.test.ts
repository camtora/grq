// D141 — the members' standing rules (decided 2026-10-23). These are §6-style: humans change them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DIALS } from "../agent/policy";
import {
  newNamesSince, standingRuleRefusal, starterCap, weeklyMoveBps, minStopDistanceBps, idleCashQuestion, MIN_FIRST_BUY_USD_CENTS,
  type NewBuyCheck,
} from "../agent/standing-rules";
import { rotations, type Fill } from "../agent/track-record";

const D = (s: string) => new Date(`${s}T15:00:00Z`);

test("Q3: the Aggressive dial caps one stock at 50% of NAV", () => {
  assert.equal(DIALS.AGGRESSIVE.maxPositionPct, 50);
});

test("Q6: 4 new names in the run's first week, 2 after", () => {
  const inc = D("2026-10-26");
  assert.equal(starterCap(D("2026-10-26"), inc), 4);
  assert.equal(starterCap(D("2026-11-01"), inc), 4);
  assert.equal(starterCap(D("2026-11-02"), inc), 2);
});

test("Q6: a top-up is not new; a name opened in the window is; VOO never counts", () => {
  const since = D("2026-10-26");
  const fills = [
    { symbol: "AAA", side: "BUY" as const, qty: 10, at: D("2026-10-27") }, // opened this week
    { symbol: "AAA", side: "BUY" as const, qty: 5, at: D("2026-10-28") }, // its top-up
    { symbol: "BBB", side: "BUY" as const, qty: 3, at: D("2026-10-27") }, // top-up of a long holding
    { symbol: "CCC", side: "BUY" as const, qty: 4, at: D("2026-10-27") }, // opened and closed
    { symbol: "CCC", side: "SELL" as const, qty: 4, at: D("2026-10-29") },
    { symbol: "VOO", side: "BUY" as const, qty: 20, at: D("2026-10-27") },
  ];
  const cur = new Map([["AAA", 15], ["BBB", 13], ["VOO", 20]]);
  assert.deepEqual(newNamesSince(fills, cur, since), ["AAA", "CCC"]);
});

const base: NewBuyCheck = {
  symbol: "XYZ", isNewName: true, costUsdCents: 600_000, priceCents: 10_000, stopCents: 8_000,
  invalidation: "margins fall two quarters running", weeklyBps: 400, safetyStopPct: 12, newNamesThisWeek: [], cap: 2,
};

test("a clean new buy passes; top-ups and VOO are never checked", () => {
  assert.equal(standingRuleRefusal(base), null);
  assert.equal(standingRuleRefusal({ ...base, isNewName: false, costUsdCents: 100, stopCents: undefined }), null);
  assert.equal(standingRuleRefusal({ ...base, symbol: "VOO", costUsdCents: 100, stopCents: undefined, newNamesThisWeek: ["A", "B"] }), null);
});

test("Q6: the third new name in a week is refused", () => {
  assert.match(standingRuleRefusal({ ...base, newNamesThisWeek: ["A", "B"] }) ?? "", /New-stock limit/);
  assert.equal(standingRuleRefusal({ ...base, newNamesThisWeek: ["A", "B"], cap: 4 }), null);
});

test("Q8: a new position under US$5,000 is refused", () => {
  assert.equal(MIN_FIRST_BUY_USD_CENTS, 500_000);
  assert.match(standingRuleRefusal({ ...base, costUsdCents: 499_999 }) ?? "", /Minimum first buy/);
});

test("Q2: the stop sits no closer than max(two weekly moves, the safety stop)", () => {
  assert.equal(minStopDistanceBps(400, 12), 1200); // 2×4% = 8% < 12%
  assert.equal(minStopDistanceBps(900, 12), 1800); // 2×9% = 18% > 12%
  assert.equal(minStopDistanceBps(null, 12), 1200);
  assert.match(standingRuleRefusal({ ...base, stopCents: 9_000 }) ?? "", /Stop too tight.*12\.0%/);
  assert.equal(standingRuleRefusal({ ...base, stopCents: 8_800 }), null); // exactly 12%
  assert.match(standingRuleRefusal({ ...base, weeklyBps: 900, stopCents: 8_500 }) ?? "", /two normal weekly moves/);
  assert.match(standingRuleRefusal({ ...base, stopCents: undefined }) ?? "", /written stop/);
  assert.match(standingRuleRefusal({ ...base, invalidation: " " }) ?? "", /invalidation/);
});

test("weekly move = median absolute 5-session return; null with under 8 weeks", () => {
  assert.equal(weeklyMoveBps(Array(30).fill(100)), null);
  const closes: number[] = [];
  for (let i = 0; i < 61; i++) closes.push(Math.floor(i / 5) % 2 === 0 ? 10_000 : 10_500);
  const w = weeklyMoveBps(closes);
  assert.ok(w != null && w >= 470 && w <= 500, `got ${w}`);
});

test("Q5: the idle-cash question rides the 11:00 check-in only", () => {
  assert.match(idleCashQuestion("scheduled 11:00 ET"), /Idle cash/);
  assert.equal(idleCashQuestion("scheduled 10:30 ET"), "");
  assert.equal(idleCashQuestion("self-scheduled: look at TDY"), "");
});

test("Q4: selling VOO to fund a stock is not a rotation", () => {
  const f = (symbol: string, side: "BUY" | "SELL", at: Date): Fill => ({ symbol, side, qty: 1, priceCents: 100, commissionCents: 1, realizedPnlCents: null, at, placedBy: "agent" });
  const t = D("2026-10-27");
  assert.equal(rotations([f("VOO", "SELL", t), f("AAA", "BUY", t)]).length, 0);
  assert.equal(rotations([f("BBB", "SELL", t), f("AAA", "BUY", t)]).length, 1);
});
