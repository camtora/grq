// D140 display round 4 — segments over time (lib/financials/derive.ts).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { segmentCompare, segmentSeries, segmentYearAgo, type SegRow } from "../lib/financials/derive";

const r = (period: string, periodEnd: string, data: Record<string, number>): SegRow => ({ period, periodEnd, data });

// NVDA's shape: five lines until FY2026, then Data Center + Edge Computing.
const nvda: SegRow[] = [
  r("Q2", "2026-07-26", { "Data Center": 890, "Edge Computing": 72 }),
  r("Q1", "2026-04-26", { "Data Center": 752, "Edge Computing": 64 }),
  r("Q4", "2026-01-25", { Gaming: 37, Automotive: 6, "Data Center": 623, "OEM And Other": 2, "Professional Visualization": 13 }),
  r("FY", "2026-01-25", { Gaming: 160, Automotive: 23, "Data Center": 1937, "OEM And Other": 6, "Professional Visualization": 32 }),
  r("Q2", "2025-07-27", { Gaming: 43, Automotive: 6, "Data Center": 411, "OEM And Other": 2, "Professional Visualization": 6 }),
];

const steady: SegRow[] = [
  r("Q3", "2026-09-30", { Cloud: 300, Devices: 100 }),
  r("Q2", "2026-06-30", { Cloud: 280, Devices: 110 }),
  r("Q1", "2026-03-31", { Cloud: 260, Devices: 105 }),
  r("Q3", "2025-09-30", { Cloud: 200, Devices: 120 }),
  r("FY", "2025-12-31", { Cloud: 900, Devices: 450 }),
];

describe("segments a year apart", () => {
  it("finds the same kind of period a year earlier", () => {
    assert.equal(segmentYearAgo(steady, steady[0])?.periodEnd, "2025-09-30");
    assert.equal(segmentYearAgo(nvda, nvda[0])?.periodEnd, "2025-07-27");
  });
  it("like for like: each segment's change and its share of the company's change", () => {
    const c = segmentCompare(steady, steady[0]);
    assert.equal(c.kind, "ok");
    if (c.kind !== "ok") return;
    assert.equal(c.totalChange, 80); // +100 cloud, −20 devices
    assert.deepEqual(c.parts.map((p) => [p.name, p.cents - p.prevCents, p.shareOfChangeBps]), [["Cloud", 100, 12500], ["Devices", -20, -2500]]);
    assert.deepEqual(c.parts[0].growth, { kind: "ok", bps: 5000 });
  });
  it("across a re-cut it compares nothing — even 'Data Center', which kept its name (NVDA)", () => {
    const c = segmentCompare(nvda, nvda[0]);
    assert.deepEqual(c, { kind: "resegmented", since: "2026-04-26" });
  });
  it("'since' is the start of the unbroken run, not the first time the names ever appeared", () => {
    const flip: SegRow[] = [
      r("Q2", "2026-07-26", { US: 60, Other: 36 }),
      r("Q1", "2026-04-26", { US: 52, Other: 30 }),
      r("Q4", "2026-01-25", { US: 40, Taiwan: 20, Other: 8 }),
      r("Q2", "2025-07-27", { US: 25, Taiwan: 15, Other: 6 }),
      r("Q4", "2024-01-28", { US: 10, Other: 12 }), // same names, long ago
    ];
    assert.deepEqual(segmentCompare(flip, flip[0]), { kind: "resegmented", since: "2026-04-26" });
  });
  it("no period a year earlier → none", () => assert.deepEqual(segmentCompare(steady.slice(0, 3), steady[0]), { kind: "none" }));
});

describe("the segment trend", () => {
  it("runs oldest → newest, quarters only", () => assert.deepEqual(segmentSeries(steady).map((x) => x.periodEnd), ["2025-09-30", "2026-03-31", "2026-06-30", "2026-09-30"]));
  it("stops at the last re-cut", () => assert.deepEqual(segmentSeries(nvda).map((x) => x.periodEnd), ["2026-04-26", "2026-07-26"]));
});
