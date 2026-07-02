// One-off repair (D105): fix universe members whose bare US ticker was stored with a junk Canadian
// yahoo suffix (JPM→JPM.TO, V→V.V, …), so their quotes/bars stop resolving to a thin same-ticker
// look-alike (JPM.TO $42 vs the real NYSE JPM $334). Re-resolves every CA-suffixed member by
// LIQUIDITY (resolvePrimaryListing) and flips ONLY the ones that are actually US — legit dual-listed
// Canadian names (ENB.TO, SHOP.TO) keep their .TO because their listing is genuinely liquid.
// Dry-run by default; pass --apply to write. Held (ACTIVE) names are only REPORTED, never auto-touched
// (a held position's listing affects ACB/positions — handle those by hand). Run in the agent container:
//   docker exec grq-agent npx tsx scripts/fix-mislisted-candidates.ts [--apply]
import { prisma } from "../lib/db";
import { resolvePrimaryListing } from "../agent/promote";
import { invalidateUniverseCache } from "../lib/universe";
import { refreshBars } from "../lib/bars";
import { refreshQuotesFor } from "../lib/broker/quotes";

const APPLY = process.argv.includes("--apply");
const isCa = (y: string) => /\.(TO|V|NE|CN)$/i.test(y);

async function main() {
  const rows = await prisma.universeMember.findMany({
    where: { status: { not: "RETIRED" } },
    select: { symbol: true, yahoo: true, status: true },
  });
  const caSuffixed = rows.filter((r) => r.yahoo && isCa(r.yahoo));
  console.log(`[fix] ${caSuffixed.length} non-retired members have a CA-suffixed yahoo; re-resolving by liquidity…\n`);

  const flips: { symbol: string; old: string; neu: string; status: string }[] = [];
  for (const r of caSuffixed) {
    const res = await resolvePrimaryListing(r.symbol);
    if (!res) { console.log(`  ?  ${r.symbol.padEnd(8)} ${r.yahoo} — no quote on re-resolve, skipping`); continue; }
    if (res.yahoo === r.yahoo || isCa(res.yahoo)) continue; // resolution agrees it's CA (or same) → legit, leave it
    flips.push({ symbol: r.symbol, old: r.yahoo!, neu: res.yahoo, status: r.status });
    console.log(`  ✗  ${r.symbol.padEnd(8)} ${r.yahoo} → ${res.yahoo}  [${r.status}]  mis-listed US name`);
  }

  const active = flips.filter((f) => f.status === "ACTIVE");
  const fixable = flips.filter((f) => f.status !== "ACTIVE");
  console.log(`\n[fix] ${flips.length} mis-listed (${fixable.length} fixable non-held · ${active.length} ACTIVE → report only)`);
  if (active.length) console.log(`[fix] ⚠ ACTIVE mis-listed — handle by hand (positions/ACB): ${active.map((a) => a.symbol).join(", ")}`);

  if (!APPLY) { console.log(`\n[fix] DRY RUN — pass --apply to write. Would fix: ${fixable.map((f) => f.symbol).join(", ") || "(none)"}`); return; }

  for (const f of fixable) {
    await prisma.universeMember.update({ where: { symbol: f.symbol }, data: { yahoo: f.neu, currency: null } }); // US → null (inferred USD)
    await prisma.bar.deleteMany({ where: { symbol: f.symbol } });   // purge the junk history under the bare key…
    await prisma.quote.deleteMany({ where: { symbol: f.symbol } }); // …and the junk quote
  }
  invalidateUniverseCache();
  const syms = fixable.map((f) => f.symbol);
  if (syms.length) {
    await refreshBars(syms, "1y").catch(() => 0);      // refetch the REAL US listing (member.yahoo is now bare)
    await refreshQuotesFor(syms).catch(() => 0);
  }
  console.log(`\n[fix] APPLIED — fixed ${syms.length}: ${syms.join(", ")}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error("[fix] failed:", e); process.exit(1); });
