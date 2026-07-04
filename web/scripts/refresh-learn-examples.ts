// Manually refresh the Learn portal's living examples (docs/LEARN-FRAMEWORK.md D111 L4) —
// the same engine the agent runner fires nightly after the bars refresh. Use to seed on
// first deploy or to force-refresh after a data backfill.
//
//   cd web && npx tsx scripts/refresh-learn-examples.ts          # respects the 18h freshness gate
//   cd web && npx tsx scripts/refresh-learn-examples.ts --force  # regenerate everything now
import { runLearnExamplesRefresh } from "../lib/learn/examples";
import { prisma } from "../lib/db";

async function main() {
  const force = process.argv.includes("--force");
  const n = await runLearnExamplesRefresh(force);
  const rows = await prisma.learnExample.findMany({ orderBy: { key: "asc" } });
  console.log(`refreshed ${n} example(s); ${rows.length} live:`);
  for (const r of rows) console.log(`  ${r.key}  (${r.courseSlug}/${r.lessonSlug} · as of ${r.asOf.toISOString().slice(0, 16)})\n    ${r.md.slice(0, 140)}…`);
  await prisma.$disconnect();
}
void main();
