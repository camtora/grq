import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { COURSES, LABS, courseBySlug } from "@/lib/learn/content";
import { GLOSSARY } from "@/lib/glossary";

// Integrity checks for the Learn portal curriculum (docs/LEARN-PORTAL.md, D110) and the
// glossary it leans on. The big one: every tap-to-explain reference in a lesson body must
// resolve to a real glossary key, so lessons never ship a dead popover.

// Md.tsx turns [[slug]] and [text](#explain:slug) into <Term k={slug.toLowerCase()}>.
function termRefs(body: string): string[] {
  const refs: string[] = [];
  for (const m of body.matchAll(/\[\[([^\][]{1,80})\]\]/g)) refs.push(m[1].trim().toLowerCase());
  for (const m of body.matchAll(/\(#explain:([^)\s]+)\)/g)) refs.push(decodeURIComponent(m[1]).trim().toLowerCase());
  return refs;
}

describe("learn curriculum structure", () => {
  it("has unique course slugs and numbers", () => {
    assert.equal(new Set(COURSES.map((c) => c.slug)).size, COURSES.length);
    assert.equal(new Set(COURSES.map((c) => c.n)).size, COURSES.length);
  });

  it("live in-app courses carry lessons; soon/external courses carry none", () => {
    for (const c of COURSES) {
      if (c.status === "live" && !c.external) {
        assert.ok(c.lessons.length >= 3, `${c.slug} is live but has only ${c.lessons.length} lessons`);
      } else {
        assert.equal(c.lessons.length, 0, `${c.slug} should not embed lessons`);
      }
      if (c.external) assert.ok(c.external.href.startsWith("/"), `${c.slug} external href must be in-app`);
    }
  });

  it("has unique, non-empty lessons within each course", () => {
    for (const c of COURSES) {
      assert.equal(new Set(c.lessons.map((l) => l.slug)).size, c.lessons.length, `${c.slug} lesson slugs collide`);
      for (const l of c.lessons) {
        assert.ok(l.title.trim().length > 0, `${c.slug}/${l.slug} has no title`);
        assert.ok(l.body.trim().length > 100, `${c.slug}/${l.slug} body suspiciously short`);
      }
    }
  });

  it("resolves courseBySlug", () => {
    assert.equal(courseBySlug("the-machine")?.n, 1);
    assert.equal(courseBySlug("nope"), undefined);
  });
});

describe("learn lesson bodies", () => {
  it("reference only glossary terms that exist", () => {
    for (const c of COURSES)
      for (const l of c.lessons)
        for (const ref of termRefs(l.body))
          assert.ok(ref in GLOSSARY, `${c.slug}/${l.slug} references unknown term "${ref}"`);
  });

  it("keep navigation out of markdown (Md opens links in a new tab — use tryIt instead)", () => {
    for (const c of COURSES)
      for (const l of c.lessons) {
        for (const m of l.body.matchAll(/\]\(([^)]+)\)/g))
          assert.ok(m[1].startsWith("#explain:"), `${c.slug}/${l.slug} has a non-explain markdown link: ${m[1]}`);
        for (const t of l.tryIt ?? []) assert.ok(t.href.startsWith("/"), `${c.slug}/${l.slug} tryIt href must be in-app`);
      }
  });

  it("only embeds known widgets (the course page renders from this set)", () => {
    const known = new Set(["order-book", "compounding"]);
    for (const c of COURSES)
      for (const l of c.lessons)
        if (l.widget) assert.ok(known.has(l.widget), `${c.slug}/${l.slug} embeds unknown widget "${l.widget}"`);
  });

  it("only embeds known receipts (components/learn/Receipts.tsx dispatches this set)", () => {
    const known = new Set(["real-fills", "drawdown", "vs-xic", "fees", "guardrails", "soak"]);
    for (const c of COURSES)
      for (const l of c.lessons)
        if (l.receipt) assert.ok(known.has(l.receipt), `${c.slug}/${l.slug} embeds unknown receipt "${l.receipt}"`);
  });
});

describe("labs rail", () => {
  it("links in-app with teaching copy", () => {
    assert.ok(LABS.length >= 3);
    for (const lab of LABS) {
      assert.ok(lab.href.startsWith("/"), `${lab.title} href must be in-app`);
      assert.ok(lab.teaches.trim().length > 20, `${lab.title} needs real teaching copy`);
    }
  });
});

describe("glossary integrity", () => {
  it("every entry has a term and a definition", () => {
    for (const [slug, e] of Object.entries(GLOSSARY)) {
      assert.ok(e.term.trim().length > 0, `${slug} has no term`);
      assert.ok(e.def.trim().length > 0, `${slug} has no def`);
    }
  });

  it("every related slug resolves (no dead cross-links)", () => {
    for (const [slug, e] of Object.entries(GLOSSARY))
      for (const r of e.related ?? [])
        assert.ok(r in GLOSSARY, `${slug} relates to unknown term "${r}"`);
  });
});
