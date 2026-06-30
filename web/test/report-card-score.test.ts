import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scorePrediction, tally, closeAtOrBefore, closeAtHorizon, type ScoredRow } from "@/lib/report-card/score";

const D = (s: string) => new Date(s);

describe("scorePrediction — absolute-direction grading", () => {
  it("UP call is green when the price rises", () => {
    const s = scorePrediction("UP", 10000, 10500)!;
    assert.equal(s.returnBps, 500);
    assert.equal(s.calledReturnBps, 500);
    assert.equal(s.isGreen, true);
  });

  it("UP call is red when the price falls", () => {
    const s = scorePrediction("UP", 10000, 9500)!;
    assert.equal(s.returnBps, -500);
    assert.equal(s.calledReturnBps, -500);
    assert.equal(s.isGreen, false);
  });

  it("DOWN call is green when the price falls — oriented return shows positive", () => {
    const s = scorePrediction("DOWN", 10000, 9000)!;
    assert.equal(s.returnBps, -1000); // raw move is down
    assert.equal(s.calledReturnBps, 1000); // a correct bearish call reads +
    assert.equal(s.isGreen, true);
  });

  it("DOWN call is red when the price rises", () => {
    const s = scorePrediction("DOWN", 10000, 11000)!;
    assert.equal(s.calledReturnBps, -1000);
    assert.equal(s.isGreen, false);
  });

  it("a flat move is never a win (UP and DOWN)", () => {
    assert.equal(scorePrediction("UP", 10000, 10000)!.isGreen, false);
    assert.equal(scorePrediction("DOWN", 10000, 10000)!.isGreen, false);
  });

  it("returns null for a missing/zero/negative entry or mark", () => {
    assert.equal(scorePrediction("UP", null, 10000), null);
    assert.equal(scorePrediction("UP", 0, 10000), null);
    assert.equal(scorePrediction("UP", -1, 10000), null);
    assert.equal(scorePrediction("UP", 10000, null), null);
    assert.equal(scorePrediction("UP", 10000, 0), null);
  });
});

describe("tally", () => {
  it("counts graded vs pending and computes hit rate + mean oriented return", () => {
    const rows: ScoredRow[] = [
      { dir: "UP", entryPriceCents: 10000, markCents: 11000 }, // +1000, green
      { dir: "UP", entryPriceCents: 10000, markCents: 9000 }, // -1000, red
      { dir: "DOWN", entryPriceCents: 10000, markCents: 9000 }, // +1000 oriented, green
      { dir: "UP", entryPriceCents: 10000, markCents: null }, // pending — no mark
    ];
    const t = tally(rows);
    assert.equal(t.graded, 3);
    assert.equal(t.pending, 1);
    assert.equal(t.green, 2);
    assert.equal(t.hitRate, 2 / 3);
    assert.equal(t.avgCalledReturnBps, Math.round((1000 - 1000 + 1000) / 3)); // 333
  });

  it("empty and all-pending sets yield null rates (no divide-by-zero)", () => {
    assert.deepEqual(tally([]), { graded: 0, pending: 0, green: 0, hitRate: null, avgCalledReturnBps: null });
    const t = tally([{ dir: "UP", entryPriceCents: null, markCents: null }]);
    assert.equal(t.graded, 0);
    assert.equal(t.pending, 1);
    assert.equal(t.hitRate, null);
    assert.equal(t.avgCalledReturnBps, null);
  });
});

describe("closeAtOrBefore — the honest entry anchor", () => {
  const closes = [
    { date: D("2026-06-01"), closeCents: 100 },
    { date: D("2026-06-03"), closeCents: 200 },
    { date: D("2026-06-05"), closeCents: 300 },
  ];

  it("returns the last close on/before the instant (boundary inclusive)", () => {
    assert.equal(closeAtOrBefore(closes, D("2026-06-04")), 200);
    assert.equal(closeAtOrBefore(closes, D("2026-06-05")), 300);
    assert.equal(closeAtOrBefore(closes, D("2026-06-06")), 300);
  });

  it("returns null when the series is empty or starts after the instant", () => {
    assert.equal(closeAtOrBefore(closes, D("2026-05-31")), null);
    assert.equal(closeAtOrBefore([], D("2026-06-04")), null);
  });
});

describe("closeAtHorizon — the T+N mark", () => {
  const closes = [
    { date: D("2026-06-01"), closeCents: 100 },
    { date: D("2026-06-03"), closeCents: 200 },
    { date: D("2026-06-08"), closeCents: 300 },
  ];

  it("returns the first close at/after entry + horizon days", () => {
    assert.equal(closeAtHorizon(closes, D("2026-06-01"), 2), 200); // 06-03
    assert.equal(closeAtHorizon(closes, D("2026-06-01"), 6), 300); // first >= 06-07 is 06-08
  });

  it("returns null when the window has not elapsed in our history", () => {
    assert.equal(closeAtHorizon(closes, D("2026-06-01"), 30), null);
  });
});
