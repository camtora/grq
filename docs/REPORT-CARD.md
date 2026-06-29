# Report Card — grading the fund's predictions against the tape (experiment)

**Status:** shipped 2026-06-29 (web-only). Lives in the **Experiments** dropdown at
`/report-card`. A read-only consumer of the other experiments — it never edits or trades them.

## What it is

A forward-test ledger. Every dated, **directional** prediction the fund makes gets snapshotted
at the price it was made and marked to the live tape, so we can answer one question honestly:
**were the calls right?** Graded on **absolute direction** (Cam, 2026-06-29): an UP call scores
when the price rose, a DOWN call when it fell — no benchmark adjustment.

## The three prediction sources (all read-only)

| Source | From | Direction |
|---|---|---|
| **chess** | `ChessPlay` (per piece) | BENEFICIARY → UP, VICTIM → DOWN (NEUTRAL dropped) |
| **call** | `JournalEntry.stance` (7-point, non-hunt dossiers) | Buy-side → UP, Sell-side → DOWN (Hold dropped) |
| **hunt** | `JournalEntry` "Hunt dossier …" leads | UP (a lead is an implicit bullish flag) |

Every dated call is scored on its own (a re-researched name is a fresh prediction), the same
philosophy as The Race. NEUTRAL / Hold (non-directional) calls never reach the scorer.

## How a call is graded

- **Entry** = the close on/before the moment the call was filed (the last completed market
  price when the bet was made). Retroactive-safe: we keep ~260 days of bars, so a call anchors
  correctly even if we snapshot it later. `lib/report-card/score.ts → closeAtOrBefore`.
- **Mark** = the latest stored close (daily-close resolution — the right granularity for a
  forward test, and it keeps the page off a per-symbol live-quote fan-out on a 700+ row ledger).
- **Called return** = the price move oriented to the bet (a correct DOWN call shows green).
- **Hit** = the price moved the way the call said. Aggregated into a **hit rate** + **avg called
  return**, overall, **per source**, and — the Chess thesis — **by effect-order** (do the
  2nd/3rd-order ripple plays actually pay?).

The grade is a unitless return %, so there's no FX: CAD and USD names are directly comparable.

## Data model

`Prediction` (`web/prisma/schema.prisma`) — one row per call, storing ONLY the entry snapshot
(`source`, `refId`, `symbol`, `yahoo`, `currency`, `direction`, `label`, `conviction`,
`effectOrder`, `context`, `predictedAt`, `entryPriceCents`, `entryCloseAt`). Unique on
`(source, refId)` → idempotent. Forward return / hit-miss are computed live at render.

## Flow

1. **Snapshot** (`lib/report-card/snapshot.ts`) gathers predictions (`sources.ts`), resolves the
   entry close, inserts `Prediction` rows. Idempotent.
   - The `/report-card` page calls it on the **fast path** (`fetchMissingBars:false`, DB-only) so
     new tracked-name calls self-capture on first view.
   - `scripts/snapshot-predictions.ts` (`fetchMissingBars:true`) pulls 1y of bars for untracked
     names first — run it nightly / on demand to backfill the rest:
     `docker exec grq-web npx tsx scripts/snapshot-predictions.ts`.
2. **Render** (`lib/report-card/load.ts → loadReportCard`) marks every prediction to its last
   close, scores it, builds the tallies, and the page (`app/report-card/page.tsx`) shows the
   headline hit rates + a per-call table.

## Honesty / guardrail

Grading judgment ≠ trading. A call becomes tradeable only the normal way (full dossier → the §6
gate). The Report Card touches none of that — it's pure read-and-score.

## Out of scope (follow-ups)

- T+5 / T+21 horizon columns (the scorer has `closeAtHorizon`; the loader marks to-now only).
- A benchmark-relative (alpha) view alongside absolute direction.
- A cron for the full snapshot (today: page fast-path + manual script).
- iOS (no `shared/contract.ts` change this pass).
