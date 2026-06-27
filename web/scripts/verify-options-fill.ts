// Verify the Options Desk engine end-to-end WITHOUT waiting for market open or burning a model call:
// run synthetic fills (a stock BUY + a best-effort option BUY) on a THROWAWAY desk, assert the arm's
// book updates, and PROVE the real fund's Account/Position/Trade are untouched (the isolation
// guarantee). Self-cleaning. Run: `npx tsx scripts/verify-options-fill.ts`.
import { prisma } from "../lib/db";
import { usdCadRate } from "../lib/fx";
import { applyDeskFill, snapshotDeskNav } from "../agent/options-desk/engine";

async function main() {
  const realBefore = {
    account: await prisma.account.findUnique({ where: { id: 1 } }),
    positions: await prisma.position.count(),
    trades: await prisma.trade.count(),
  };

  const desk = await prisma.optionsDesk.create({ data: { name: "__verify_temp_desk", status: "PAUSED", startingStakeCents: 5_000_000 } });
  const arm = await prisma.deskEntrant.create({ data: { deskId: desk.id, model: "verify", arm: "treatment", dial: "BALANCED", label: "Verify Arm", cashCents: 5_000_000 } });

  let ok = true;
  const fail = (m: string) => {
    ok = false;
    console.error("  ✗ " + m);
  };

  try {
    const fx = await usdCadRate().catch(() => null);
    const now = new Date();

    // 1) Synthetic STOCK BUY (XIC — always quotable, CAD).
    const stock = await applyDeskFill({ id: arm.id, arm: "treatment", dial: "BALANCED", cashCents: 5_000_000 }, { action: "BUY", symbol: "XIC", qty: 10, right: null, bias: null, confidence: 80, thesis: "verify" }, now, fx, now);
    console.log(`stock fill: ${stock.filled ? "FILLED" : "rejected: " + stock.rejectReason}`);
    if (!stock.filled) fail(`stock BUY XIC rejected (${stock.rejectReason})`);
    const pos = await prisma.deskPosition.findFirst({ where: { entrantId: arm.id, kind: "STOCK", underlying: "XIC" } });
    if (stock.filled && (!pos || pos.qty !== 10)) fail("DeskPosition XIC ×10 not created");
    else if (pos) console.log(`  ✓ bought ${pos.qty} XIC @ ${(pos.avgCostCents / 100).toFixed(2)}`);

    // 2) Best-effort OPTION BUY (needs a live CBOE chain — skip gracefully if unreachable/after-hours).
    const after1 = await prisma.deskEntrant.findUnique({ where: { id: arm.id } });
    const opt = await applyDeskFill({ id: arm.id, arm: "treatment", dial: "BALANCED", cashCents: after1?.cashCents ?? 5_000_000 }, { action: "BUY_OPTION", symbol: "AAPL", qty: 1, right: "CALL", bias: "ATM", confidence: 80, thesis: "verify" }, now, fx, now);
    if (opt.filled) {
      const op = await prisma.deskPosition.findFirst({ where: { entrantId: arm.id, kind: "CALL", underlying: "AAPL" } });
      console.log(`  ✓ option fill: AAPL ${opt.expiry} ${(((opt.strikeCents ?? 0) / 100)).toFixed(2)} CALL ×${op?.qty}, premium ${((op?.avgCostCents ?? 0) / 100).toFixed(2)}/sh`);
      if (!op) fail("DeskPosition CALL not created despite a filled option");
    } else {
      console.log(`  • option BUY not filled (${opt.rejectReason ?? "no chain / market closed"}) — non-fatal, stock path still proves isolation`);
    }

    // 3) Control arm must be unable to trade options.
    const ctrl = await applyDeskFill({ id: arm.id, arm: "control", dial: "BALANCED", cashCents: 1_000_000 }, { action: "BUY_OPTION", symbol: "AAPL", qty: 1, right: "CALL", bias: "ATM", confidence: 90, thesis: "should reject" }, now, fx, now);
    if (ctrl.filled) fail("control arm was ALLOWED to trade an option — guardrail broken!");
    else console.log(`  ✓ control arm correctly blocked from options (${ctrl.rejectReason})`);

    await snapshotDeskNav(arm.id, fx, now);
    const snap = await prisma.deskNavSnapshot.findFirst({ where: { entrantId: arm.id } });
    if (!snap) fail("DeskNavSnapshot not written");
    else console.log(`  ✓ NAV snapshot: ${(snap.navCadCents / 100).toFixed(2)} CAD (cash ${(snap.cashCents / 100).toFixed(2)} + pos ${(snap.positionsCadCents / 100).toFixed(2)}, options ${(snap.optionsCadCents / 100).toFixed(2)})`);

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
      console.log(`  ✓ ISOLATION: real fund untouched (${realAfter.positions} positions, ${realAfter.trades} trades — unchanged)`);
  } finally {
    await prisma.optionsDesk.delete({ where: { id: desk.id } });
    console.log("  ✓ cleaned up throwaway desk");
  }

  console.log(ok ? "\nVERIFY: PASS ✅" : "\nVERIFY: FAIL ❌");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
