// Re-baseline the fund's contributions after a paper-account reset (D138, Mon 2026-10-26 — the
// successor of rebaseline-soak-restart.ts, which hard-coded June's US$50,000 + C$79.61).
//
// reconcile() mirrors the broker's cash and positions but NEVER writes Contribution, so after a
// portal balance reset + re-fund the new capital reads as phantom P&L and the Today page's
// day-open falls back to the stale contributions figure (the June 26 incident). This wipes the old
// launch baseline and records the restart capital AS THE ACCOUNT ACTUALLY HOLDS IT — the mirror's
// USD cash (in CAD-equivalent at today's rate, since Contribution + the benchmark are CAD) plus the
// mirror's CAD cash — both anchored to today's XIC mid so "vs just buying the TSX" restarts today.
//
// Refuses to run while any position is still held (the book must be flat and the re-fund done),
// and warns when the USD cash is far from the launch size. Dry by default.
//
// RUN (after the member-approved FX on day 1, before the first session):
//   cd web && npx tsx scripts/rebaseline-reset.ts            # shows what it would write
//   cd web && npx tsx scripts/rebaseline-reset.ts --apply    # writes it
//   options: --expect-usd 50000 (default) · --label "Run 3 — 2026-10-26"
import { prisma } from "../lib/db";
import { usdCadRate } from "../lib/fx";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const opt = (k: string, d: string) => {
  const i = args.indexOf(k);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const EXPECT_USD = Math.round(Number(opt("--expect-usd", "50000")) * 100);
const LABEL = opt("--label", `Run 3 — ${new Date().toISOString().slice(0, 10)}`);

async function main() {
  const held = await prisma.position.count({ where: { qty: { not: 0 } } });
  if (held > 0) throw new Error(`${held} position(s) still held — the book must be flat (and the re-fund done) before re-baselining.`);
  const account = await prisma.account.findUnique({ where: { id: 1 } });
  if (!account) throw new Error("No Account mirror row — run a reconcile first.");
  const usdCents = account.usdCashCents ?? 0;
  const cadCents = account.cashCents ?? 0;
  const fx = (await usdCadRate()) ?? 1.39;
  const xic = await prisma.quote.findUnique({ where: { symbol: "XIC" } });
  const xicMid = xic?.midCents ?? null;
  if (!xicMid) throw new Error("No XIC quote in DB — can't anchor the benchmark. Refresh quotes first.");
  const usdAsCad = Math.round(usdCents * fx);
  const before = (await prisma.contribution.aggregate({ _sum: { amountCents: true } }))._sum.amountCents ?? 0;
  const drift = EXPECT_USD > 0 ? Math.abs(usdCents - EXPECT_USD) / EXPECT_USD : 0;

  console.log(
    `${APPLY ? "APPLYING" : "DRY RUN"} — ${LABEL}\n` +
      `  mirror cash: US$${(usdCents / 100).toFixed(2)} + C$${(cadCents / 100).toFixed(2)}  (fx ${fx.toFixed(4)} → USD sleeve ≈ C$${(usdAsCad / 100).toFixed(2)})\n` +
      `  expected USD: US$${(EXPECT_USD / 100).toFixed(2)}  drift ${(drift * 100).toFixed(2)}%${drift > 0.02 ? "  ⚠ more than 2% off — is the FX done?" : ""}\n` +
      `  contributions before: C$${(before / 100).toFixed(2)} → after: C$${((usdAsCad + cadCents) / 100).toFixed(2)}\n` +
      `  XIC anchor ${xicMid} (today)`,
  );
  if (!APPLY) {
    console.log("  (dry run — add --apply to write)");
    return;
  }
  if (drift > 0.02 && !args.includes("--force")) throw new Error("USD cash is more than 2% off the expected size — pass --force if that is intended.");
  await prisma.$transaction([
    prisma.contribution.deleteMany({}),
    prisma.contribution.create({
      data: { amountCents: usdAsCad, contributor: "Cam", xicPriceCents: xicMid, note: `${LABEL} baseline — US$${(usdCents / 100).toFixed(2)} ≈ C$${(usdAsCad / 100).toFixed(2)} @ fx ${fx.toFixed(4)} (paper reset, D138)` },
    }),
    ...(cadCents !== 0
      ? [prisma.contribution.create({ data: { amountCents: cadCents, contributor: "Cam", xicPriceCents: xicMid, note: `${LABEL} — C$${(cadCents / 100).toFixed(2)} CAD cash at the reset` } })]
      : []),
  ]);
  const after = (await prisma.contribution.aggregate({ _sum: { amountCents: true } }))._sum.amountCents ?? 0;
  console.log(`  written: contributions = C$${(after / 100).toFixed(2)} (NAV history kept; readers scope by inception).`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
