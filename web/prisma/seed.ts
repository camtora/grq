/**
 * Seed the sim fund — LIVE-FIRE EDITION. DESTRUCTIVE: wipes all sim data.
 *
 *   npx tsx prisma/seed.ts
 *
 * Seeds a clean $5,000 with a real XIC benchmark anchor (live delayed quote)
 * and NO demo trades — the agent earns every entry on this slate. NAV history
 * starts with a single honest baseline point.
 */
import { prisma } from "../lib/db";
import { refreshAllQuotes, getQuote } from "../lib/broker/quotes";
import { writeNavSnapshot } from "../lib/broker/sim";
import { BENCHMARK } from "../lib/universe";

async function main() {
  console.log("Wiping sim data…");
  await prisma.$transaction([
    prisma.journalEntry.deleteMany(),
    prisma.trade.deleteMany(),
    prisma.order.deleteMany(),
    prisma.position.deleteMany(),
    prisma.navSnapshot.deleteMany(),
    prisma.report.deleteMany(),
    prisma.contribution.deleteMany(),
    prisma.agentFocus.deleteMany(),
    prisma.account.deleteMany(),
    prisma.agentState.deleteMany(),
    prisma.settings.deleteMany(),
  ]);

  console.log("Fetching real quotes for the universe…");
  const n = await refreshAllQuotes();
  console.log(`  ${n} symbols quoted (delayed).`);
  const xic = await getQuote(BENCHMARK);
  if (!xic) throw new Error("No XIC quote — refusing to seed without a benchmark anchor.");
  console.log(`  ${BENCHMARK} @ $${(xic.midCents / 100).toFixed(2)} (benchmark anchor)`);

  console.log("Seeding account…");
  await prisma.settings.create({ data: { id: 1 } }); // BALANCED, $20 budget
  await prisma.account.create({ data: { id: 1, cashCents: 500_000 } });
  await prisma.contribution.create({
    data: {
      amountCents: 500_000,
      contributor: "Cam", // sim placeholder — real-money ownership: docs/OWNERSHIP.md
      xicPriceCents: xic.midCents,
      note: "Initial commitment",
    },
  });

  await prisma.journalEntry.create({
    data: {
      kind: "SYSTEM",
      title: "Sim fund initialized — live fire",
      body:
        `**$5,000.00 CAD** on the line (simulated). Real delayed market quotes. ` +
        `Benchmark anchored: same money in ${BENCHMARK} @ $${(xic.midCents / 100).toFixed(2)}. ` +
        `Risk: Balanced. Fee budget: $20/month. No shorting, no margin, kill switch armed.\n\n` +
        `The agent takes over at the next market open. The soak clock starts now — ` +
        `every clean week counts toward real money.`,
    },
  });

  await writeNavSnapshot("seed — clean slate");
  console.log("Done. Clean slate, agent's move.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
