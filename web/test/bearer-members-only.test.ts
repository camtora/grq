import { test } from "node:test";
import assert from "node:assert/strict";

// The app token is a members-only credential. With the user tier open to everyone (D133),
// a removed member's still-valid token must resolve to NO session — not to "user", which the
// app's API routes would serve the book to (they sit outside the middleware's user-tier check).
process.env.GRQ_JWT_SECRET = "test-secret-test-secret-test-secret";
process.env.GRQ_USER_EMAILS = "*";

test("a Bearer token is honoured only for a current member", async () => {
  const { signGrqToken } = await import("../lib/auth-jwt");
  const { resolveIdentity } = await import("../lib/session");
  assert.equal(resolveIdentity(null, signGrqToken("cameron.tora@gmail.com"))?.role, "member");
  assert.equal(resolveIdentity(null, signGrqToken("removed-member@example.com")), null);
  assert.equal(resolveIdentity("", signGrqToken("removed-member@example.com")), null);
  assert.equal(resolveIdentity(null, "not-a-token"), null);
});

test("the browser header still resolves every tier", async () => {
  const { resolveIdentity } = await import("../lib/session");
  assert.equal(resolveIdentity("cameron.tora@gmail.com", null)?.role, "member");
  assert.equal(resolveIdentity("someone@example.com", null)?.role, "user");
});
