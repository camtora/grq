import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isOwner, seesMeters } from "@/lib/users";

// Traffic and Tokens are Cam's alone (Cam, 2026-10-08). Graham is still an owner — Settings,
// How GRQ works, the kill switch — but ownership does not open the meters, for him or anyone.
// The second block is the class guard: every meter surface must gate on seesMeters, so a new
// one (or a refactor back to isOwner) fails the build instead of quietly reopening the door.

const CAM = "cameron.tora@gmail.com";
const GRAHAM = "g.j.appleby@gmail.com";

describe("seesMeters — Traffic + Tokens", () => {
  it("is Cam, and only Cam", () => {
    assert.equal(seesMeters(CAM), true);
    assert.equal(seesMeters("Cameron.Tora@gmail.com "), true);
    assert.equal(seesMeters(GRAHAM), false);
    assert.equal(seesMeters("someone@else.com"), false);
    assert.equal(seesMeters(null), false);
  });
  it("leaves ownership alone — Cam and Graham are both still owners", () => {
    assert.equal(isOwner(CAM), true);
    assert.equal(isOwner(GRAHAM), true);
  });
});

describe("every meter surface gates on seesMeters, never on ownership", () => {
  const SURFACES = [
    "app/traffic/page.tsx",
    "app/tokens/page.tsx",
    "app/api/traffic/route.ts",
    "app/api/tokens/route.ts",
    "app/api/admin/usage-window/route.ts",
  ];
  for (const f of SURFACES) {
    it(f, () => {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      assert.match(src, /seesMeters\(session\.email\)/, `${f} must gate on seesMeters`);
      assert.doesNotMatch(src, /isOwner\(/, `${f} must not gate on ownership`);
    });
  }
});
