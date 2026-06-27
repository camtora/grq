// Tier-1 Haiku light-tag — manual run (docs/MARKET-BASE-LAYER.md).
// Tags the next N highest-score UNTAGGED screened names. Needs FMP_API_KEY +
// CLAUDE_CODE_OAUTH_TOKEN in the env (sourced from the root .env).
//   cd web && npx tsx scripts/tag-market.ts [N]   (default 40)
import { tagBatch } from "../lib/market-screen/tag";

const n = parseInt(process.argv[2] ?? "40", 10);

(async () => {
  const t = Date.now();
  const r = await tagBatch(Number.isFinite(n) ? n : 40);
  console.log(`market-tag: tagged ${r.tagged} names in ${((Date.now() - t) / 1000).toFixed(1)}s`);
  process.exit(0);
})();
