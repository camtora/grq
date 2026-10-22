// D140 — fill the company-financials tables from the host, without an agent rebuild.
//   cd web && set -a && . ../.env && set +a && DATABASE_URL=$(grep ^DATABASE_URL .env | cut -d= -f2-) \
//     npx tsx scripts/financials-backfill.ts [--all | KEY ...]
// KEY is the FMP key = the listing symbol (NVDA, RY.TO). Idempotent: names already fresh are skipped
// feed by feed (FinancialsStatus), so it can be re-run or interrupted freely.
import { prisma } from "../lib/db";
import { financialsTargets, refreshName, runFinancialsRefresh, getPeriods, getStatus, splitsOf } from "../lib/financials/store";
import { headline } from "../lib/financials/derive";

const fmtM = (v: bigint | null) => (v == null ? "—" : `${(Number(v) / 100 / 1e6).toFixed(0)}M`);
const fmtG = (g: { kind: string; bps?: number } | null) => (g == null ? "—" : g.kind === "ok" ? `${((g.bps ?? 0) / 100).toFixed(1)}%` : "n/m");

async function main() {
  const args = process.argv.slice(2);
  const t0 = Date.now();
  let keys: string[];
  if (args.includes("--all")) {
    const r = await runFinancialsRefresh(3);
    console.log(`all tracked: ${r.names} names touched, ${r.calls} feed refreshes, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    keys = [];
  } else {
    const deep = new Map((await financialsTargets()).map((t) => [t.key, t.deep]));
    keys = args.map((a) => a.toUpperCase());
    for (const k of keys) {
      const due = await refreshName(k, deep.get(k) ?? true);
      console.log(`${k}: refreshed ${due.join(", ") || "(nothing due)"}`);
    }
  }
  for (const k of keys) {
    const st = await getStatus(k);
    const h = headline(await getPeriods(k), { sector: st?.sector, splits: splitsOf(st) });
    console.log(
      h
        ? `  ${k} ${h.label} ${h.currency} | rev TTM ${fmtM(h.revenueTtm)} YoY ${fmtG(h.revenueYoY)} accel ${h.revenueAccelBps ?? "—"}bps | EPS YoY ${fmtG(h.epsYoY)} | op margin ${h.operatingMarginBps ?? "—"} | FCF TTM ${fmtM(h.fcfTtm)} | shares ${fmtG(h.shareChangeYoY)} | ${st?.sector ?? "?"}`
        : `  ${k}: no quarters (etf=${st?.isEtf} fund=${st?.isFund} covered=${st?.statementsCovered})`,
    );
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
