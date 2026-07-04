// Mirror the Learn portal curriculum to shared/content/learn.json for GRQ Go
// (docs/LEARN-PORTAL.md, D110). The web Docker build context is ./web, so web can't
// import repo-root shared/ — web/lib/learn/content.ts is the source of truth and this
// script keeps the shared mirror in lockstep (same pattern as shared/contract.ts).
//
//   cd web && npx tsx scripts/export-learn-content.ts
//
// Run it after any content change and commit the JSON alongside.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { COURSES, LABS } from "../lib/learn/content";

const out = resolve(__dirname, "../../shared/content/learn.json");
const payload = {
  _generated: "web/scripts/export-learn-content.ts — do not edit by hand; edit web/lib/learn/content.ts and re-run",
  courses: COURSES,
  labs: LABS,
};
writeFileSync(out, JSON.stringify(payload, null, 2) + "\n");
console.log(`wrote ${out}: ${COURSES.length} courses (${COURSES.reduce((n, c) => n + c.lessons.length, 0)} lessons), ${LABS.length} labs`);
