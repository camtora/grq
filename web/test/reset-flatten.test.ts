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

// ----- the reset day (2026-10-22): the guards and the notes -----
import { flattenRefusal, flattenNote, flattenLesson, isResetPause, RESET_PAUSE_REASON } from "@/lib/reset";

test("flattenRefusal: enforces the runbook's order — pause, then sells, then the kill switch", () => {
  const ok = { killSwitch: false, paused: true, marketOpen: true, running: false, openPositions: 16 };
  assert.equal(flattenRefusal(ok), null);
  assert.match(flattenRefusal({ ...ok, paused: false }) ?? "", /Pause Alfred first/);
  assert.match(flattenRefusal({ ...ok, killSwitch: true }) ?? "", /kill switch/i);
  assert.match(flattenRefusal({ ...ok, marketOpen: false }) ?? "", /closed/);
  assert.match(flattenRefusal({ ...ok, running: true }) ?? "", /already running/);
  assert.match(flattenRefusal({ ...ok, openPositions: 0 }) ?? "", /already flat/);
});

test("the reset pause is recognised by its named reason, never by a limit error", () => {
  assert.equal(isResetPause(RESET_PAUSE_REASON), true);
  assert.equal(isResetPause("dossier:TN: You've hit your limit · resets 3pm"), false);
  assert.equal(isResetPause(null), false);
});

test("flattenNote and flattenLesson say it was the members' housekeeping, not Alfred's call", () => {
  const n = flattenNote({ symbol: "v", qty: 18, avgCostCents: 36204, currency: "USD", fillPriceCents: 37000, day: "2026-10-22", by: "Cam" });
  assert.match(n.title, /^Position closed for the paper-account reset — V \(not a thesis exit\)/);
  assert.match(n.body, /SOLD by Cam/);
  assert.match(n.body, /tagged "reset"/);
  assert.match(n.body, /US\$370\.00 \(\+2\.2% vs entry\)/);
  assert.match(n.body, /NO signal/);
  assert.match(n.body, /do NOT write a RETRO/);
  const pending = flattenNote({ symbol: "ATD", qty: 29, avgCostCents: 8113, currency: "CAD", fillPriceCents: null, day: "2026-10-22", by: "Cam" });
  assert.match(pending.body, /C\$81\.13/);
  assert.match(pending.body, /Fill pending/);
  const l = flattenLesson("2026-10-22", ["v", "ATD", "MSFT"], "Cam");
  assert.match(l.title, /Operational close, not a thesis exit/);
  assert.match(l.body, /3 positions \(ATD, MSFT, V\)/);
  assert.match(l.body, /EXCLUDE every closure dated 2026-10-22/);
});

import { defaultPauseUntil } from "@/lib/reset-run";

test("defaultPauseUntil: a Friday pause runs to Monday 08:00 ET, a Thursday one to Friday", () => {
  const fri = defaultPauseUntil(new Date("2026-10-23T15:40:00Z")); // Fri 11:40 ET
  assert.equal(fri.toISOString(), "2026-10-26T12:00:00.000Z"); // Mon 08:00 EDT
  const thu = defaultPauseUntil(new Date("2026-10-22T18:00:00Z"));
  assert.equal(thu.toISOString(), "2026-10-23T12:00:00.000Z");
  const nov = defaultPauseUntil(new Date("2026-11-06T18:00:00Z")); // Fri after the DST change
  assert.equal(nov.toISOString(), "2026-11-09T13:00:00.000Z"); // Mon 08:00 EST
});
