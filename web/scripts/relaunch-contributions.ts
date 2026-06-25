// One-off: re-baseline the fund's contributions for the "actual trading" launch
// (Cam 2026-06-25). The fund is being funded to CA$25k + US$25k (positions kept) by
// resetting the IBKR paper balances; reconcile() mirrors the cash, but it does NOT
// touch contributions — so without this, the new capital reads as phantom P&L.
//
// This wipes the old inception contribution and records the launch capital as two
// rows (CAD sleeve + USD sleeve, the latter in CAD-equiv at today's fx since the
// Contribution model + benchmark are CAD-denominated), both anchored to today's XIC
// mid so the "vs just buying XIC" benchmark starts fresh at launch.
//
// RUN AFTER the IBKR balances are reset and reconcile has mirrored them:
//   cd web && npx tsx scripts/relaunch-contributions.ts
import { prisma } from "../lib/db";
import { usdCadRate } from "../lib/fx";

const CAD_CONTRIB_CENTS = 2_500_000; // CA$25,000
const USD_CONTRIB_CENTS = 2_500_000; // US$25,000 (native)
const CLEAR_NAV_HISTORY = false; // set true to also wipe pre-launch NavSnapshots so the chart starts at launch

async function main() {
  const fx = (await usdCadRate()) ?? 1.37;
  const xic = await prisma.quote.findUnique({ where: { symbol: "XIC" } });
  const xicMid = xic?.midCents ?? null;
  if (!xicMid) throw new Error("No XIC quote in DB — can't anchor the benchmark. Refresh quotes first.");
  const usdAsCad = Math.round(USD_CONTRIB_CENTS * fx);

  await prisma.contribution.deleteMany({});
  await prisma.contribution.create({
    data: { amountCents: CAD_CONTRIB_CENTS, contributor: "Cam", xicPriceCents: xicMid, note: "Launch baseline — CAD sleeve CA$25,000 (actual-trading start 2026-06-25)" },
  });
  await prisma.contribution.create({
    data: { amountCents: usdAsCad, contributor: "Cam", xicPriceCents: xicMid, note: `Launch baseline — USD sleeve US$25,000 ≈ CA$${(usdAsCad / 100).toFixed(0)} @ fx ${fx.toFixed(4)} (actual-trading start 2026-06-25)` },
  });
  if (CLEAR_NAV_HISTORY) await prisma.navSnapshot.deleteMany({});

  const sum = await prisma.contribution.aggregate({ _sum: { amountCents: true } });
  console.log(
    `Contributions re-baselined: CA$25,000 + US$25,000 (≈CA$${(usdAsCad / 100).toFixed(0)}) @ XIC ${xicMid} / fx ${fx.toFixed(4)} → total contributions CA$${((sum._sum.amountCents ?? 0) / 100).toFixed(2)}.` +
      (CLEAR_NAV_HISTORY ? " NAV history cleared." : " NAV history kept."),
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
