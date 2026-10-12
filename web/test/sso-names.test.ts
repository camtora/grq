import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Names, never addresses (Cam, 2026-10-11). The map is infra's oauth2-proxy/users.json.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sso-names-"));
const file = path.join(dir, "users.json");
fs.writeFileSync(
  file,
  JSON.stringify({ "Jose@Example.com": { first: "Jose", last: "Hortelano" }, "cameron.tora@gmail.com": { first: "Cameron", last: "Tora" } }),
);
process.env.USERS_FILE = file;

test("an SSO user shows as first + last, a member keeps GRQ's name, an unnamed address never shows whole", async () => {
  const { nameForEmail, displayNameForEmail } = await import("../lib/sso-names");
  assert.equal(nameForEmail("jose@example.com"), "Jose Hortelano");
  assert.equal(nameForEmail("cameron.tora@gmail.com"), "Cam");
  assert.equal(nameForEmail("nobody@example.com"), null);
  assert.equal(displayNameForEmail("nobody@example.com"), "nobody");
});

test("an edit to the file is picked up without a restart", async () => {
  const { nameForEmail } = await import("../lib/sso-names");
  fs.writeFileSync(file, JSON.stringify({ "new@example.com": { first: "New", last: "Person" } }));
  fs.utimesSync(file, new Date(), new Date(Date.now() + 5000));
  assert.equal(nameForEmail("new@example.com"), "New Person");
});
