// One-off remediation (D105): the 39 mis-listed US tickers were traded by the PAPER experiments at
// junk prices; the price correction now marks them real → phantom P&L. Surgically VOID only those
// trades/positions per book (refund each model's net cash so its NAV returns to a clean, junk-free
// state), delete the contaminated Report Card entries, void the junk short, and purge the post-fix
// phantom NAV snapshots for the affected books (they re-snapshot clean next tick). The real fund never
// traded these and is untouched. Dry-run by default (prints per-book math + flags any book that would
// go cash-negative — a redeployed phantom windfall → would need a reset). --apply to write.
//   docker exec grq-agent npx tsx scripts/scrub-mislisted-experiments.ts [--apply]
import { prisma } from "../lib/db";

const APPLY = process.argv.includes("--apply");
const SYMS = ["AVGO","V","VRT","MA","COR","WMT","LLY","GEV","RTX","MS","UNH","LMT","WDC","XOM","WM","AZO","NOC","PANW","ELV","CRWD","BSX","NKE","ISRG","PEP","ABT","HON","ABBV","JPM","TMO","ICE","CVX","MRK","PG","UNP","WFC","CVS","PFE","CNC","HCA"];
const FIX_TS = new Date("2026-07-02T18:48:00"); // corrected quotes landed here → NAV snapshots after are phantom
const d = (c: number) => (c / 100).toFixed(2);
// Long cash-out: BUY removes qty*price+comm from cash; SELL adds qty*price-comm. Refund = undo that.
const longCashOut = (t: { side: string; qty: number; priceCents: number; commissionCents: number }) =>
  /SELL/i.test(t.side) ? -(t.qty * t.priceCents - t.commissionCents) : t.qty * t.priceCents + t.commissionCents;

async function main() {
  const preds = await prisma.prediction.findMany({ where: { symbol: { in: SYMS } }, select: { symbol: true } });
  console.log(`\n[Report Card]  delete ${preds.length} contaminated predictions (${new Set(preds.map((p) => p.symbol)).size} names)`);

  // Race
  const rTrades = await prisma.raceTrade.findMany({ where: { symbol: { in: SYMS } } });
  const rRefund = new Map<number, number>();
  for (const t of rTrades) rRefund.set(t.entrantId, (rRefund.get(t.entrantId) ?? 0) + longCashOut(t));
  const raceIds = new Set<number>();
  let raceNeg = 0;
  console.log(`\n[Race]  ${rTrades.length} trades across ${rRefund.size} entrants:`);
  for (const [eid, refund] of rRefund) {
    const e = await prisma.raceEntrant.findUnique({ where: { id: eid }, select: { label: true, cashCents: true, raceId: true } });
    if (e) raceIds.add(e.raceId);
    const after = (e?.cashCents ?? 0) + refund;
    if (after < 0) raceNeg++;
    console.log(`   e${eid} race${e?.raceId} ${e?.label?.padEnd(22)} ${d(e?.cashCents ?? 0)} + ${d(refund)} = ${d(after)}${after < 0 ? " ⚠ NEG" : ""}`);
  }

  // Desk
  const dTrades = await prisma.deskTrade.findMany({ where: { underlying: { in: SYMS } } });
  const dRefund = new Map<number, number>();
  for (const t of dTrades) dRefund.set(t.entrantId, (dRefund.get(t.entrantId) ?? 0) + longCashOut(t));
  const deskIds = new Set<number>();
  let deskNeg = 0;
  console.log(`\n[Options Desk]  ${dTrades.length} trades across ${dRefund.size} entrant(s):`);
  for (const [eid, refund] of dRefund) {
    const e = await prisma.deskEntrant.findUnique({ where: { id: eid }, select: { label: true, cashCents: true, deskId: true } });
    if (e) deskIds.add(e.deskId);
    const after = (e?.cashCents ?? 0) + refund;
    if (after < 0) deskNeg++;
    console.log(`   e${eid} desk${e?.deskId} ${e?.label?.padEnd(24)} ${d(e?.cashCents ?? 0)} + ${d(refund)} = ${d(after)}${after < 0 ? " ⚠ NEG" : ""}`);
  }

  // Short Lab
  const sTrades = await prisma.shortTrade.findMany({ where: { symbol: { in: SYMS } } });
  const sAdj = new Map<number, number>();
  for (const t of sTrades) sAdj.set(t.labId, (sAdj.get(t.labId) ?? 0) + (/OPEN/i.test(t.side) ? -(t.qty * t.priceCents) : t.qty * t.priceCents));
  console.log(`\n[Short Lab]  ${sTrades.length} trade(s):`);
  for (const [lid, adj] of sAdj) {
    const l = await prisma.shortLab.findUnique({ where: { id: lid }, select: { name: true, cashCents: true } });
    console.log(`   lab${lid} ${l?.name} ${d(l?.cashCents ?? 0)} + ${d(adj)} = ${d((l?.cashCents ?? 0) + adj)}`);
  }

  if (raceNeg || deskNeg) { console.log(`\n[abort] ${raceNeg + deskNeg} book(s) go cash-negative — needs a reset decision, not a scrub. No writes.`); return; }
  if (!APPLY) { console.log("\n[scrub] DRY RUN — no writes. All books scrub cleanly (no negatives). Pass --apply to write."); return; }

  await prisma.$transaction(async (tx) => {
    await tx.prediction.deleteMany({ where: { symbol: { in: SYMS } } });

    for (const [eid, refund] of rRefund) await tx.raceEntrant.update({ where: { id: eid }, data: { cashCents: { increment: refund } } });
    await tx.raceTrade.deleteMany({ where: { symbol: { in: SYMS } } });
    await tx.racePosition.deleteMany({ where: { symbol: { in: SYMS } } });
    if (raceIds.size) {
      const ents = await tx.raceEntrant.findMany({ where: { raceId: { in: [...raceIds] } }, select: { id: true } });
      await tx.raceNavSnapshot.deleteMany({ where: { entrantId: { in: ents.map((e) => e.id) }, at: { gt: FIX_TS } } });
    }

    for (const [eid, refund] of dRefund) await tx.deskEntrant.update({ where: { id: eid }, data: { cashCents: { increment: refund } } });
    await tx.deskTrade.deleteMany({ where: { underlying: { in: SYMS } } });
    await tx.deskPosition.deleteMany({ where: { underlying: { in: SYMS } } });
    if (deskIds.size) {
      const ents = await tx.deskEntrant.findMany({ where: { deskId: { in: [...deskIds] } }, select: { id: true } });
      await tx.deskNavSnapshot.deleteMany({ where: { entrantId: { in: ents.map((e) => e.id) }, at: { gt: FIX_TS } } });
    }

    for (const [lid, adj] of sAdj) await tx.shortLab.update({ where: { id: lid }, data: { cashCents: { increment: adj } } });
    await tx.shortTrade.deleteMany({ where: { symbol: { in: SYMS } } });
    await tx.shortPosition.deleteMany({ where: { symbol: { in: SYMS } } });
    if (sAdj.size) await tx.shortLabSnapshot.deleteMany({ where: { labId: { in: [...sAdj.keys()] }, at: { gt: FIX_TS } } });
  }, { timeout: 30_000 });

  console.log(`\n[scrub] APPLIED — voided junk trades/positions across Race(${raceIds.size} book·${rRefund.size} entrants), Desk(${dRefund.size}), Short(${sAdj.size}); deleted ${preds.length} predictions; purged post-fix phantom NAV snapshots.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error("[scrub] failed:", e); process.exit(1); });
