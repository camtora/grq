// D140 display round 5 one-off (2026-10-23): resolve each name's SEC twin (its own US listing, or a CA
// name's cross-listing, CIK-checked), then pull ~13 months of its open-market insider trades and, for a
// newly-found CA twin, a year of filings. FMP only — never Claude. Idempotent: re-run any time.
//   npx tsx scripts/financials-sec-backfill.ts
import { prisma } from "../lib/db";
import { financialsTargets, refreshName, refreshInsider, refreshProfile } from "../lib/financials/store";
import { etDateStr } from "../agent/calendar";

async function main() {
  const today = etDateStr();
  const targets = await financialsTargets();
  console.log(`${targets.length} names`);
  // Directly, not via refreshName: every profile is fresh (weekly), so the due rule would skip them all.
  for (const t of targets) await refreshProfile(t.key).catch((e) => console.error(t.key, e.message));
  const sec = await prisma.financialsStatus.findMany({ where: { secSymbol: { not: null }, isEtf: false, isFund: false } });
  const ca = sec.filter((s) => s.secSymbol !== s.symbol);
  console.log(`${sec.length} file with the SEC (${ca.length} through a US cross-listing: ${ca.map((s) => `${s.symbol}→${s.secSymbol}`).join(" ")})`);
  let trades = 0;
  for (const s of sec) trades += await refreshInsider(s.symbol, s.secSymbol!, s.secCik!, today, true).catch((e) => (console.error(s.symbol, e.message), 0));
  console.log(`${trades} insider trades stored/confirmed`);
  for (const s of ca) await refreshName(s.symbol, true, { only: ["filings"] }).catch((e) => console.error(s.symbol, e.message));
  await prisma.$disconnect();
}
main();
