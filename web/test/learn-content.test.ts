import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { COURSES, LABS, courseBySlug, lessonBySlug, lessonChecks, readMinutes, type LearnBlock, type LearnQuestion } from "@/lib/learn/content";
import { EXAMS, examForCourse, gradeExam } from "@/lib/learn/exams";
import { parseNumericAnswer, choiceCorrect } from "@/lib/learn/answers";
import { GLOSSARY } from "@/lib/glossary";

// Integrity checks for the Learn curriculum (docs/LEARN-PORTAL.md D110 + the D111 block
// framework) and the glossary it leans on. The big ones: every tap-to-explain reference
// must resolve to a real glossary key (no dead popovers), markdown never carries nav
// links (Md new-tabs them — tryIt blocks instead), every question's answer key must be
// resolvable, and every live lesson must actually ask something of the learner.

// Md.tsx turns [[slug]] and [text](#explain:slug) into <Term k={slug.toLowerCase()}>.
function termRefs(body: string): string[] {
  const refs: string[] = [];
  for (const m of body.matchAll(/\[\[([^\][]{1,80})\]\]/g)) refs.push(m[1].trim().toLowerCase());
  for (const m of body.matchAll(/\(#explain:([^)\s]+)\)/g)) refs.push(decodeURIComponent(m[1]).trim().toLowerCase());
  return refs;
}

/** Every markdown string a block can render (prose, callouts, questions, fallbacks). */
function blockMd(b: LearnBlock): string[] {
  switch (b.kind) {
    case "prose":
    case "callout":
      return [b.md];
    case "example":
      return [b.fallbackMd];
    case "check":
      return questionMd(b.q);
    default:
      return [];
  }
}

function questionMd(q: LearnQuestion): string[] {
  const md = [q.prompt, q.explain];
  if (q.kind === "choice") md.push(...q.options.map((o) => o.md));
  return md;
}

function assertValidQuestion(q: LearnQuestion, where: string) {
  assert.ok(q.id.trim().length > 0, `${where} question missing id`);
  assert.ok(q.prompt.trim().length > 0, `${where}/${q.id} has no prompt`);
  assert.ok(q.explain.trim().length > 0, `${where}/${q.id} has no explain (the teach-back is the point)`);
  if (q.kind === "choice") {
    assert.ok(q.options.length >= 2, `${where}/${q.id} needs ≥2 options`);
    const ids = new Set(q.options.map((o) => o.id));
    assert.equal(ids.size, q.options.length, `${where}/${q.id} option ids collide`);
    assert.ok(q.correct.length >= 1, `${where}/${q.id} has no correct answer`);
    for (const c of q.correct) assert.ok(ids.has(c), `${where}/${q.id} correct "${c}" isn't an option`);
    assert.equal(!!q.multi, q.correct.length > 1, `${where}/${q.id} multi flag must match correct-count`);
  } else {
    assert.ok(Number.isInteger(q.answer), `${where}/${q.id} numeric answer must be an integer (${q.unit})`);
    assert.ok((q.tolerance ?? 0) >= 0 && Number.isInteger(q.tolerance ?? 0), `${where}/${q.id} bad tolerance`);
  }
}

const allMd: { where: string; md: string }[] = [];
for (const c of COURSES) for (const l of c.lessons) for (const b of l.blocks) for (const md of blockMd(b)) allMd.push({ where: `${c.slug}/${l.slug}`, md });
for (const e of EXAMS) for (const q of e.questions) for (const md of questionMd(q)) allMd.push({ where: `exam:${e.courseSlug}/${q.id}`, md });

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

  it("has unique, non-empty lessons within each course (and none named 'exam' — that route is taken)", () => {
    for (const c of COURSES) {
      assert.equal(new Set(c.lessons.map((l) => l.slug)).size, c.lessons.length, `${c.slug} lesson slugs collide`);
      for (const l of c.lessons) {
        assert.notEqual(l.slug, "exam", `${c.slug}/${l.slug} shadows the exam route`);
        assert.ok(l.title.trim().length > 0, `${c.slug}/${l.slug} has no title`);
        const prose = l.blocks.filter((b) => b.kind === "prose" || b.kind === "callout");
        assert.ok(prose.length >= 1, `${c.slug}/${l.slug} has no written content`);
        assert.ok(
          prose.reduce((n, b) => n + ("md" in b ? b.md.length : 0), 0) > 100,
          `${c.slug}/${l.slug} written content suspiciously short`,
        );
        assert.ok(readMinutes(l) >= 2, `${c.slug}/${l.slug} readMinutes broke`);
      }
    }
  });

  it("every live lesson asks something of the learner (≥1 inline check — D111 §3)", () => {
    for (const c of COURSES)
      if (c.status === "live" && !c.external)
        for (const l of c.lessons) assert.ok(lessonChecks(l).length >= 1, `${c.slug}/${l.slug} has no check`);
  });

  it("resolves courseBySlug/lessonBySlug", () => {
    const c = courseBySlug("the-machine");
    assert.equal(c?.n, 1);
    assert.equal(c?.title, "Market structure");
    assert.ok(lessonBySlug(c!, "what-a-stock-is"));
    assert.equal(courseBySlug("nope"), undefined);
  });
});

describe("learn block content", () => {
  it("references only glossary terms that exist", () => {
    for (const { where, md } of allMd)
      for (const ref of termRefs(md)) assert.ok(ref in GLOSSARY, `${where} references unknown term "${ref}"`);
  });

  it("keeps navigation out of markdown (Md opens links in a new tab — tryIt/video blocks instead)", () => {
    for (const { where, md } of allMd)
      for (const m of md.matchAll(/\]\(([^)]+)\)/g))
        assert.ok(m[1].startsWith("#explain:"), `${where} has a non-explain markdown link: ${m[1]}`);
  });

  it("block payloads are well-formed (media ids, video ids, chart specs, tryIt hrefs)", () => {
    const widgets = new Set(["order-book", "compounding"]);
    const receipts = new Set(["real-fills", "drawdown", "vs-xic", "fees", "guardrails", "soak"]);
    const diagrams = new Set([
      "order-path", "market-map", "book-ladder", "acb-timeline", "drawdown-ladder", "margin-spiral", "fee-gravity", "grq-pipeline",
      "two-listings", "ex-date-step", "pizza-split", "target-chase", "one-bet-ten-times", "short-asymmetry", "quote-paths", "thesis-price-2x2", "proposes-disposes", "rsi-gauge",
    ]);
    const examples = new Set(["biggest-gap", "volume-mover", "spread-pair", "calm-vs-bumpy", "insider-cluster", "buzz-leader", "fx-drift"]);
    for (const c of COURSES)
      for (const l of c.lessons)
        for (const b of l.blocks) {
          const where = `${c.slug}/${l.slug}`;
          if (b.kind === "widget") assert.ok(widgets.has(b.id), `${where} embeds unknown widget "${b.id}"`);
          if (b.kind === "receipt") assert.ok(receipts.has(b.id), `${where} embeds unknown receipt "${b.id}"`);
          if (b.kind === "diagram") assert.ok(diagrams.has(b.id), `${where} embeds unknown diagram "${b.id}"`);
          if (b.kind === "chart") {
            assert.ok(b.spec.symbol.trim().length > 0 && b.spec.label.trim().length > 0, `${where} chart needs symbol + label`);
            assert.ok(b.spec.days >= 30 && b.spec.days <= 400, `${where} chart days out of range`);
          }
          if (b.kind === "video") {
            assert.match(b.yt, /^[\w-]{11}$/, `${where} bad YouTube id "${b.yt}"`);
            assert.ok(b.minutes > 0 && b.why.trim().length > 0, `${where} video needs minutes + a why line`);
          }
          if (b.kind === "tryIt") for (const t of b.links) assert.ok(t.href.startsWith("/"), `${where} tryIt href must be in-app`);
          if (b.kind === "figure") assert.ok(b.src.startsWith("/") && b.alt.trim().length > 0, `${where} figure needs a local src + alt`);
          if (b.kind === "example") {
            assert.ok(examples.has(b.key), `${where} uses unregistered example "${b.key}" (lib/learn/examples.ts)`);
            assert.ok(b.fallbackMd.trim().length > 0, `${where} example needs an authored fallback`);
          }
        }
  });

  it("every live LESSON shows something beyond prose (≥1 visual/live block — D111 L3+L4)", () => {
    const visual = new Set(["diagram", "chart", "video", "figure", "widget", "receipt", "example"]);
    for (const c of COURSES)
      if (c.status === "live" && !c.external)
        for (const l of c.lessons) {
          const n = l.blocks.filter((b) => visual.has(b.kind)).length;
          assert.ok(n >= 1, `${c.slug}/${l.slug} is all prose — the framework exists to prevent exactly this`);
        }
  });

  it("inline check questions have valid, globally-unique keys", () => {
    const seen = new Set<string>();
    for (const c of COURSES)
      for (const l of c.lessons)
        for (const q of lessonChecks(l)) {
          assertValidQuestion(q, `${c.slug}/${l.slug}`);
          assert.ok(!seen.has(q.id), `check id "${q.id}" collides`);
          seen.add(q.id);
        }
  });
});

describe("learn exams", () => {
  it("every live course has an exam (Options included — one exam system, eight courses)", () => {
    for (const c of COURSES)
      if (c.status === "live") assert.ok(examForCourse(c.slug), `${c.slug} is live but has no exam`);
    for (const e of EXAMS) assert.ok(courseBySlug(e.courseSlug), `exam for unknown course ${e.courseSlug}`);
  });

  it("exams are substantial, valid, and reviewable", () => {
    const seen = new Set<string>();
    for (const e of EXAMS) {
      assert.ok(e.questions.length >= 6, `${e.courseSlug} exam has only ${e.questions.length} questions`);
      assert.ok(e.passPct >= 50 && e.passPct <= 100, `${e.courseSlug} passPct out of range`);
      assert.ok(e.version >= 1);
      const course = courseBySlug(e.courseSlug)!;
      for (const q of e.questions) {
        assertValidQuestion(q, `exam:${e.courseSlug}`);
        assert.ok(!seen.has(q.id), `exam question id "${q.id}" collides`);
        seen.add(q.id);
        if (q.reviewLesson) assert.ok(lessonBySlug(course, q.reviewLesson), `exam:${e.courseSlug}/${q.id} reviews unknown lesson "${q.reviewLesson}"`);
      }
    }
  });

  it("grades a perfect sitting at 100 and an empty one at 0", () => {
    for (const e of EXAMS) {
      const perfect: Record<string, string | string[]> = {};
      for (const q of e.questions) {
        if (q.kind === "choice") perfect[q.id] = q.multi ? q.correct : q.correct[0];
        else perfect[q.id] = q.unit === "cents" ? (q.answer / 100).toFixed(2) : String(q.answer);
      }
      const full = gradeExam(e, perfect);
      assert.equal(full.scorePct, 100, `${e.courseSlug} perfect sitting graded ${full.scorePct}`);
      assert.ok(full.passed);
      const empty = gradeExam(e, {});
      assert.equal(empty.scorePct, 0);
      assert.ok(!empty.passed);
    }
  });
});

describe("answer parsing (the no-floats rule extends to homework)", () => {
  it("parses money as string-math cents", () => {
    assert.equal(parseNumericAnswer("cents", "20.50"), 2050);
    assert.equal(parseNumericAnswer("cents", "$6"), 600);
    assert.equal(parseNumericAnswer("cents", "0.20"), 20);
    assert.equal(parseNumericAnswer("cents", "800"), 80000);
    assert.equal(parseNumericAnswer("cents", "-1.05"), -105);
    assert.equal(parseNumericAnswer("cents", "1.234"), null);
    assert.equal(parseNumericAnswer("cents", "abc"), null);
  });

  it("parses plain integers with unit decorations", () => {
    assert.equal(parseNumericAnswer("pct", "33%"), 33);
    assert.equal(parseNumericAnswer("pct", " 100 "), 100);
    assert.equal(parseNumericAnswer("years", "8"), 8);
    assert.equal(parseNumericAnswer("shares", "x"), null);
  });

  it("choice grading is set-equality", () => {
    const q = { id: "t", kind: "choice", prompt: "p", explain: "e", options: [{ id: "a", md: "a" }, { id: "b", md: "b" }, { id: "c", md: "c" }], correct: ["a", "b"], multi: true } as const;
    assert.ok(choiceCorrect(q, ["b", "a"]));
    assert.ok(!choiceCorrect(q, ["a"]));
    assert.ok(!choiceCorrect(q, ["a", "b", "c"]));
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
