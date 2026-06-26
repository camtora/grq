// One-off backfill for the D-watch architecture change: seed the new StockWatch
// table from the legacy single-owner UniverseMember.addedBy field, so every name a
// member is currently attributed to keeps showing on their watchlist after the cut.
//
// Rules (match the new model):
//   - Watchers are humans only — only addedBy values that resolve to Cam/Graham
//     become a watch. Agent/seed/null/hunt adds get NO watch row.
//   - Skip RETIRED names (research stopped — not actively watched).
//   - CANDIDATE *and* ACTIVE both get a watch (a promoted name stays watched).
//   - Idempotent: re-running won't duplicate (createMany skipDuplicates on the PK).
//
// Run once, host-side:  cd web && npx tsx scripts/backfill-watches.ts

import { prisma } from "../lib/db";
import { personByName } from "../lib/people";
import { emailForMemberKey } from "../lib/users";

async function main() {
  const members = await prisma.universeMember.findMany({
    where: { status: { in: ["CANDIDATE", "ACTIVE"] } },
    select: { symbol: true, addedBy: true, status: true, addedAt: true },
  });

  const rows: { symbol: string; email: string; addedAt: Date }[] = [];
  let skipped = 0;
  for (const m of members) {
    const person = personByName(m.addedBy);
    const email = person ? emailForMemberKey(person.key) : null;
    if (!email) {
      skipped++;
      continue; // agent/seed/null add — no human watcher to seed
    }
    rows.push({ symbol: m.symbol, email, addedAt: m.addedAt });
  }

  const res = await prisma.stockWatch.createMany({ data: rows, skipDuplicates: true });

  console.log(`Backfill complete.`);
  console.log(`  tracked names scanned : ${members.length}`);
  console.log(`  watches inserted      : ${res.count}`);
  console.log(`  skipped (no human)    : ${skipped}`);
  const byMember = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.email] = (acc[r.email] ?? 0) + 1;
    return acc;
  }, {});
  for (const [email, n] of Object.entries(byMember)) console.log(`    ${email}: ${n}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
