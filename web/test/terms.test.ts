import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { termsRuling, termsCookieValue, termsCookieValid, safeNext, TERMS_VERSION, TERMS_PATH, TERMS_ACCEPT_API } from "@/lib/terms";
import { TERMS_SHORT, TERMS_SECTIONS, INTEREST_LINE } from "@/lib/terms-content";
import { userTierAllows } from "@/lib/access";

// The terms gate (D136). A USER clicks through once before the site opens; members and viewers
// are never asked; the cookie is a signed cache of the acceptance row, not something a browser
// can mint. And the words themselves carry the weight, so the sentences that matter are pinned.

const USER = "jose@example.com";

describe("termsRuling — only the user tier is asked, and only until it has agreed", () => {
  beforeEach(() => {
    process.env.GRQ_JWT_SECRET = "test-secret-test-secret-test-secret";
  });

  it("members and viewers are never asked, cookie or not", () => {
    for (const role of ["member", "viewer"] as const) {
      assert.equal(termsRuling(role, "/", null, "x@example.com"), "open");
      assert.equal(termsRuling(role, "/api/quotes", undefined, "x@example.com"), "open");
    }
    assert.equal(termsRuling(null, "/", null, null), "open", "no role = the door already refused; not this rule's call");
  });

  it("an unsigned user is redirected from a page and refused on an API", () => {
    assert.equal(termsRuling("user", "/", null, USER), "redirect");
    assert.equal(termsRuling("user", "/stocks/BN", null, USER), "redirect");
    assert.equal(termsRuling("user", "/learn/risk", "", USER), "redirect");
    assert.equal(termsRuling("user", "/api/quotes", null, USER), "refuse");
    assert.equal(termsRuling("user", "/api/stock-extras/BN", null, USER), "refuse");
  });

  it("the terms page, the accept route and static files stay open before acceptance", () => {
    assert.equal(termsRuling("user", TERMS_PATH, null, USER), "open");
    assert.equal(termsRuling("user", TERMS_ACCEPT_API, null, USER), "open");
    assert.equal(termsRuling("user", "/bull-splash.png", null, USER), "open");
    assert.equal(termsRuling("user", "/people/cam.png", null, USER), "open");
    assert.equal(termsRuling("user", "/api/dossier/BB.TO", null, USER), "refuse", "a dotted API path is not an asset");
  });

  it("a valid cookie opens everything the tier may reach", () => {
    const c = termsCookieValue(USER);
    assert.ok(c);
    assert.equal(termsRuling("user", "/", c, USER), "open");
    assert.equal(termsRuling("user", "/api/quotes", c, USER), "open");
  });

  it("a cookie is bound to one person and one version", () => {
    const c = termsCookieValue(USER)!;
    assert.equal(termsCookieValid(c, USER), true);
    assert.equal(termsCookieValid(c, "someone-else@example.com"), false, "another person's cookie");
    assert.equal(termsCookieValid(termsCookieValue(USER, "2020-01-01"), USER), false, "an old version");
    assert.equal(termsCookieValid(`${TERMS_VERSION}.forged`, USER), false, "a made-up MAC");
    assert.equal(termsCookieValid(c.slice(0, -1) + (c.endsWith("A") ? "B" : "A"), USER), false, "one byte off");
    assert.equal(termsCookieValid(TERMS_VERSION, USER), false, "no MAC at all");
  });

  it("without a secret nothing can be signed, and nothing verifies", () => {
    delete process.env.GRQ_JWT_SECRET;
    assert.equal(termsCookieValue(USER), null);
    assert.equal(termsCookieValid(`${TERMS_VERSION}.anything`, USER), false);
    assert.equal(termsRuling("user", "/", `${TERMS_VERSION}.anything`, USER), "redirect");
  });
});

describe("safeNext — only a same-site path, never the terms page itself", () => {
  it("keeps a path, drops anything else", () => {
    assert.equal(safeNext("/stocks/BN?tab=news"), "/stocks/BN?tab=news");
    assert.equal(safeNext("https://evil.example/"), "/");
    assert.equal(safeNext("//evil.example"), "/");
    assert.equal(safeNext("/\\evil.example"), "/");
    assert.equal(safeNext(TERMS_PATH), "/");
    assert.equal(safeNext(`${TERMS_PATH}?next=/`), "/");
    assert.equal(safeNext(undefined), "/");
  });
});

describe("the door and the tier map carry the gate", () => {
  const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
  it("middleware rules on the terms AFTER the tier's own access check, for the user tier only", () => {
    const src = read("middleware.ts");
    const tier = src.indexOf('if (role === "user" && !userTierAllows(path))');
    const terms = src.indexOf("termsRuling(role, path,");
    assert.ok(tier > 0 && terms > tier, "a book page is refused as members-only before the terms are even considered");
    assert.match(src, /outcome: null, respond: json\(TERMS_API_ERROR\)/, "an unsigned API call is a 403, not a logged refusal");
    assert.match(src, /NextResponse\.redirect\(`\$\{proto\}:\/\/\$\{host\}\$\{TERMS_PATH\}\?next=\$\{next\}`, 307\)/, "a page view goes to /terms on the PUBLIC origin nginx forwards (an absolute Location — a relative one 500s)");
  });
  it("a user may reach the terms page and the accept route, and nothing the gate doesn't list", () => {
    assert.equal(userTierAllows(TERMS_PATH), true);
    assert.equal(userTierAllows(TERMS_ACCEPT_API), true);
    assert.equal(userTierAllows("/api/terms"), false);
  });
  it("the accept route writes the caller's row for the current version and sets the cookie", () => {
    const src = read("app/api/terms/accept/route.ts");
    assert.match(src, /sessionFromRequest\(req\)/);
    assert.match(src, /email: session\.email, version: TERMS_VERSION/);
    assert.doesNotMatch(src, /body\.email|req\.json\(\)/, "nothing from the body decides whose row it is");
    assert.match(src, /res\.cookies\.set\(TERMS_COOKIE, value, termsCookieOptions\(\)\)/);
  });
  it("every page's footer carries the one line and the link", () => {
    const src = read("app/layout.tsx");
    assert.match(src, /Not investment advice\. Alfred is an AI\. Nothing here is an offer to invest\./);
    assert.match(src, /href="\/terms"/);
  });
  it("a non-member reads the fund's interest beside the calls", () => {
    for (const f of ["app/stocks/[symbol]/page.tsx", "app/universe/page.tsx", "app/market/watchlist/page.tsx", "app/market/page.tsx"]) {
      assert.match(read(f), /!book && .*INTEREST_LINE|: ` \$\{INTEREST_LINE\}`/, f);
    }
  });
});

describe("the words say what they must", () => {
  const all = [...TERMS_SHORT, ...TERMS_SECTIONS.flatMap((s) => s.body)].join("\n");
  const says = (re: RegExp, why: string) => it(why, () => assert.match(all, re));
  says(/Get Rich Quick/, "spells out the name and that it is a joke");
  says(/cannot (invest in it|put money in)/i, "nobody can invest");
  says(/nothing on this site is an offer/i, "no offer or invitation");
  says(/None of it is written for you/i, "not advice for the reader");
  says(/not registered|Nobody at GRQ is registered/i, "no registration claimed");
  says(/registered adviser/i, "points to a registered adviser");
  says(/AI model/i, "the writing is machine-made");
  says(/No person reads each one/i, "no human review per call");
  says(/may own, buy or sell any name it rates/i, "the fund's interest is disclosed");
  says(/does not (tell you|say) which/i, "and that the holdings are not shown");
  says(/delayed/i, "data may be delayed");
  says(/logged|records who you are/i, "visits are logged");
  says(/180 days/, "and for how long");
  says(/not liable/i, "no liability");
  says(/Ontario/, "governing law");
  it("the interest line is in the short version too", () => assert.ok(TERMS_SHORT.includes(INTEREST_LINE)));
  it("the version stamp matches the text", () => assert.match(all, new RegExp(`Version ${TERMS_VERSION}`)));
});
