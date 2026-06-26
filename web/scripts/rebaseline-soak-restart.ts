// One-off: re-baseline the fund's contributions for the 2026-06-26 SOAK RESTART
// (Cam 2026-06-26). A member balance-reset the IBKR paper account at noon ET,
// re-provisioning it to a clean US$50,000 (see the reset gotcha + DECISIONS).
// reconcile() mirrored the new cash/positions, but it does NOT touch contributions —
// so the old launch baseline (CA$25k + US$25k = CA$60,585, anchored to XIC 5570 on
// 2026-06-25) was left in place. That made the US$50k reset capital read as ~+CA$10.5k
// of PHANTOM P&L, and — because PAPER_INCEPTION is today, so there's no pre-today NAV
// snapshot to use as the day-open — the Today page fell back to the stale contributions
// figure as "day open" and showed a fake ~+17% day, claiming GRQ was "ahead of every
// market." Same failure mode the relaunch-contributions.ts script fixed one reset ago.
//
// This wipes the stale launch contributions and records the restart capital as the
// account actually holds it post-reset: a US$50,000 USD sleeve (in CAD-equiv at today's
// fx, since the Contribution model + benchmark are CAD-denominated) plus the CA$79.61
// CAD cash residual — both anchored to TODAY's XIC mid so the "vs just buying the TSX"
// benchmark restarts from today. After this, total contributions ≈ the reset-day NAV,
// so totalPnl reads ~0 and tracks only real gains since the restart, and the Today-page
// day-vs-all-markets strip reads honestly.
//
// RUN (paper balances already reset + reconciled):
//   cd web && npx tsx scripts/rebaseline-soak-restart.ts
import { prisma } from "../lib/db";
import { usdCadRate } from "../lib/fx";

const USD_SLEEVE_CENTS = 5_000_000; // US$50,000 native — the soak-restart funding
const CAD_RESIDUAL_CENTS = 7_961; //  CA$79.61 — leftover CAD cash mirrored at the reset

async function main() {
  const fx = (await usdCadRate()) ?? 1.42;
  const xic = await prisma.quote.findUnique({ where: { symbol: "XIC" } });
  const xicMid = xic?.midCents ?? null;
  if (!xicMid) throw new Error("No XIC quote in DB — can't anchor the benchmark. Refresh quotes first.");
  const usdAsCad = Math.round(USD_SLEEVE_CENTS * fx);

  const before = await prisma.contribution.aggregate({ _sum: { amountCents: true } });

  await prisma.contribution.deleteMany({});
  await prisma.contribution.create({
    data: {
      amountCents: usdAsCad,
      contributor: "Cam",
      xicPriceCents: xicMid,
      note: `Soak restart baseline — US$50,000 ≈ CA$${(usdAsCad / 100).toFixed(0)} @ fx ${fx.toFixed(4)} (2026-06-26 noon-ET paper reset)`,
    },
  });
  await prisma.contribution.create({
    data: {
      amountCents: CAD_RESIDUAL_CENTS,
      contributor: "Cam",
      xicPriceCents: xicMid,
      note: "Soak restart — CA$79.61 CAD cash residual at the reset",
    },
  });

  const after = await prisma.contribution.aggregate({ _sum: { amountCents: true } });
  const total = after._sum.amountCents ?? 0;
  console.log(
    `Contributions re-baselined for the soak restart:\n` +
      `  before: CA$${((before._sum.amountCents ?? 0) / 100).toFixed(2)} (stale launch baseline, XIC 5570)\n` +
      `  after:  CA$${(total / 100).toFixed(2)}  = US$50,000 ≈ CA$${(usdAsCad / 100).toFixed(2)} + CA$${(CAD_RESIDUAL_CENTS / 100).toFixed(2)} residual\n` +
      `  XIC benchmark re-anchored to ${xicMid} (today) · fx ${fx.toFixed(4)}\n` +
      `  NAV history kept (chart already filters to PAPER_INCEPTION).`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
