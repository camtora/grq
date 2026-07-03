// One-off (follow-up to D105): reconcile the IDENTITY of universe candidates whose `yahoo` is a
// bare US ticker but whose `name`/`exchange`/`currency` still show a stale CDR or CA look-alike.
//
// D105's repair (fix-mislisted-candidates.ts) flipped `yahoo`+`currency` to the liquid US listing
// but NEVER touched `name`/`exchange`, so ~38 candidates were left half-migrated: WFC priced as
// Wells Fargo but named "WALL FINANCIAL"; "ABBOTT LABS CDR (CAD HEDGED)" priced as US Abbott; etc.
// (backfillFundamentals refreshes everything EXCEPT the name, so it never healed these.)
//
// Cam confirmed (2026-07-03): make them the REAL US stocks, not the CAD-hedged CDRs. For each
// target we pull the US profile by its bare `yahoo` and overwrite name/exchange/currency/sector/
// industry/country/marketCap, then refetch bars+quotes so any stale look-alike history is replaced.
//
// Targets = non-retired members whose yahoo is BARE (no CA suffix) AND (currency is null/empty OR
// the name still says CDR / CAD HEDGED). A CA-suffixed yahoo (BQE.V, SPCX.TO) is a genuine CA
// listing and is left alone; SPCX (SpaceX — private, no US stock) is excluded by the filter.
//
// CANDIDATE only, none held → safe. Dry-run by default; pass --apply to write.
//   docker cp web/scripts/reconcile-us-identities.ts grq-agent:/app/scripts/
//   docker exec grq-agent npx tsx scripts/reconcile-us-identities.ts [--apply]
import { prisma } from "../lib/db";
import { fmpProfile, fmpEnabled } from "../lib/fmp";
import { invalidateUniverseCache } from "../lib/universe";
import { refreshBars } from "../lib/bars";
import { refreshQuotesFor } from "../lib/broker/quotes";

const APPLY = process.argv.includes("--apply");
const isCa = (y: string | null) => !!y && /\.(TO|V|NE|CN)$/i.test(y);

async function main() {
  if (!fmpEnabled()) {
    console.error("[reconcile] FMP_API_KEY required — run in the agent container.");
    process.exit(1);
  }
  const rows = await prisma.universeMember.findMany({
    where: {
      status: { not: "RETIRED" },
      OR: [{ currency: null }, { currency: "" }, { name: { contains: "CDR" } }, { name: { contains: "CAD HEDGED" } }],
    },
  });
  // Bare-yahoo only — a CA-suffixed yahoo is a genuine CA listing; leave it.
  const targets = rows.filter((r) => !isCa(r.yahoo));
  console.log(`[reconcile] ${targets.length} candidate(s) to reconcile to their US identity${APPLY ? " (APPLY)" : " (dry run)"}\n`);

  const changed: string[] = [];
  for (const m of targets) {
    const p = await fmpProfile(m.yahoo).catch(() => null);
    if (!p || !p.companyName) {
      console.log(`  ?   ${m.symbol.padEnd(6)} ${m.yahoo} — no profile, skipping`);
      continue;
    }
    const renamed = (m.name ?? "").trim() !== p.companyName.trim();
    console.log(`  ${renamed ? "✎" : "·"}   ${m.symbol.padEnd(6)} "${m.name}"  →  "${p.companyName}"  [${p.exchange || "?"} · ${p.currency || "?"}]`);
    if (!APPLY) continue;
    await prisma.universeMember.update({
      where: { symbol: m.symbol },
      data: {
        name: p.companyName,
        sector: p.sector,
        industry: p.industry,
        country: p.country,
        currency: p.currency || null,
        exchange: p.exchange || null,
        marketCapM: p.marketCap > 0 ? Math.round(p.marketCap / 1_000_000) : null,
        fmpAt: new Date(),
      },
    });
    changed.push(m.symbol);
  }

  if (!APPLY) {
    console.log(`\n[reconcile] DRY RUN — pass --apply to write.`);
    return;
  }
  invalidateUniverseCache();
  // Replace any stale look-alike history under these keys with the real US listing's data.
  await prisma.bar.deleteMany({ where: { symbol: { in: changed } } }).catch(() => 0);
  await prisma.quote.deleteMany({ where: { symbol: { in: changed } } }).catch(() => 0);
  await refreshBars(changed, "1y").catch(() => 0);
  await refreshQuotesFor(changed).catch(() => 0);
  console.log(`\n[reconcile] APPLIED — reconciled ${changed.length}: ${changed.join(", ")}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[reconcile] failed:", e);
    process.exit(1);
  });
