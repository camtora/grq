import { prisma } from "@/lib/db";
import { getCloses, refreshBars } from "@/lib/bars";
import { gatherPredictions } from "./sources";
import { closeAtOrBefore } from "./score";

// Snapshot the ENTRY mark for every new prediction. The entry is the close on/before the
// moment the call was filed — the last completed market price when the fund made the bet.
// This is RETROACTIVE-SAFE: getCloses keeps ~260 days of bars, so a call made today anchors
// correctly even if we don't snapshot it until later. Idempotent: the (source, refId) unique
// guard means re-running never double-counts. We store ONLY the entry; the forward return and
// hit/miss are computed live at render (lib/report-card/load.ts).
//
//   fetchMissingBars=false (default, page fast-path): only snapshots names whose bars we
//     already have — no network, safe to call on every render. New tracked-name calls
//     self-capture on first view.
//   fetchMissingBars=true (the script / a cron): pulls 1y of bars for untracked names first,
//     so hunt/chess finds we don't otherwise track get an entry too.

export async function snapshotPredictions({ fetchMissingBars = false } = {}): Promise<{ considered: number; inserted: number; unpriceable: number }> {
  const raws = await gatherPredictions();
  const existing = await prisma.prediction.findMany({ select: { source: true, refId: true } });
  const have = new Set(existing.map((e) => `${e.source}:${e.refId}`));
  const todo = raws.filter((r) => !have.has(`${r.source}:${r.refId}`));

  let inserted = 0;
  let unpriceable = 0;
  for (const r of todo) {
    let closes = await getCloses(r.yahoo);
    if (closes.length === 0 && fetchMissingBars) {
      await refreshBars([r.yahoo], "1y");
      closes = await getCloses(r.yahoo);
    }
    const entryPriceCents = closeAtOrBefore(closes, r.predictedAt);
    if (entryPriceCents == null) {
      unpriceable++; // no print at/before the call — retries next run once bars exist
      continue;
    }
    // The date of the close we anchored on (may lag predictedAt by a day or a weekend).
    const entryCloseAt = [...closes].reverse().find((c) => c.date.getTime() <= r.predictedAt.getTime())?.date ?? null;
    try {
      await prisma.prediction.create({
        data: {
          source: r.source,
          refId: r.refId,
          symbol: r.symbol,
          yahoo: r.yahoo,
          currency: r.currency,
          direction: r.direction,
          label: r.label,
          conviction: r.conviction,
          effectOrder: r.effectOrder,
          context: r.context,
          predictedAt: r.predictedAt,
          entryPriceCents,
          entryCloseAt,
        },
      });
      inserted++;
    } catch {
      // unique (source, refId) race — another snapshot beat us; fine.
    }
  }
  return { considered: raws.length, inserted, unpriceable };
}
