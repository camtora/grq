// Seed (or top up) the standing "House Race" — the 8 bulls (champion + every configured
// challenger) each on BALANCED with an equal CA$25k stake, daily cadence. Idempotent: re-running
// adds any newly-configured model (e.g. a freshly-added bull) without duplicating existing ones,
// and never resets a bull that's already trading. Run: `npx tsx scripts/seed-house-race.ts`.
import { prisma } from "../lib/db";
import { MODELS, RACE } from "../agent/policy";
import { modelLabel } from "../lib/race/models";

async function main() {
  const STAKE = 2_500_000; // CA$25,000
  const roster = [...new Set([MODELS.decision, ...RACE.challengers])];

  let race = await prisma.race.findFirst({ where: { name: "House Race" } });
  if (!race) {
    race = await prisma.race.create({
      data: { name: "House Race", status: "RUNNING", cadence: "daily", startingStakeCents: STAKE, startedAt: new Date() },
    });
    console.log(`[seed] created House Race #${race.id} (daily, CA$${(STAKE / 100).toLocaleString()} each)`);
  } else {
    console.log(`[seed] House Race #${race.id} already exists — topping up missing bulls`);
  }

  let added = 0;
  for (const model of roster) {
    const existing = await prisma.raceEntrant.findFirst({ where: { raceId: race.id, model } });
    if (existing) {
      console.log(`[seed]   = ${modelLabel(model)} already entered`);
      continue;
    }
    await prisma.raceEntrant.create({
      data: { raceId: race.id, model, dial: "BALANCED", label: modelLabel(model), cashCents: race.startingStakeCents, status: "ACTIVE" },
    });
    console.log(`[seed]   + ${modelLabel(model)} (${model})`);
    added++;
  }
  console.log(`[seed] done — ${roster.length} bulls in the field, ${added} newly added`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
