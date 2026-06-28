import { prisma } from "../db";
import { refreshBars } from "../bars";
import { computeSignals, overallSignal } from "../../agent/signals";

// Market Base Layer — technical read for Browse (docs/MARKET-BASE-LAYER.md). Computes the
// deterministic signal (agent/signals.ts) for the ACTIONABLE screened names (INTERESTING /
// WATCH) and stores the 7-point label on MarketScreen. Bounded + stale-first so it's gentle
// on Yahoo (refreshBars self-throttles at 4-concurrent): new names (signalAt null) get a 1y
// bar backfill; already-done names get a light 5d top-up. PASS/untagged names are skipped
// (no technical read needed). Imports agent/signals — runner/script only, NOT a web bundle.
export async function refreshScreenSignals(opts?: { limit?: number }): Promise<{ updated: number }> {
  const limit = opts?.limit ?? 200;
  const rows = await prisma.marketScreen.findMany({
    where: { tag: { in: ["INTERESTING", "WATCH"] } },
    orderBy: [{ signalAt: { sort: "asc", nulls: "first" } }, { screenScore: "desc" }],
    take: limit,
    select: { id: true, symbol: true, signalAt: true },
  });
  if (rows.length === 0) return { updated: 0 };

  const fresh = rows.filter((r) => !r.signalAt).map((r) => r.symbol); // never computed → full history
  const maint = rows.filter((r) => r.signalAt).map((r) => r.symbol); // refresh recent closes only
  if (fresh.length) await refreshBars(fresh, "1y");
  if (maint.length) await refreshBars(maint, "5d");

  let updated = 0;
  for (const r of rows) {
    const sig = await computeSignals(r.symbol).catch(() => null);
    const rec = sig ? overallSignal(sig) : null;
    await prisma.marketScreen.update({ where: { id: r.id }, data: { signal: rec?.label ?? null, signalAt: new Date() } });
    updated++;
  }
  return { updated };
}
