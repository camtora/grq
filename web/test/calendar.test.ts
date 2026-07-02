import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isMarketDay, isMarketOpen, openExchanges } from "@/agent/calendar";

// Exchange-aware market calendar: TSX and NYSE share the 9:30–16:00 ET session, only holidays differ.
// Dates are built in UTC that map to a specific ET time (EDT = UTC−4, EST = UTC−5).

describe("exchange-aware market days", () => {
  it("Canada Day (Jul 1 2026): TSX closed, NYSE open, ANY open", () => {
    const d = new Date("2026-07-01T14:00:00Z"); // 10:00 ET
    assert.equal(isMarketDay(d, "CA"), false);
    assert.equal(isMarketDay(d, "US"), true);
    assert.equal(isMarketDay(d, "ANY"), true);
  });
  it("US Independence (observed Jul 3 2026): NYSE closed, TSX open", () => {
    const d = new Date("2026-07-03T14:00:00Z");
    assert.equal(isMarketDay(d, "US"), false);
    assert.equal(isMarketDay(d, "CA"), true);
  });
  it("a shared holiday (Christmas, Dec 25 2026): both closed", () => {
    const d = new Date("2026-12-25T15:00:00Z"); // 10:00 EST
    assert.equal(isMarketDay(d, "CA"), false);
    assert.equal(isMarketDay(d, "US"), false);
    assert.equal(isMarketDay(d, "ANY"), false);
  });
  it("a normal weekday: both open", () => {
    const d = new Date("2026-07-02T14:00:00Z"); // Thu
    assert.equal(isMarketDay(d, "CA"), true);
    assert.equal(isMarketDay(d, "US"), true);
  });
  it("a weekend: closed for all", () => {
    const sat = new Date("2026-07-04T14:00:00Z");
    assert.equal(isMarketDay(sat, "US"), false);
    assert.equal(isMarketDay(sat, "ANY"), false);
  });
});

describe("exchange-aware market hours", () => {
  it("Canada Day 10:00 ET: US open, CA closed", () => {
    const d = new Date("2026-07-01T14:00:00Z");
    assert.equal(isMarketOpen(d, "US"), true);
    assert.equal(isMarketOpen(d, "CA"), false);
  });
  it("Canada Day 08:00 ET (pre-open): US not yet open", () => {
    assert.equal(isMarketOpen(new Date("2026-07-01T12:00:00Z"), "US"), false);
  });
  it("openExchanges reports the split on Canada Day", () => {
    const ex = openExchanges(new Date("2026-07-01T14:00:00Z"));
    assert.deepEqual(ex, { ca: false, us: true });
  });
});
