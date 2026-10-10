import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { roleForEmail } from "@/lib/users";
import { userTierAllows, USER_APIS, USER_PAGES } from "@/lib/access";

// D122 — the three GRQ tiers and the USER tier's deny-by-default door. If a future page or
// route must be reachable by a user, add it to lib/access.ts AND to ALLOWED below; if it
// serves the book, add it to BOOK so the door can never quietly open on it.

describe("roleForEmail — member > viewer > user > nobody", () => {
  beforeEach(() => {
    process.env.GRQ_ALLOWED_EMAILS = "";
    process.env.GRQ_VIEWER_EMAILS = ""; // empty → the default viewers (Cam's & Graham's alternates)
    process.env.GRQ_USER_EMAILS = " Jose@Example.com ,dave@example.com";
  });

  it("resolves each tier, case- and whitespace-insensitive", () => {
    assert.equal(roleForEmail("cameron.tora@gmail.com"), "member");
    assert.equal(roleForEmail("cameron@camerontora.ca"), "viewer");
    assert.equal(roleForEmail("jose@example.com"), "user");
    assert.equal(roleForEmail("  DAVE@example.com "), "user");
    assert.equal(roleForEmail("stranger@example.com"), null);
    assert.equal(roleForEmail(""), null);
    assert.equal(roleForEmail(null), null);
  });

  it("a higher tier outranks the user list", () => {
    process.env.GRQ_VIEWER_EMAILS = "jose@example.com";
    assert.equal(roleForEmail("jose@example.com"), "viewer");
    process.env.GRQ_ALLOWED_EMAILS = "jose@example.com";
    assert.equal(roleForEmail("jose@example.com"), "member");
  });

  it("an empty user list admits nobody as a user", () => {
    process.env.GRQ_USER_EMAILS = "";
    assert.equal(roleForEmail("jose@example.com"), null);
  });

  // The open tier (Cam, 2026-10-08): `*` makes anyone the SSO vouched for a USER — and only
  // ever a user. It must never lift anyone to viewer or member, or admit a non-address.
  it("`*` opens the USER tier to any real address, and nothing higher", () => {
    process.env.GRQ_USER_EMAILS = "*";
    assert.equal(roleForEmail("stranger@example.com"), "user");
    assert.equal(roleForEmail(" Someone.Else@Gmail.com "), "user");
    assert.equal(roleForEmail("cameron.tora@gmail.com"), "member");
    assert.equal(roleForEmail("cameron@camerontora.ca"), "viewer");
    for (const junk of ["", " ", "*", "not-an-email", "a@b", "two words@x.com", null, undefined]) {
      assert.equal(roleForEmail(junk as string | null), null, `"${junk}" is not an identity`);
    }
  });
  it("`*` alongside named users changes nothing for them", () => {
    process.env.GRQ_USER_EMAILS = "dave@example.com,*";
    assert.equal(roleForEmail("dave@example.com"), "user");
    assert.equal(roleForEmail("stranger@example.com"), "user");
  });
});

// Everything a user may reach — the research + education surface, its browser fetches, and
// the static assets the shell needs.
const ALLOWED = [
  "/",
  "/learn", "/learn/risk", "/learn/risk/drawdown", "/learn/risk/exam", "/learn/glossary",
  "/market", "/market/browse", "/market/smart-money", "/market/watchlist", "/market/research",
  "/universe",
  "/stocks", "/stocks/BN", "/stocks/BB.TO",
  "/options", "/options-desk", "/short-lab", "/day-lab", "/bulls",
  "/chess", "/chess/3", "/report-card",
  "/ideas", "/research", "/today", "/chat",
  "/access-check", "/api/access-check",
  "/bull-splash.png", "/grq-logo-light.png", "/people/cam.png", "/smartmoney/buffett.jpg",
  "/api/quotes", "/api/quotes?symbols=BN", "/api/intraday", "/api/stock-extras/BN", "/api/stock-index",
  "/api/indices", "/api/explain", "/api/track", "/api/options/chain/AAPL", "/api/hunt/status",
  "/api/chess/status", "/api/learn/svg",
];

// The book, the writes, and the members' rooms — a user must never reach any of these.
const BOOK = [
  "/portfolio", "/reports", "/reports/day/2026-09-05", "/reports/7", "/journal", "/activity",
  "/accounts", "/settings", "/tokens", "/traffic", "/how-it-works", "/admin", "/admin/usage",
  "/race", "/race/2026-09-05", // the champion's calls are the fund's actual orders
  "/api/portfolio", "/api/fund-day", "/api/nav-tape", "/api/chat", "/api/wire", "/api/today",
  "/api/reports", "/api/reports/day/2026-09-05", "/api/briefings", "/api/learn/receipts",
  "/api/learn/progress", "/api/learn/state", "/api/learn/exam/risk", "/api/messages",
  "/api/messages/unread", "/api/notifications", "/api/accounts", "/api/fx", "/api/killswitch",
  "/api/settings", "/api/fund-settings", "/api/universe", "/api/note", "/api/notes",
  "/api/how-it-works", "/api/dossier/BN", "/api/dossier/BB.TO", "/api/auth/me", "/api/auth/google",
  "/api/hunt", "/api/hunt/refresh", "/api/chess", "/api/chess/research", "/api/race", "/api/bulls",
  "/api/desk", "/api/short-lab", "/api/short-desk", "/api/day-lab", "/api/report-card",
  "/api/smart-money", "/api/watchlist", "/api/browse", "/api/symbol-search", "/api/sim/order",
  "/api/stocks/directive", "/api/stocks/share", "/api/external/keys", "/api/admin/usage-window",
  // Members' personal brokerage accounts — every route of the SnapTrade surface (Cam 2026-10-08).
  "/api/external/status", "/api/external/connect", "/api/external/sync", "/api/external/disconnect",
  "/api/daily-quotes", "/api/tokens", "/api/traffic", "/api/ideas", "/api/market",
];

describe("userTierAllows — the USER tier's deny-by-default door", () => {
  it("admits the research + education surface, its fetches, and the shell's assets", () => {
    for (const p of ALLOWED) {
      // Query strings never reach the door (middleware matches on pathname).
      assert.equal(userTierAllows(p.split("?")[0]), true, `expected the door to admit ${p}`);
    }
  });

  it("refuses the book, every write, and the members' rooms", () => {
    for (const p of BOOK) assert.equal(userTierAllows(p), false, `expected the door to refuse ${p}`);
  });

  it("matches by path segment, not by string prefix", () => {
    assert.equal(userTierAllows("/optionsx"), false);
    assert.equal(userTierAllows("/learnx"), false);
    assert.equal(userTierAllows("/api/quotesx"), false);
    assert.equal(userTierAllows("/options-desk"), true); // listed in its own right
  });

  it("an API path can never pass as a static asset", () => {
    assert.equal(userTierAllows("/api/dossier/BB.TO"), false);
    assert.equal(userTierAllows("/api/portfolio.json"), false);
  });

  it("the lists stay honest: no book route and no write route is on the API map", () => {
    const forbidden = ["portfolio", "fund-day", "nav-tape", "chat", "wire", "today", "reports", "briefings",
      "receipts", "messages", "notifications", "accounts", "fx", "killswitch", "settings", "universe",
      "note", "how-it-works", "dossier", "auth", "sim", "external", "admin", "tokens", "traffic"];
    for (const api of USER_APIS) {
      for (const f of forbidden) assert.equal(api.includes(`/${f}`), false, `${api} looks like the book or a write`);
    }
    for (const page of USER_PAGES) {
      for (const f of ["portfolio", "reports", "journal", "accounts", "settings", "tokens", "traffic", "how-it-works", "admin"]) {
        assert.equal(page.includes(f), false, `${page} is the book`);
      }
    }
  });
});

// The access check (D135) reports on the door; it must never be a way around it. Its list of
// "should be refused" paths is checked against the door itself, so the page can't claim a
// path is protected that a user can in fact reach — and its "should open" paths must open.
import { AUTO_CHECKS, sanitize } from "@/lib/access-check";

describe("the access check agrees with the door", () => {
  it("every 'should open' path is admitted and every 'should be refused' path is not", () => {
    for (const c of AUTO_CHECKS) {
      assert.equal(userTierAllows(c.path), c.kind === "open", `${c.id} ${c.path}`);
    }
  });
  it("a posted body is clamped to known ids and sane values", () => {
    const d = sanitize({
      auto: { A1: 200, B1: 403, ZZ: 200, A2: "200", A3: 9999 },
      manual: { C1: "pass", C2: "maybe", Q9: "fail" },
      notes: { C1: "x".repeat(2000), Q9: "nope" },
      overall: "y".repeat(5000),
      extra: { anything: true },
    });
    assert.deepEqual(d.auto, { A1: 200, B1: 403 });
    assert.deepEqual(d.manual, { C1: "pass" });
    assert.equal(d.notes.C1.length, 500);
    assert.equal(Object.keys(d.notes).length, 1);
    assert.equal(d.overall.length, 2000);
  });
});
