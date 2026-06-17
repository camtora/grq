// One-off Smart Money ingest + spot-check (D27).
//   FMP_API_KEY=… npx tsx scripts/ingest-smart-money.ts
// Pulls FMP (13F / congress / insider) + OpenInsider into the cache tables, then
// prints a summary so we can confirm rows landed (incl. Aschenbrenner's puts).
import { runSmartMoneyIngest } from "../lib/smart-money/ingest";
import {
  getPortfolios,
  getCongressLeaderboard,
  getInsiderTopBuys,
  getFundsPilingIn,
} from "../lib/smart-money/queries";

async function main() {
  console.log("Running Smart Money ingest (forcePortfolios=true)…");
  const res = await runSmartMoneyIngest({ forcePortfolios: true });
  console.log("ingest:", JSON.stringify(res));

  const ports = await getPortfolios();
  console.log(`\n${ports.length} portfolios:`);
  for (const p of ports) {
    console.log(`  ${p.name} — ${p.firm} · ${p.asOf} · $${(p.totalValueUsd / 1e9).toFixed(1)}B · ${p.holdingsCount} holdings · puts=${p.hasPuts}`);
    for (const h of p.topHoldings.slice(0, 4)) {
      console.log(`      ${h.symbol.padEnd(6)} ${(h.putCall ?? "").padEnd(4)} ${(h.pctOfPort * 100).toFixed(1)}% ${h.action}`);
    }
  }

  const congress = await getCongressLeaderboard(90, 5);
  console.log("\nCongress most-bought (90d):");
  for (const c of congress) console.log(`  ${c.symbol.padEnd(6)} ${c.buyers} members · ${c.trades} trades · ${c.assetName}`);

  const piling = await getFundsPilingIn(5);
  console.log("\nFunds piling in:");
  for (const f of piling) console.log(`  ${f.symbol.padEnd(6)} ${f.funds} funds (${f.fundNames.join(", ")})`);

  const insiders = await getInsiderTopBuys(14, 6);
  console.log("\nTop insider buys (14d):");
  for (const t of insiders) console.log(`  ${t.symbol.padEnd(6)} $${(t.valueUsd / 1e6).toFixed(2)}M · ${t.insiderName} (${t.insiderTitle ?? "?"}) · ${t.source}`);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
