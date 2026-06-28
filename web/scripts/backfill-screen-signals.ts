// One-time backfill of technical signals for the actionable (INTERESTING/WATCH) screened
// names (docs/MARKET-BASE-LAYER.md). Loops refreshScreenSignals (stale-first) until every
// actionable name has a signal. Gentle on Yahoo (refreshBars is 4-concurrent). Needs
// FMP_API_KEY not required, but bar fetches hit Yahoo — run off-hours.
//   cd web && npx tsx scripts/backfill-screen-signals.ts
import { prisma } from "../lib/db";
import { refreshScreenSignals } from "../lib/market-screen/signals";

(async () => {
  const start = Date.now();
  let total = 0;
  while (true) {
    const remaining = await prisma.marketScreen.count({ where: { tag: { in: ["INTERESTING", "WATCH"] }, signalAt: null } });
    if (remaining === 0) break;
    const { updated } = await refreshScreenSignals({ limit: 250 });
    if (updated === 0) break;
    total += updated;
    console.log(`[+${((Date.now() - start) / 60000).toFixed(1)}m] +${updated} (total ${total}; ~${remaining} were unsignaled)`);
  }
  console.log(`DONE — ${total} technical signals computed in ${((Date.now() - start) / 60000).toFixed(1)}m`);
  process.exit(0);
})();
