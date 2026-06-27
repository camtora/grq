// Tier-1 full tagging pass (docs/MARKET-BASE-LAYER.md). Walks the whole screened
// market in score order, Canada first (most edge / least coverage), then US. Loops
// tagBatch until every name is tagged. Resumable — only touches taggedAt=null rows,
// so a re-run picks up where it stopped. Needs FMP_API_KEY + CLAUDE_CODE_OAUTH_TOKEN.
//   cd web && npx tsx scripts/tag-market-all.ts
import { tagBatch } from "../lib/market-screen/tag";

const PHASES: { label: string; exchanges: string[] }[] = [
  { label: "Canada (TSX+TSXV+NEO)", exchanges: ["TSX", "TSXV", "NEO"] },
  { label: "US (NASDAQ+NYSE+AMEX)", exchanges: ["NASDAQ", "NYSE", "AMEX"] },
];
const BATCH = 40;

(async () => {
  const start = Date.now();
  let total = 0;
  for (const phase of PHASES) {
    let phaseTotal = 0;
    while (true) {
      const r = await tagBatch(BATCH, { exchanges: phase.exchanges });
      if (r.tagged === 0) break;
      total += r.tagged;
      phaseTotal += r.tagged;
      const mins = ((Date.now() - start) / 60000).toFixed(1);
      console.log(`[+${mins}m] ${phase.label}: +${r.tagged} (phase ${phaseTotal}, total ${total})`);
    }
    console.log(`=== ${phase.label} complete — ${phaseTotal} tagged ===`);
  }
  console.log(`DONE — ${total} names tagged in ${((Date.now() - start) / 60000).toFixed(1)}m`);
  process.exit(0);
})();
