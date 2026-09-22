// Dry-run the agent's universe-slot reclaim (D126, agent/demote.ts). Runs the SAME pure
// decideDemote the demote_from_universe tool uses, over every LIVE ACTIVE name, and prints
// which slots the agent COULD hand back and which are protected and why — WITHOUT demoting
// anything. Use it to sanity-check the guards before (and after) a change to them, and to
// see how much room the agent actually has under the maxUniverseSize cap.
//
//   cd web && npx tsx scripts/demote-dryrun.ts            # summary + the freeable list
//   cd web && npx tsx scripts/demote-dryrun.ts --verbose  # every name's decision
import { decideDemote, type DemoteSignals } from "../agent/demote";
import { activeUniverse, BENCHMARK } from "../lib/universe";
import { personByName } from "../lib/people";
import { SELF_INVEST } from "../agent/policy";
import { prisma } from "../lib/db";

async function main() {
  const verbose = process.argv.includes("--verbose");
  const active = await activeUniverse();

  const [watches, positions, directives, recentDemotes] = await Promise.all([
    prisma.stockWatch.findMany({ select: { symbol: true } }),
    prisma.position.findMany({ select: { symbol: true, qty: true } }),
    prisma.symbolDirective.findMany({ select: { symbol: true, directive: true } }),
    prisma.journalEntry.count({
      where: { title: { startsWith: "Self-demoted —" }, at: { gte: new Date(Date.now() - 7 * 86_400_000) } },
    }),
  ]);
  const watchCount = new Map<string, number>();
  for (const w of watches) watchCount.set(w.symbol, (watchCount.get(w.symbol) ?? 0) + 1);
  const qty = new Map(positions.map((p) => [p.symbol, p.qty]));
  const pinned = new Set(directives.filter((d) => d.directive === "PINNED").map((d) => d.symbol));

  const freeable: string[] = [];
  const blocked = new Map<string, string[]>(); // one bucket per reason shape

  for (const row of active) {
    const signals: DemoteSignals = {
      status: row.status,
      isBenchmark: row.symbol === BENCHMARK,
      humanAdded: personByName(row.addedBy) != null,
      watchers: watchCount.get(row.symbol) ?? 0,
      pinned: pinned.has(row.symbol),
      heldQty: qty.get(row.symbol) ?? 0,
      // Ask per-name as if it were the next one demoted, so the cap doesn't mask the
      // eligibility picture — the cap is reported separately below.
      recentDemotes: 0,
    };
    const d = decideDemote(signals);
    if (d.demote) freeable.push(row.symbol);
    else {
      // Bucket by the guard that fired, not the formatted numbers in the message.
      const key = signals.isBenchmark
        ? "benchmark"
        : signals.pinned
          ? "member PINNED it"
          : signals.humanAdded
            ? `member-added (${row.addedBy})`
            : signals.watchers > 0
              ? "watched by a member"
              : signals.heldQty > 0
                ? "held"
                : "other";
      blocked.set(key, [...(blocked.get(key) ?? []), row.symbol]);
    }
    if (verbose) console.log(`  ${row.symbol.padEnd(7)} ${d.demote ? "FREE  " : "keep  "} ${d.reason}`);
  }

  console.log(`\nUniverse: ${active.length}/${SELF_INVEST.maxUniverseSize} ACTIVE` +
    (active.length >= SELF_INVEST.maxUniverseSize ? "  ← AT THE CAP" : ""));
  console.log(`Agent demotions in the last 7d: ${recentDemotes}/${SELF_INVEST.maxDemotesPerRollingWeek}`);
  console.log(`\nFreeable by the agent (${freeable.length}):\n  ${freeable.join(" ") || "—"}`);
  console.log(`\nProtected (${active.length - freeable.length}):`);
  for (const [reason, syms] of [...blocked].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${String(syms.length).padStart(3)}  ${reason}\n       ${syms.join(" ")}`);
  }
  // The guards must never let a held, watched, pinned or member-added name through.
  const leak = freeable.filter(
    (s) => (qty.get(s) ?? 0) > 0 || (watchCount.get(s) ?? 0) > 0 || pinned.has(s) || s === BENCHMARK,
  );
  console.log(`\nGuard check: ${leak.length === 0 ? "clean — no held/watched/pinned/benchmark name is freeable" : `LEAK → ${leak.join(" ")}`}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
