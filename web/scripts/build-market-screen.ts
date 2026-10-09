// Tier-0 market screen — manual populate (docs/MARKET-BASE-LAYER.md).
// Until the nightly runner hook lands, run by hand:
//   cd web && npx tsx scripts/build-market-screen.ts
import { runMarketScreen } from "../lib/market-screen/screen";

(async () => {
  const t = Date.now();
  const r = await runMarketScreen();
  console.log(`market screen: scanned ${r.scanned} listings → kept ${r.kept} screened companies in ${((Date.now() - t) / 1000).toFixed(1)}s`);
  for (const f of r.failed) console.error(`  NOT SCREENED: ${f.exchange} — ${f.reason}`);
  process.exit(0);
})();
