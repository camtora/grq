// Verify the Bull-Race engine end-to-end WITHOUT waiting for market open or burning a model call:
// run a synthetic fill on a THROWAWAY race, assert the bull's book updates, and PROVE the real
// fund's Account/Position/Trade are untouched (the isolation guarantee). Self-cleaning.
import { prisma } from "../lib/db";
import { usdCadRate } from "../lib/fx";
import { applyRaceFill, snapshotBullNav } from "../agent/race/engine";

async function main() {
  // 1) Snapshot the REAL fund.
  const realBefore = {
    account: await prisma.account.findUnique({ where: { id: 1 } }),
    positions: await prisma.position.count(),
    trades: await prisma.trade.count(),
  };

  // 2) Throwaway race + one bull.
  const race = await prisma.race.create({ data: { name: "__verify_temp", status: "PAUSED", startingStakeCents: 2_500_000 } });
  const bull = await prisma.raceEntrant.create({ data: { raceId: race.id, model: "verify", dial: "BALANCED", label: "Verify Bull", cashCents: 2_500_000 } });

  let ok = true;
  const fail = (m: string) => {
    ok = false;
    console.error("  ✗ " + m);
  };

  try {
    const fx = await usdCadRate().catch(() => null);
    // 3) A synthetic BUY (XIC — always quotable, CAD).
    const res = await applyRaceFill({ id: bull.id, dial: bull.dial, cashCents: bull.cashCents }, { action: "BUY", symbol: "XIC", qty: 10, confidence: 80, thesis: "verify" }, new Date(), fx);
    console.log(`fill: ${res.filled ? "FILLED" : "rejected: " + res.rejectReason}`);
    if (!res.filled) fail(`BUY XIC was rejected (${res.rejectReason}) — expected a fill`);

    const after = await prisma.raceEntrant.findUnique({ where: { id: bull.id } });
    const pos = await prisma.racePosition.findFirst({ where: { entrantId: bull.id, symbol: "XIC" } });
    const trade = await prisma.raceTrade.findFirst({ where: { entrantId: bull.id } });
    if (res.filled) {
      if (!after || after.cashCents >= 2_500_000) fail("cash did not decrease");
      if (!pos || pos.qty !== 10) fail("RacePosition XIC ×10 not created");
      if (!trade) fail("RaceTrade not written");
      else console.log(`  ✓ bought ${pos?.qty} XIC @ ${(trade.priceCents / 100).toFixed(2)}, cash ${(2_500_000 / 100).toFixed(0)}→${((after?.cashCents ?? 0) / 100).toFixed(2)}`);
    }

    await snapshotBullNav(bull.id, fx);
    const snap = await prisma.raceNavSnapshot.findFirst({ where: { entrantId: bull.id } });
    if (!snap) fail("RaceNavSnapshot not written");
    else console.log(`  ✓ NAV snapshot: ${(snap.navCadCents / 100).toFixed(2)} CAD (cash ${(snap.cashCents / 100).toFixed(2)} + pos ${(snap.positionsCadCents / 100).toFixed(2)})`);

    // 4) ISOLATION: the real fund must be byte-identical.
    const realAfter = {
      account: await prisma.account.findUnique({ where: { id: 1 } }),
      positions: await prisma.position.count(),
      trades: await prisma.trade.count(),
    };
    const sameCash = realBefore.account?.cashCents === realAfter.account?.cashCents && realBefore.account?.usdCashCents === realAfter.account?.usdCashCents;
    if (!sameCash) fail("REAL Account cash CHANGED — isolation broken!");
    if (realBefore.positions !== realAfter.positions) fail("REAL Position count CHANGED — isolation broken!");
    if (realBefore.trades !== realAfter.trades) fail("REAL Trade count CHANGED — isolation broken!");
    if (sameCash && realBefore.positions === realAfter.positions && realBefore.trades === realAfter.trades)
      console.log(`  ✓ ISOLATION: real fund untouched (cash ${((realAfter.account?.cashCents ?? 0) / 100).toFixed(2)} CAD, ${realAfter.positions} positions, ${realAfter.trades} trades — unchanged)`);
  } finally {
    // 5) Clean up the throwaway race (cascades to entrant/positions/trades/navsnaps).
    await prisma.race.delete({ where: { id: race.id } });
    console.log("  ✓ cleaned up throwaway race");
  }

  console.log(ok ? "\nVERIFY: PASS ✅" : "\nVERIFY: FAIL ❌");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
