// Backfill / refresh the Report Card entry snapshots (docs/REPORT-CARD.md). Pulls 1y of bars
// for any untracked name first, anchors each prediction's entry on the close at the moment it
// was filed, and inserts Prediction rows. Idempotent — safe to re-run (and to cron nightly).
//   docker exec grq-web npx tsx scripts/snapshot-predictions.ts
import { snapshotPredictions } from "../lib/report-card/snapshot";

snapshotPredictions({ fetchMissingBars: true })
  .then((r) => {
    console.log(`[snapshot-predictions] considered=${r.considered} inserted=${r.inserted} unpriceable=${r.unpriceable}`);
    process.exit(0);
  })
  .catch((e) => {
    console.error("[snapshot-predictions] failed:", e);
    process.exit(1);
  });
