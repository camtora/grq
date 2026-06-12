/**
 * One-time (idempotent) migration: seed UniverseMember from the original
 * hand-screened list as ACTIVE. Never deletes anything — safe to re-run.
 *
 *   npx tsx prisma/seed-universe.ts
 */
import { prisma } from "../lib/db";
import { SEED } from "../lib/universe";

async function main() {
  for (const s of SEED) {
    await prisma.universeMember.upsert({
      where: { symbol: s.symbol },
      create: { ...s, status: "ACTIVE", addedBy: "seed-2026-06-12" },
      update: {}, // existing rows win — humans may have changed them since
    });
  }
  const counts = await prisma.universeMember.groupBy({ by: ["status"], _count: { symbol: true } });
  console.log("Universe:", counts.map((c) => `${c.status}=${c._count.symbol}`).join(" "));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
