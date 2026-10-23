// D140 — which feeds a name is due for (lib/financials/store.ts dueFeeds, pure).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dueFeeds } from "../lib/financials/store";

const now = new Date("2026-10-23T14:00:00Z");
const fresh = {
  profileAt: new Date("2026-10-22T20:00:00Z"), statementsAt: new Date("2026-10-22T20:00:00Z"), latestPeriodEnd: "2026-06-30",
  estimatesDay: "2026-10-23", healthAt: new Date("2026-10-22T20:00:00Z"), segmentsAt: new Date("2026-10-22T20:00:00Z"),
  filingsDay: "2026-10-23", insiderAt: new Date("2026-10-22T20:00:00Z"), callsDay: "2026-10-23",
  isEtf: false, isFund: false, usFiler: true, statementsCovered: true, companyName: "Nu Holdings Ltd.",
};

describe("dueFeeds — the profile", () => {
  it("a fresh profile with a name isn't asked again", () => assert.ok(!dueFeeds(fresh, true, now, "2026-10-23").includes("profile")));
  it("a profile that landed empty (no company name) is asked again the next day, not in a week", () =>
    assert.ok(dueFeeds({ ...fresh, companyName: null }, true, now, "2026-10-23").includes("profile")));
});
