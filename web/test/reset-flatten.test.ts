import { test } from "node:test";
import assert from "node:assert/strict";
import { planFlatten, RESET_TAG, resetReason } from "@/lib/reset";

// D138: the members' flatten before the paper-account reset. Every sell is a tagged market order
// placed by a member; the agent can never be its placer.

test("planFlatten: one tagged market SELL per open position, placed by the member", () => {
  const orders = planFlatten(
    [{ symbol: "V", qty: 18 }, { symbol: "ATD", qty: 16 }, { symbol: "GONE", qty: 0 }, { symbol: "ODD", qty: 1.5 }],
    "cam@example.com",
    "2026-10-22",
  );
  assert.deepEqual(orders.map((o) => o.symbol), ["ATD", "V"]);
  for (const o of orders) {
    assert.equal(o.side, "SELL");
    assert.equal(o.type, "MARKET");
    assert.equal(o.placedBy, "cam@example.com");
    assert.equal(o.tag, RESET_TAG);
    assert.equal(o.reason, resetReason("2026-10-22"));
    assert.match(o.reason ?? "", /D138/);
  }
  assert.equal(orders.find((o) => o.symbol === "V")?.qty, 18);
});

test("planFlatten: the agent is never the placer of a reset", () => {
  assert.throws(() => planFlatten([{ symbol: "V", qty: 1 }], "agent", "2026-10-22"));
  assert.throws(() => planFlatten([{ symbol: "V", qty: 1 }], "system-stop", "2026-10-22"));
});
