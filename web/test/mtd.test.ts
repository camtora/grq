import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { etMonthStart } from "@/lib/mtd";

// The month boundary the "so far this month" figure is measured from: ET midnight on the 1st, in UTC.
describe("etMonthStart", () => {
  it("October 2026 starts at 04:00Z on Oct 1 (EDT) and is named", () => {
    const r = etMonthStart(new Date("2026-10-15T23:00:00Z"));
    assert.equal(r.start.toISOString(), "2026-10-01T04:00:00.000Z");
    assert.equal(r.month, "October");
  });
  it("January starts at 05:00Z (EST); a UTC evening on the 31st still belongs to that ET month", () => {
    assert.equal(etMonthStart(new Date("2027-01-20T12:00:00Z")).start.toISOString(), "2027-01-01T05:00:00.000Z");
    // 2026-11-01 03:30Z is Oct 31, 23:30 ET → still October
    const r = etMonthStart(new Date("2026-11-01T03:30:00Z"));
    assert.equal(r.month, "October");
    assert.equal(r.start.toISOString(), "2026-10-01T04:00:00.000Z");
  });
  it("November and March use the right offsets (both switches avoid the 1st)", () => {
    assert.equal(etMonthStart(new Date("2026-11-15T12:00:00Z")).start.toISOString(), "2026-11-01T04:00:00.000Z");
    assert.equal(etMonthStart(new Date("2026-03-15T12:00:00Z")).start.toISOString(), "2026-03-01T05:00:00.000Z");
  });
});
