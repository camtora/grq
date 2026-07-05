// Dry-run the weekly research curation (Cam 2026-07-05, policy REFRESH). Runs the SAME
// read-only plan the Sunday sweep uses (agent/curation.ts planWeeklyCuration) over the
// LIVE pool and prints what WOULD be re-researched, skipped, and retired — plus a rough
// token-savings estimate — WITHOUT queuing or retiring anything. Use it to sanity-check
// the thresholds before (and after) a change.
//
//   cd web && npx tsx scripts/refresh-dryrun.ts            # summary + reasons
//   cd web && npx tsx scripts/refresh-dryrun.ts --verbose  # every name's decision
import { planWeeklyCuration } from "../agent/curation";
import { prisma } from "../lib/db";

const AVG_DOSSIER_TOKENS = 284_000; // measured avg/run from the usage ledger

async function main() {
  const verbose = process.argv.includes("--verbose");
  const plan = await planWeeklyCuration();

  const oldCost = plan.total * AVG_DOSSIER_TOKENS;
  const newCost = plan.queue.length * AVG_DOSSIER_TOKENS;
  const m = (n: number) => `${(n / 1e6).toFixed(1)}M`;

  console.log(`\n  Weekly research curation — DRY RUN (no writes)\n  ${"─".repeat(58)}`);
  console.log(`  pool (tracked)      ${plan.total}`);
  console.log(`  → queue (refresh)   ${plan.queue.length}`);
  console.log(`  → skip (quiet)      ${plan.skip.length}`);
  console.log(`  → retire (prune)    ${plan.retire.length}`);
  console.log(`  kept candidates     ${plan.keptCandidates}`);
  console.log(`  ${"─".repeat(58)}`);
  console.log(`  est. sweep tokens   ${m(oldCost)} (blind)  →  ${m(newCost)} (gated)`);
  console.log(`  est. weekly saving  ~${m(oldCost - newCost)}  (${Math.round((1 - newCost / oldCost) * 100)}% off the sweep)\n`);

  const tally = (rows: { reason: string }[]) => {
    const t = new Map<string, number>();
    for (const r of rows) {
      const key = r.reason.replace(/\d+(\.\d+)?/g, "N"); // bucket "moved 8.3%" ≈ "moved N%"
      t.set(key, (t.get(key) ?? 0) + 1);
    }
    return [...t.entries()].sort((a, b) => b[1] - a[1]);
  };

  console.log("  QUEUE reasons:");
  for (const [r, n] of tally(plan.queue)) console.log(`    ${String(n).padStart(4)}  ${r}`);
  console.log("\n  SKIP reasons:");
  for (const [r, n] of tally(plan.skip)) console.log(`    ${String(n).padStart(4)}  ${r}`);
  console.log("\n  RETIRE reasons:");
  for (const [r, n] of tally(plan.retire)) console.log(`    ${String(n).padStart(4)}  ${r}`);

  if (verbose) {
    const line = (label: string, rows: { symbol: string; reason: string }[]) => {
      console.log(`\n  ── ${label} ──`);
      for (const r of rows.sort((a, b) => a.symbol.localeCompare(b.symbol))) console.log(`    ${r.symbol.padEnd(10)} ${r.reason}`);
    };
    line("QUEUE", plan.queue);
    line("SKIP", plan.skip);
    line("RETIRE", plan.retire);
  }

  console.log("");
  await prisma.$disconnect();
}
void main();
