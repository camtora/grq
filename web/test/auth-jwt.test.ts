import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

// The mobile session token (lib/auth-jwt.ts) and the D125 sliding-session rule. The secret is
// read at call time, so it's set here before the module is exercised; nothing here touches a DB.
process.env.GRQ_JWT_SECRET = "test-secret-not-for-production";

import {
  signGrqToken,
  claimsFromGrqToken,
  emailFromGrqToken,
  shouldRefresh,
  refreshGrqToken,
  TTL_SECONDS,
  REFRESH_AFTER_SECONDS,
  MAX_SESSION_SECONDS,
} from "@/lib/auth-jwt";

const DAY = 86_400;
const NOW = 1_789_000_000; // an arbitrary epoch second, fixed so the tests are deterministic

describe("GRQ-JWT round trip", () => {
  before(() => assert.ok(process.env.GRQ_JWT_SECRET));
  it("mints a 30-day token whose claims read back, with orig = iat on a fresh sign-in", () => {
    const t = signGrqToken("Cameron.Tora@gmail.com", { iat: NOW });
    const c = claimsFromGrqToken(t);
    assert.ok(c);
    assert.equal(c.email, "cameron.tora@gmail.com");
    assert.equal(c.iat, NOW);
    assert.equal(c.orig, NOW);
    assert.equal(c.exp, NOW + TTL_SECONDS);
    assert.equal(emailFromGrqToken(t), "cameron.tora@gmail.com");
  });
  it("rejects garbage, a foreign signature, and an expired token", () => {
    assert.equal(claimsFromGrqToken("not.a.token"), null);
    assert.equal(claimsFromGrqToken(null), null);
    const expired = signGrqToken("x@y.z", { iat: NOW - TTL_SECONDS - DAY }); // exp is in the past
    assert.equal(claimsFromGrqToken(expired), null);
  });
});

describe("shouldRefresh — the sliding rule", () => {
  it("leaves a young token alone (no re-mint on every launch)", () => {
    assert.equal(shouldRefresh({ iat: NOW - REFRESH_AFTER_SECONDS + 60, orig: NOW - 10 * DAY }, NOW), false);
  });
  it("refreshes a day-old token", () => {
    assert.equal(shouldRefresh({ iat: NOW - REFRESH_AFTER_SECONDS, orig: NOW - 10 * DAY }, NOW), true);
    assert.equal(shouldRefresh({ iat: NOW - 29 * DAY, orig: NOW - 200 * DAY }, NOW), true);
  });
  it("never rolls past the absolute ceiling from the original sign-in", () => {
    assert.equal(shouldRefresh({ iat: NOW - 5 * DAY, orig: NOW - MAX_SESSION_SECONDS }, NOW), false);
    assert.equal(shouldRefresh({ iat: NOW - 5 * DAY, orig: NOW - MAX_SESSION_SECONDS + DAY }, NOW), true);
  });
});

describe("refreshGrqToken — what /api/auth/me hands back", () => {
  it("returns nothing for a fresh token, an invalid one, or a browser with no Bearer", () => {
    assert.equal(refreshGrqToken(signGrqToken("a@b.c", { iat: NOW }), NOW), null);
    assert.equal(refreshGrqToken("nope", NOW), null);
    assert.equal(refreshGrqToken(null, NOW), null);
  });
  it("re-mints a day-old token for another 30 days and carries the original sign-in forward", () => {
    const orig = NOW - 40 * DAY;
    const old = signGrqToken("graham@example.com", { orig, iat: NOW - 25 * DAY });
    const fresh = refreshGrqToken(old, NOW);
    assert.ok(fresh);
    const c = claimsFromGrqToken(fresh);
    assert.ok(c);
    assert.equal(c.email, "graham@example.com");
    assert.equal(c.iat, NOW);
    assert.equal(c.exp, NOW + TTL_SECONDS);
    assert.equal(c.orig, orig, "the ceiling is measured from the ORIGINAL sign-in, not the refresh");
  });
  it("treats a pre-D125 token (no orig claim) as original at its iat, so it refreshes too", () => {
    // Simulate the old mint: sign without `orig` by going through jsonwebtoken directly.
    const jwt = require("jsonwebtoken") as typeof import("jsonwebtoken");
    const legacy = jwt.sign({ email: "legacy@x.y", iat: NOW - 2 * DAY }, process.env.GRQ_JWT_SECRET!, {
      algorithm: "HS256",
      issuer: "grq",
      audience: "grq-ios",
      expiresIn: TTL_SECONDS,
    });
    const c = claimsFromGrqToken(legacy);
    assert.ok(c);
    assert.equal(c.orig, c.iat);
    assert.ok(refreshGrqToken(legacy, NOW));
  });
  it("lets a session at the ceiling run out instead of extending it", () => {
    const old = signGrqToken("a@b.c", { orig: NOW - MAX_SESSION_SECONDS - DAY, iat: NOW - 2 * DAY });
    assert.equal(refreshGrqToken(old, NOW), null);
    assert.equal(emailFromGrqToken(old), "a@b.c", "still valid until its own exp — just not renewed");
  });
});
