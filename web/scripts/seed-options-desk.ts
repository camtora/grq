// Seed (or top up) the standing "House Desk" — the Options Desk A/B (docs/THE-OPTIONS-DESK.md):
// a CONTROL (Opus, stock-only) vs a TREATMENT (Opus + buy-to-open options), each on BALANCED with an
// equal CA$50k stake, daily cadence. Idempotent: re-running adds a missing arm without duplicating or
// resetting an arm that's already trading. Run: `npx tsx scripts/seed-options-desk.ts`.
import { prisma } from "../lib/db";
import { MODELS } from "../agent/policy";
import { modelLabel } from "../lib/race/models";

async function main() {
  const STAKE = 5_000_000; // CA$50,000 (matches the /race shadow stake)
  const model = MODELS.decision; // the champion — both arms are Opus; the ONLY difference is the option power
  const arms = [
    { arm: "control", label: `${modelLabel(model)} · stock-only` },
    { arm: "treatment", label: `${modelLabel(model)} · options` },
  ];

  let desk = await prisma.optionsDesk.findFirst({ where: { name: "House Desk" } });
  if (!desk) {
    desk = await prisma.optionsDesk.create({ data: { name: "House Desk", status: "RUNNING", cadence: "daily", startingStakeCents: STAKE, startedAt: new Date() } });
    console.log(`[seed] created House Desk #${desk.id} (daily, CA$${(STAKE / 100).toLocaleString()} each)`);
  } else {
    console.log(`[seed] House Desk #${desk.id} already exists — topping up missing arms`);
  }

  let added = 0;
  for (const { arm, label } of arms) {
    const existing = await prisma.deskEntrant.findFirst({ where: { deskId: desk.id, arm } });
    if (existing) {
      console.log(`[seed]   = ${label} (${arm}) already entered`);
      continue;
    }
    await prisma.deskEntrant.create({ data: { deskId: desk.id, model, arm, dial: "BALANCED", label, cashCents: desk.startingStakeCents, status: "ACTIVE" } });
    console.log(`[seed]   + ${label} (${arm})`);
    added++;
  }
  console.log(`[seed] done — 2 arms in the desk, ${added} newly added`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
