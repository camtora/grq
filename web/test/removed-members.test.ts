import { test } from "node:test";
import assert from "node:assert/strict";

// Removing someone is ONE switch (GRQ_REMOVED_EMAILS) and it beats every other list: the
// named members, the owners, the default viewers, and the open user tier.
process.env.GRQ_JWT_SECRET = "test-secret-test-secret-test-secret";
process.env.GRQ_USER_EMAILS = "*";
const MEMBER = "g.j.appleby@gmail.com"; // a named member and default owner
const ALT = "graham.j.appleby@gmail.com"; // a default viewer — reads the book

test("before removal, the addresses hold the roles the lists give them", async () => {
  delete process.env.GRQ_REMOVED_EMAILS;
  const u = await import("../lib/users");
  assert.equal(u.roleForEmail(MEMBER), "member");
  assert.equal(u.roleForEmail(ALT), "viewer");
  assert.equal(u.isOwner(MEMBER), true);
});

test("a removed address has no role anywhere — not member, owner, viewer, or open-tier user", async () => {
  process.env.GRQ_REMOVED_EMAILS = `${MEMBER}, ${ALT}`;
  const u = await import("../lib/users");
  for (const e of [MEMBER, ALT, MEMBER.toUpperCase()]) {
    assert.equal(u.roleForEmail(e), null, e);
    assert.equal(u.isMember(e), false, e);
    assert.equal(u.isOwner(e), false, e);
    assert.equal(u.isRemoved(e), true, e);
  }
  assert.ok(!u.memberEmails().includes(MEMBER));
  assert.deepEqual(u.namedMembers().map(([e]) => e), ["cameron.tora@gmail.com"]);
  assert.equal(u.roleForEmail("cameron.tora@gmail.com"), "member");
  assert.equal(u.roleForEmail("someone-else@example.com"), "user");
});

test("a removed member's app token resolves to no session", async () => {
  process.env.GRQ_REMOVED_EMAILS = MEMBER;
  const { signGrqToken } = await import("../lib/auth-jwt");
  const { resolveIdentity } = await import("../lib/session");
  assert.equal(resolveIdentity(null, signGrqToken(MEMBER)), null);
  assert.equal(resolveIdentity(MEMBER, null), null);
});

test("the door says 'removed' before it consults any role", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");
  const removed = src.indexOf("if (isRemoved(email))");
  assert.ok(removed > 0 && removed < src.indexOf("const role = roleForEmail(email);"));
});
