// On-demand integrity audit of the running experiments (Bull-Race books). Read-only.
//   host: cd web && npx tsx scripts/verify-experiments.ts
// (scripts/ is not shipped in the agent image — the nightly run uses lib/race/verify.ts directly.)
// Exits non-zero if any hard violation is found, so it can gate CI / a pre-deploy check.
import { verifyExperiments } from "../lib/race/verify";

async function main() {
  const r = await verifyExperiments();
  for (const i of r.info) console.log("ℹ ", i);
  for (const w of r.warnings) console.warn("⚠ ", w);
  for (const v of r.violations) console.error("✖ ", v);
  console.log(r.ok ? "✓ experiments OK" : `✖ ${r.violations.length} violation(s)`);
  process.exit(r.ok ? 0 : 1);
}

main();
