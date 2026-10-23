// D140 one-off (2026-10-23): re-fetch the profiles that the throttled first backfill wrote empty
// (102 names with no company name or sector). The daily job now re-asks these on its own (dueFeeds);
// this just does it today. FMP only — never Claude.  npx tsx scripts/financials-profile-heal.ts
import { prisma } from "../lib/db";
import { refreshName } from "../lib/financials/store";

async function main() {
  const bad = await prisma.financialsStatus.findMany({ where: { companyName: null }, select: { symbol: true } });
  console.log(`${bad.length} names without a profile`);
  for (const { symbol } of bad) await refreshName(symbol, false, { only: ["profile"] });
  const left = await prisma.financialsStatus.count({ where: { companyName: null } });
  const sectorless = await prisma.financialsStatus.count({ where: { sector: null, isEtf: false, isFund: false } });
  console.log(`still without a profile: ${left}; companies without a sector: ${sectorless}`);
  await prisma.$disconnect();
}
main();
