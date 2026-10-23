// D140 round 2 — how the Financial-health checklist grades spread across every name we hold statements for.
// A sanity check on the thresholds in derive.healthChecks: a check that's red for half the market is
// miscalibrated, one that's never red says nothing. Read-only.  npx tsx scripts/health-grade-spread.ts
import { prisma } from "../lib/db";
import { getPeriods, splitsOf } from "../lib/financials/store";
import { headline, healthFacts, healthChecks } from "../lib/financials/derive";

async function main() {
  const names = await prisma.financialsStatus.findMany({ where: { isEtf: false, isFund: false, statementsCovered: true } });
  const tally: Record<string, Record<string, number>> = {};
  const reds: Record<string, string[]> = {};
  for (const st of names) {
    const rows = await getPeriods(st.symbol);
    const h = headline(rows, { sector: st.sector, industry: st.industry, splits: splitsOf(st) });
    const f = healthFacts(rows, st.sector, st.industry);
    if (!h || !f) continue;
    for (const c of healthChecks(f, { roeBps: h.roeBps, netIncomeYoY: h.netIncomeYoY, shareChangeYoY: h.shareChangeYoY })) {
      (tally[c.key] ??= { good: 0, ok: 0, bad: 0 })[c.tone]++;
      if (c.tone === "bad") (reds[c.key] ??= []).push(st.symbol);
    }
  }
  console.log(`${names.length} names`);
  for (const [k, t] of Object.entries(tally)) {
    const n = t.good + t.ok + t.bad;
    console.log(`${k.padEnd(9)} n=${String(n).padStart(3)}  green ${t.good}  amber ${t.ok}  red ${t.bad} (${Math.round((100 * t.bad) / n)}%)  e.g. ${(reds[k] ?? []).slice(0, 8).join(" ")}`);
  }
  await prisma.$disconnect();
}
main();
