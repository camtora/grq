/**
 * Seed the sim fund. DESTRUCTIVE: wipes all sim data and starts fresh —
 * that's the point (re-run any time the sandbox should reset).
 *
 *   npx tsx prisma/seed.ts
 *
 * Seeds: $5,000 contribution, default settings, a week of flat NAV history,
 * and three demo trades executed through the real SimBroker engine so every
 * dashboard page has honest engine output to render. Demo theses are clearly
 * labelled — they vanish on the next reseed when the sim goes live-fire.
 */
import { prisma } from "../lib/db";
import { SimBroker, writeNavSnapshot } from "../lib/broker/sim";

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
    prisma.account.deleteMany(),
    prisma.settings.deleteMany(),
  ]);

  console.log("Seeding account…");
  await prisma.settings.create({ data: { id: 1 } }); // defaults: BALANCED, $20 budget
  await prisma.account.create({ data: { id: 1, cashCents: 500_000 } });
  await prisma.contribution.create({
    data: { amountCents: 500_000, note: "Initial commitment — Cam" },
  });

  // A week of flat NAV history so the sparkline has a baseline.
  const day = 24 * 60 * 60 * 1000;
  for (let i = 7; i >= 1; i--) {
    await prisma.navSnapshot.create({
      data: {
        at: new Date(Date.now() - i * day),
        navCents: 500_000,
        cashCents: 500_000,
        positionsCents: 0,
        note: "pre-trading baseline",
      },
    });
  }

  await prisma.journalEntry.create({
    data: {
      kind: "SYSTEM",
      title: "Sim fund initialized",
      body:
        "GRQ simulation seeded with **$5,000.00 CAD**. Broker: `sim` (synthetic quotes). " +
        "Risk: Balanced. Fee budget: $20/month. Guardrails active: no shorting, no margin, " +
        "kill switch armed.\n\n_The demo trades below exercise the engine end-to-end; " +
        "everything resets when the sim goes live-fire in Phase 2._",
    },
  });

  console.log("Placing demo trades through SimBroker…");
  const broker = new SimBroker();
  const demos = [
    {
      symbol: "XIC",
      side: "BUY" as const,
      qty: 40,
      reason:
        "**[DEMO]** Core index anchor. Park ~a third of the book in the TSX composite while the " +
        "agent is still in development — the benchmark we must eventually beat.",
    },
    {
      symbol: "RY",
      side: "BUY" as const,
      qty: 8,
      reason:
        "**[DEMO]** Blue-chip placeholder position to exercise multi-position accounting, " +
        "ACB-with-commission math, and per-position P&L display.",
    },
    {
      symbol: "RY",
      side: "SELL" as const,
      qty: 3,
      reason:
        "**[DEMO]** Partial exit to exercise realized P&L, position reduction, and the " +
        "sell path through the fee gate.",
    },
  ];
  for (const d of demos) {
    const res = await broker.placeOrder({ ...d, type: "MARKET", placedBy: "seed-script" });
    console.log(" ", d.side, d.qty, d.symbol, "→", res.ok ? `order #${res.orderId} ${res.status}` : `REJECTED: ${res.rejectReason}`);
  }

  await writeNavSnapshot("seed complete");
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
