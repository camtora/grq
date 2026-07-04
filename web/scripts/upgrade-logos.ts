/**
 * One-time logo upgrade (Cam 2026-07-04): re-key every UniverseMember's logo to
 * FMP's ticker-keyed artwork where FMP has one — fixes the Clearbit name-lookup
 * misses (TSM, AMD sat on monograms) AND upgrades the low-res DuckDuckGo favicons.
 * Names FMP lacks keep whatever they had (favicon, or "" → monogram). Idempotent;
 * safe to re-run. Host-side from web/ (reads web/.env for the DB):
 *
 *   npx tsx scripts/upgrade-logos.ts
 */
import "dotenv/config";
import { prisma } from "../lib/db";
import { fmpLogo, fmpLogoExists } from "../lib/logos";

const CONCURRENCY = 6;

async function main() {
  const rows = await prisma.universeMember.findMany({
    select: { symbol: true, yahoo: true, logoUrl: true },
  });
  let upgraded = 0;
  let missKept = 0;
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const batch = rows.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (r) => {
        const ticker = (r.yahoo || r.symbol).trim();
        const url = fmpLogo(ticker);
        if (r.logoUrl === url) return; // already on FMP artwork
        if (await fmpLogoExists(ticker)) {
          await prisma.universeMember.update({ where: { symbol: r.symbol }, data: { logoUrl: url } });
          upgraded++;
          console.log(`  ✓ ${r.symbol} → ${ticker}.png`);
        } else if (!r.logoUrl) {
          missKept++; // still nothing anywhere — monogram remains
        }
      }),
    );
  }
  console.log(`\n${rows.length} names · ${upgraded} upgraded to FMP artwork · ${missKept} still logo-less (monogram)`);
}

main().then(() => process.exit(0));
