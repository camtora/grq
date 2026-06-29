// The Report Card — pure scoring (no I/O). A "prediction" is one dated, directional call
// the fund made (a Chess play, Alfred's 7-point call, or a Hunt lead), with an entry price
// snapshotted at the moment it was made (entryPriceCents, native ccy). We mark it to a later
// price and grade it on ABSOLUTE DIRECTION (Cam, 2026-06-29): an UP call is right when the
// price rose, a DOWN call is right when it fell — no benchmark adjustment. HOLD/NEUTRAL calls
// aren't directional bets and never reach this layer (they're dropped at snapshot time).
//
// This reads the OTHER experiments' outputs; it never edits or trades them. A play becoming
// tradeable still goes the normal way (research → §6 gate).

export type PredDir = "UP" | "DOWN";

export type PredScore = {
  /** raw price return in basis points (mark − entry)/entry, sign of the actual move */
  returnBps: number;
  /** the return oriented to the call: positive when the call was RIGHT (a correct DOWN
   *  bet shows +). This is what we average across calls so longs and shorts are comparable. */
  calledReturnBps: number;
  /** absolute-direction grade: did the price move the way the call said? */
  isGreen: boolean;
};

/** Score one prediction against a mark price (both native ccy). Returns null when it can't be
 *  priced (missing/zero entry or mark) — the caller renders it as "pending / no mark yet". */
export function scorePrediction(dir: PredDir, entryPriceCents: number | null, markCents: number | null): PredScore | null {
  if (entryPriceCents == null || entryPriceCents <= 0 || markCents == null || markCents <= 0) return null;
  const returnBps = Math.round(((markCents - entryPriceCents) / entryPriceCents) * 10000);
  const sign = dir === "UP" ? 1 : -1;
  return {
    returnBps,
    calledReturnBps: returnBps * sign,
    isGreen: returnBps * sign > 0, // flat (0) is not a win
  };
}

export type ScoredRow = { dir: PredDir; entryPriceCents: number | null; markCents: number | null };

export type Tally = {
  graded: number; // priceable calls (have a mark)
  pending: number; // no mark yet
  green: number; // right
  hitRate: number | null; // green / graded, 0..1
  avgCalledReturnBps: number | null; // mean oriented return across graded calls
};

/** Aggregate a set of predictions into a hit-rate + average called-return tally. */
export function tally(rows: ScoredRow[]): Tally {
  let graded = 0;
  let green = 0;
  let sumCalled = 0;
  let pending = 0;
  for (const r of rows) {
    const s = scorePrediction(r.dir, r.entryPriceCents, r.markCents);
    if (!s) {
      pending++;
      continue;
    }
    graded++;
    if (s.isGreen) green++;
    sumCalled += s.calledReturnBps;
  }
  return {
    graded,
    pending,
    green,
    hitRate: graded > 0 ? green / graded : null,
    avgCalledReturnBps: graded > 0 ? Math.round(sumCalled / graded) : null,
  };
}

/** The close on/before a given instant from an ascending close series — the honest entry
 *  anchor (the last print the market had made when the call was filed). Null if the series
 *  is empty or starts after `at` (we have no print that old). */
export function closeAtOrBefore(closes: { date: Date; closeCents: number }[], at: Date): number | null {
  let base: number | null = null;
  for (const c of closes) {
    if (c.date.getTime() <= at.getTime()) base = c.closeCents;
    else break;
  }
  return base;
}

/** The close at/just after `at + horizonDays` — for the T+N columns (how the call did over a
 *  fixed window, not just "to now"). Null when our history doesn't reach that far yet. */
export function closeAtHorizon(closes: { date: Date; closeCents: number }[], at: Date, horizonDays: number): number | null {
  const target = at.getTime() + horizonDays * 86_400_000;
  for (const c of closes) {
    if (c.date.getTime() >= target) return c.closeCents;
  }
  return null; // window hasn't elapsed yet
}
