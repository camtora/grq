import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// The class guard for API access (Cam, 2026-10-08 — "harden permissions"). Individual routes
// were each guarded by hand; nothing stopped the NEXT route shipping without one. Two rules,
// checked against the source of every app/api/**/route.ts:
//   1. every route resolves an identity, unless it is on PUBLIC below, with a reason;
//   2. every route that can WRITE (POST/PUT/PATCH/DELETE) takes the member write-lock
//      (memberFromRequest), unless it is on OPEN_WRITES below, with a reason.
// A new route that fits neither list fails the build until someone decides, on purpose.

const API = join(process.cwd(), "app", "api");

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? routes(p) : n === "route.ts" ? [p] : [];
  });
}
const key = (p: string) => relative(API, p).replace(/\\/g, "/").replace(/\/route\.ts$/, "");

const IDENTITY = /\b(memberFromRequest|sessionFromRequest|bookSessionFromRequest|getSession)\(/;
const WRITES = /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\b/;

// No identity resolved in the handler — each one says why that is safe.
const PUBLIC: Record<string, string> = {
  health: "LAN monitoring probe; exempt from the door by design, returns no fund data",
  indices: "public index levels; still behind the door (middleware), nothing per-user",
  "auth/google": "the sign-in itself: verifies a Google ID token, mints a JWT for MEMBERS only",
  "auth/dev": "404 unless GRQ_DEV_LOGIN=1 (never in production); members only",
};

// Writes that are deliberately not member-only — each one says who may call it and why.
const OPEN_WRITES: Record<string, string> = {
  "auth/google": "sign-in; no session exists yet",
  "auth/dev": "dev sign-in; 404 in production",
  explain: "the literacy explainer: a term-only prompt with no fund context, open to every tier",
  track: "the usage beacon: records the caller's own page view, nothing else",
  chat: "viewers may ask Alfred (read-only tools); users are refused by bookSessionFromRequest",
  "access-check": "every tier saves ITS OWN access-check row (email from the session, body clamped to known ids)",
};

describe("every API route resolves an identity or is deliberately public", () => {
  for (const p of routes(API)) {
    const k = key(p);
    it(k, () => {
      const src = readFileSync(p, "utf8");
      if (k in PUBLIC) {
        assert.doesNotMatch(src, IDENTITY, `${k} now resolves an identity — take it off PUBLIC`);
        return;
      }
      assert.match(src, IDENTITY, `${k} resolves no identity — guard it, or add it to PUBLIC with a reason`);
    });
  }
});

describe("every write takes the member write-lock or is deliberately open", () => {
  for (const p of routes(API)) {
    const k = key(p);
    const src = readFileSync(p, "utf8");
    if (!WRITES.test(src)) continue;
    it(k, () => {
      if (k in OPEN_WRITES) return;
      assert.match(src, /\bmemberFromRequest\(/, `${k} can write but never calls memberFromRequest — lock it, or add it to OPEN_WRITES with a reason`);
    });
  }
});

describe("the lists above stay honest", () => {
  it("name only routes that exist", () => {
    const have = new Set(routes(API).map(key));
    for (const k of [...Object.keys(PUBLIC), ...Object.keys(OPEN_WRITES)]) {
      assert.ok(have.has(k), `${k} is listed but there is no such route`);
    }
  });
  it("the dev identity fallback is dead in production", () => {
    const src = readFileSync(join(process.cwd(), "lib", "session.ts"), "utf8");
    // The only read of GRQ_DEV_EMAIL in the session resolvers is inside devEmail(), behind NODE_ENV.
    assert.equal(src.match(/process\.env\.GRQ_DEV_EMAIL/g)?.length, 1);
    assert.match(src, /NODE_ENV !== "production" \? \(process\.env\.GRQ_DEV_EMAIL/);
  });
});

// A page VIEW that queues paid research (an Opus dossier on the fund's quota) must be a
// member's. Today's movers and Smart Money both queued for any visitor until 2026-10-08.
describe("research queued by a page view is members-only", () => {
  const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
  it("Today's movers", () => {
    assert.match(read("app/page.tsx"), /marketGainers\.length > 0 && session\?\.role === "member"/);
  });
  it("Smart Money", () => {
    assert.match(read("app/market/smart-money/page.tsx"), /session\?\.role === "member"\) await queueDossiers\(/);
  });
  it("the stock page's on-demand dossier", () => {
    assert.match(read("app/stocks/[symbol]/page.tsx"), /if \(isMember && hasResearch && !hasFullDossier && !pendingReq\)/);
  });
  it("search history is scoped by tier, never 'by anyone'", () => {
    assert.match(read("app/api/stock-index/route.ts"), /session\.role === "member" \? memberEmails\(\) : \[session\.email\]/);
  });
});
