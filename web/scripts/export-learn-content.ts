// Mirror the Learn portal curriculum to shared/content/learn.json for GRQ Go
// (docs/LEARN-PORTAL.md D110 + docs/LEARN-FRAMEWORK.md D111). The web Docker build
// context is ./web, so web can't import repo-root shared/ — web/lib/learn/content.ts is
// the source of truth and this script keeps the shared mirror in lockstep (same pattern
// as shared/contract.ts).
//
//   cd web && npx tsx scripts/export-learn-content.ts
//
// Run it after any content change and commit the JSON alongside.
//
// Shape: each lesson carries BOTH the D111 `blocks` array (new consumers) and the derived
// legacy fields (`body`, `tryIt`, `widget`, `receipt`) so an older GRQ Go build keeps
// rendering (the additive-only wire rule). Inline-check answer keys ship here on purpose —
// checks are formative and client-graded everywhere. EXAM keys do NOT: lib/learn/exams.ts
// is deliberately not exported; mobile sits exams through the API like web does.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { COURSES, LABS, lessonBodyMd, type LearnBlock } from "../lib/learn/content";
import { GLOSSARY } from "../lib/glossary";

const out = resolve(__dirname, "../../shared/content/learn.json");

const courses = COURSES.map((c) => ({
  slug: c.slug,
  n: c.n,
  title: c.title,
  tagline: c.tagline,
  status: c.status,
  ...(c.external ? { external: c.external } : {}),
  ...(c.overview?.length ? { overview: c.overview } : {}),
  lessons: c.lessons.map((l) => {
    const tryIt = l.blocks.filter((b): b is Extract<LearnBlock, { kind: "tryIt" }> => b.kind === "tryIt").flatMap((b) => b.links);
    const widget = l.blocks.find((b): b is Extract<LearnBlock, { kind: "widget" }> => b.kind === "widget")?.id;
    const receipt = l.blocks.find((b): b is Extract<LearnBlock, { kind: "receipt" }> => b.kind === "receipt")?.id;
    return {
      slug: l.slug,
      title: l.title,
      body: lessonBodyMd(l),
      ...(tryIt.length ? { tryIt } : {}),
      ...(widget ? { widget } : {}),
      ...(receipt ? { receipt } : {}),
      blocks: l.blocks,
    };
  }),
}));

const payload = {
  _generated: "web/scripts/export-learn-content.ts — do not edit by hand; edit web/lib/learn/content.ts and re-run",
  courses,
  labs: LABS,
  // The FULL glossary (def + example + related) — GRQ Go's tap-to-explain terms +
  // glossary browser read this; the older shared/content/glossary.json stays as-is
  // for its legacy consumers.
  glossary: GLOSSARY,
};
writeFileSync(out, JSON.stringify(payload, null, 2) + "\n");
console.log(
  `wrote ${out}: ${courses.length} courses (${courses.reduce((n, c) => n + c.lessons.length, 0)} lessons, ${courses.reduce(
    (n, c) => n + c.lessons.reduce((m, l) => m + l.blocks.filter((b) => b.kind === "check").length, 0),
    0,
  )} checks), ${LABS.length} labs, ${Object.keys(GLOSSARY).length} glossary terms`,
);
