import { prisma } from "@/lib/db";
import { startOfEtDay } from "@/agent/calendar";

// Read-only integrity audit of the persisted Bull-Race books (the /bulls leaderboards). PURE DB
// reads — no quotes, no FX, no mutation. It catches the silent-corruption classes a leaderboard
// can't show on its own:
//   • ragged / unsynchronized NAV marks — with the atomic snapshot (1b) every active bull gets
//     exactly one mark per tick, so per-entrant snapshot counts for the day must be equal;
//   • a NAV that doesn't reconcile to cash + positions (a phantom, the D90 class);
//   • negative cash (a margin leak — the sandbox is long-only, cash-only).
// The DERIVED Second-Opinions book (replayBook) isn't persisted, so it's locked by unit tests
// instead (test/race-book.test.ts), not here.

export type ExperimentCheck = { ok: boolean; violations: string[]; warnings: string[]; info: string[] };

export async function verifyExperiments(now: Date = new Date()): Promise<ExperimentCheck> {
  const violations: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];

  const races = await prisma.race.findMany({
    where: { status: "RUNNING" },
    include: { entrants: { where: { status: "ACTIVE" }, include: { _count: { select: { trades: true } } } } },
  });
  const dayStart = startOfEtDay(now);

  for (const race of races) {
    const ids = race.entrants.map((e) => e.id);
    if (ids.length === 0) continue;

    // (1b) Snapshot synchronization: counts since the ET day open must be equal across active bulls.
    const snapsToday = await prisma.raceNavSnapshot.groupBy({
      by: ["entrantId"],
      where: { entrantId: { in: ids }, at: { gte: dayStart } },
      _count: { _all: true },
    });
    const countById = new Map(snapsToday.map((s) => [s.entrantId, s._count._all]));
    const counts = ids.map((id) => countById.get(id) ?? 0);
    const min = Math.min(...counts);
    const max = Math.max(...counts);
    if (max - min > 1) {
      warnings.push(`"${race.name}": ragged NAV marks today — active bulls got ${min}..${max} snapshots (should be equal). A bull was skipped on a tick.`);
    }
    const missing = ids.filter((id) => (countById.get(id) ?? 0) === 0);
    if (missing.length && max > 0) {
      warnings.push(`"${race.name}": ${missing.length} active bull(s) have NO snapshot today despite ${max} ticks.`);
    }

    // NAV parity + no-margin: the latest snapshot per entrant must reconcile and never go negative.
    const latest = await prisma.raceNavSnapshot.findMany({
      where: { entrantId: { in: ids } },
      orderBy: [{ entrantId: "asc" }, { at: "desc" }],
      distinct: ["entrantId"],
    });
    for (const s of latest) {
      if (s.navCadCents !== s.cashCents + s.positionsCadCents) {
        violations.push(`"${race.name}" entrant ${s.entrantId}: NAV ${s.navCadCents} ≠ cash ${s.cashCents} + positions ${s.positionsCadCents}.`);
      }
      if (s.cashCents < 0) violations.push(`"${race.name}" entrant ${s.entrantId}: negative cash ${s.cashCents} (margin leak).`);
      if (s.positionsCadCents < 0) violations.push(`"${race.name}" entrant ${s.entrantId}: negative positions value ${s.positionsCadCents}.`);
    }
    for (const e of race.entrants) {
      if (e.cashCents < 0) violations.push(`"${race.name}" entrant ${e.id} (${e.label}): live cash ${e.cashCents} < 0.`);
    }

    const untraded = race.entrants.filter((e) => e._count.trades === 0).length;
    info.push(`"${race.name}": ${ids.length} active bulls, ${untraded} unranked (0 trades), ${min === max ? `${max}` : `${min}..${max}`} snapshot(s) today.`);
  }

  info.push(`Report card: ${await prisma.prediction.count()} directional calls snapshotted.`);

  return { ok: violations.length === 0, violations, warnings, info };
}
