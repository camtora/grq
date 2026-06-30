import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scoreCall, benchmarkReturnBps } from "@/lib/race/score";

const D = (s: string) => new Date(s);

describe("scoreCall — per-call directional scoring", () => {
  it("BUY profits when the price rises; pnl scales with qty", () => {
    const s = scoreCall({ action: "BUY", entryPriceCents: 10000, entryCurrency: "USD", qty: 3 }, 11000)!;
    assert.equal(s.returnBps, 1000);
    assert.equal(s.pnlNativeCents, 1000 * 3);
    assert.equal(s.isGreen, true);
  });

  it("SELL is scored directionally — it profits when the price falls", () => {
    const s = scoreCall({ action: "SELL", entryPriceCents: 10000, entryCurrency: "USD", qty: 2 }, 9000)!;
    assert.equal(s.returnBps, 1000); // (9000-10000) * -1 / 10000
    assert.equal(s.pnlNativeCents, 1000 * 2);
    assert.equal(s.isGreen, true);
  });

  it("SELL is red when the price rises", () => {
    const s = scoreCall({ action: "SELL", entryPriceCents: 10000, entryCurrency: "USD", qty: 1 }, 11000)!;
    assert.equal(s.pnlNativeCents, -1000);
    assert.equal(s.isGreen, false);
  });

  it("an unsized call still scores as a 1-share bet", () => {
    const s = scoreCall({ action: "BUY", entryPriceCents: 10000, entryCurrency: "USD", qty: null }, 11000)!;
    assert.equal(s.pnlNativeCents, 1000);
  });

  it("HOLD/NONE and unpriceable calls return null (not a directional bet)", () => {
    assert.equal(scoreCall({ action: "HOLD", entryPriceCents: 10000, entryCurrency: "USD", qty: 1 }, 11000), null);
    assert.equal(scoreCall({ action: null, entryPriceCents: 10000, entryCurrency: "USD", qty: 1 }, 11000), null);
    assert.equal(scoreCall({ action: "BUY", entryPriceCents: null, entryCurrency: "USD", qty: 1 }, 11000), null);
    assert.equal(scoreCall({ action: "BUY", entryPriceCents: 10000, entryCurrency: "USD", qty: 1 }, null), null);
    assert.equal(scoreCall({ action: "BUY", entryPriceCents: 10000, entryCurrency: "USD", qty: 1 }, 0), null);
  });
});

describe("benchmarkReturnBps", () => {
  const closes = [
    { date: D("2026-06-01"), closeCents: 1000 },
    { date: D("2026-06-03"), closeCents: 1100 },
    { date: D("2026-06-05"), closeCents: 1200 },
  ];

  it("anchors on the last close on/before the entry date", () => {
    assert.equal(benchmarkReturnBps(closes, 1320, D("2026-06-04")), 2000); // base 1100 → +20%
  });

  it("anchors on the oldest close when the entry predates our bars", () => {
    assert.equal(benchmarkReturnBps(closes, 1100, D("2026-05-01")), 1000); // base 1000 → +10%
  });

  it("returns null when the benchmark can't be priced", () => {
    assert.equal(benchmarkReturnBps([], 1100, D("2026-06-04")), null);
    assert.equal(benchmarkReturnBps(closes, null, D("2026-06-04")), null);
    assert.equal(benchmarkReturnBps(closes, 0, D("2026-06-04")), null);
  });
});
