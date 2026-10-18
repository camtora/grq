import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { previousCloseFromChart } from "../lib/broker/yahoo";

// D139: a day change is measured against the PRIOR SESSION's close. Yahoo's chartPreviousClose is
// the close before the chart's range starts, so on the 2-day chart the quote fetch uses it is the
// close two sessions back; from 2026-06-12 to 2026-10-18 every day-change figure was a two-day
// change. The fixture is NVDA as Yahoo served it on Sat 2026-10-18: bars Thu 217.23 / Fri 214.13,
// chartPreviousClose = Wed 221.30. The true Friday move is −1.43%, not −3.24%.
describe("previousCloseFromChart (D139)", () => {
  it("takes the prior session's close from the bars, not the chart's range-start close", () => {
    assert.equal(previousCloseFromChart([217.23, 214.13], { chartPreviousClose: 221.3 }), 217.23);
  });
  it("treats the last bar as the current session even when unpriced (pre-open), and skips a null inside", () => {
    // Thu 100 · Fri 101 · Mon (pre-open, no close yet) → the prior close is Friday's 101.
    assert.equal(previousCloseFromChart([100, 101, null], { chartPreviousClose: 99 }), 101);
    assert.equal(previousCloseFromChart([100, null, 102], { chartPreviousClose: 99 }), 100);
  });
  it("falls back to the meta field only for a one-bar chart, and to null with nothing", () => {
    assert.equal(previousCloseFromChart([214.13], { chartPreviousClose: 217.23 }), 217.23);
    assert.equal(previousCloseFromChart([214.13], { previousClose: 217.23 }), 217.23);
    assert.equal(previousCloseFromChart([], {}), null);
    assert.equal(previousCloseFromChart([214.13], { chartPreviousClose: 0 }), null);
  });
});
