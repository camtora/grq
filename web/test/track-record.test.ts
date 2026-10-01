import { test } from "node:test";
import assert from "node:assert/strict";
import { episodes, rotations, basketMovePct, rotationEdgePct, renderTrackRecord, type Fill } from "../agent/track-record";

// Stage 3 of the Opus 5.5 prompt audit (R6): the agent's own track record. These pin the math the
// agent is shown, so what it learns from ("did that swap beat holding?") is arithmetic, not vibes.

const t0 = new Date("2026-09-01T14:00:00Z");
const at = (days: number, mins = 0) => new Date(t0.getTime() + days * 86_400_000 + mins * 60_000);
const fill = (f: Partial<Fill> & Pick<Fill, "symbol" | "side" | "qty" | "priceCents" | "at">): Fill => ({
  commissionCents: 100,
  realizedPnlCents: null,
  placedBy: "agent",
  ...f,
});

test("episodes open on 0→>0 and close on >0→0, across partial trims", () => {
  const eps = episodes([
    fill({ symbol: "A", side: "BUY", qty: 10, priceCents: 1000, at: at(0) }),
    fill({ symbol: "A", side: "SELL", qty: 4, priceCents: 1100, at: at(3) }), // a trim, still open
    fill({ symbol: "A", side: "SELL", qty: 6, priceCents: 1200, at: at(9) }), // closed
    fill({ symbol: "A", side: "BUY", qty: 5, priceCents: 1300, at: at(12) }), // a new episode
  ]);
  assert.equal(eps.length, 2);
  assert.deepEqual(eps.at(0), { symbol: "A", openedAt: at(0), closedAt: at(9) });
  assert.deepEqual(eps.at(1), { symbol: "A", openedAt: at(12), closedAt: null });
});

test("episodes replay back from the broker's truth, so a reset that cleared shares without a SELL can't leave a ghost", () => {
  const fills = [
    fill({ symbol: "IFC", side: "BUY", qty: 8, priceCents: 1000, at: at(0) }), // pre-reset: cleared by the reset, no SELL on record
    fill({ symbol: "IFC", side: "BUY", qty: 10, priceCents: 1000, at: at(20) }), // after the reset
    fill({ symbol: "IFC", side: "SELL", qty: 10, priceCents: 1100, at: at(25) }), // full exit
  ];
  // A forward replay would say IFC still holds 8. The broker says 0: one closed episode, 20 → 25.
  assert.deepEqual(episodes(fills, new Map([["IFC", 0]])), [{ symbol: "IFC", openedAt: at(20), closedAt: at(25) }]);
});

test("a rotation is agent sells and buys placed together; stops and lone trades are not", () => {
  const rs = rotations([
    fill({ symbol: "OLD", side: "SELL", qty: 10, priceCents: 1000, at: at(1) }),
    fill({ symbol: "NEW", side: "BUY", qty: 5, priceCents: 2000, at: at(1, 2) }),
    fill({ symbol: "X", side: "SELL", qty: 3, priceCents: 500, at: at(2), placedBy: "system-stop" }),
    fill({ symbol: "Y", side: "BUY", qty: 3, priceCents: 500, at: at(2, 5) }), // funded by a stop, not a rotation
    fill({ symbol: "Z", side: "BUY", qty: 3, priceCents: 500, at: at(4) }),
  ]);
  assert.equal(rs.length, 1);
  assert.deepEqual(rs.at(0)?.sold.map((f) => f.symbol), ["OLD"]);
  assert.deepEqual(rs.at(0)?.bought.map((f) => f.symbol), ["NEW"]);
});

test("the swap's edge = bought move − sold move − commissions; negative when holding would have won", () => {
  const r = rotations([
    fill({ symbol: "OLD", side: "SELL", qty: 10, priceCents: 1000, at: at(1), commissionCents: 50 }),
    fill({ symbol: "NEW", side: "BUY", qty: 5, priceCents: 2000, at: at(1, 1), commissionCents: 50 }),
  ]).at(0);
  assert.ok(r);
  const now = new Map([["OLD", 1100], ["NEW", 1900]]); // OLD +10% after we sold it, NEW −5% after we bought it
  assert.equal(basketMovePct(r.sold, now), 10);
  assert.equal(basketMovePct(r.bought, now), -5);
  assert.equal(rotationEdgePct(r, now), -5 - 10 - 1); // 100¢ commissions on 10,000¢ bought = 1%
  assert.equal(rotationEdgePct(r, new Map()), null); // no prices, no score
});

test("the rendered block states the goal, activity, holding period, cost and each rotation", () => {
  const fills = [
    fill({ symbol: "OLD", side: "BUY", qty: 10, priceCents: 1000, at: at(0) }),
    fill({ symbol: "OLD", side: "SELL", qty: 10, priceCents: 1000, at: at(7), realizedPnlCents: 0 }),
    fill({ symbol: "NEW", side: "BUY", qty: 5, priceCents: 2000, at: at(7, 1) }),
  ];
  const text = renderTrackRecord({
    fills,
    now: at(10),
    windowDays: 30,
    nowCents: new Map([["OLD", 1100], ["NEW", 1900]]),
    openPositions: 1,
    currentQty: new Map([["NEW", 5]]),
    ordersInWindow: 3,
    mtd: { pnlCents: -12_345, startNavCents: 1_000_000 },
  });
  assert.match(text, /this month:\*\* −\$123\.45 \(−1\.2%\)|this month:\*\* −\$123\.45 \(-1\.2%\)/);
  assert.match(text, /3 orders · 2 new names opened · 1 full exits · 1 positions now/);
  assert.match(text, /held 7 days on average; 1 of 1 were sold within 4 weeks/);
  assert.match(text, /0 of 1 beat simply holding/);
  assert.match(text, /sold OLD \(\+10\.0% since\) to buy NEW \(-5\.0% since\)/);
});
