// NAV HISTORY — the only place that reads NavSnapshot rows back (D120).
//
// Why a module instead of a `where` clause people remember to write: on 2026-07-29 a single NAV row
// taken mid-settlement (a sale's proceeds in cash while the sold shares were still marked) read
// $86,795 against a real $67,800. `checkDrawdown` takes the max NAV over all history, so that
// two-second transient became a PERMANENT high-water mark: the fund read as −22.9% off its peak, the
// kill switch engaged, and every re-enable re-killed within two ticks. The same shape had already
// done it on 2026-07-16 (D118), where the fix was to delete the bad rows by hand — the code that let
// one row poison the mark forever was left alone, so it happened again six weeks later.
//
// Deleting rows is not the fix, and neither is a filter that lives at nine call sites. The rows are
// an honest record of what the system computed; what they must never be is a MARK. So: writers stamp
// `settled` (lib/broker/sim.ts, via mirrorLag), and every read comes back through here, where the
// filter is structural. test/nav-integrity.test.ts fails the build if a raw `prisma.navSnapshot`
// read appears anywhere else — the D118c lesson, that a rule enforced by habit is not enforced.
import { prisma } from "./db";

/** Only rows taken while the broker mirror was current. Never widen this. */
const SETTLED = { settled: true } as const;

/** The drawdown high-water mark (§6): the highest SETTLED NAV the fund has ever marked.
 *  `since` scopes it to an era — e.g. a post-reset re-baseline. */
export async function highWaterMarkCents(since?: Date): Promise<number> {
  const row = await prisma.navSnapshot.aggregate({
    _max: { navCents: true },
    where: { ...SETTLED, ...(since ? { at: { gte: since } } : {}) },
  });
  return row._max.navCents ?? 0;
}

/** The last settled snapshot strictly before `before` — the day-open baseline for day P&L.
 *  `since` floors it to an era (callers pass PAPER_INCEPTION so a sim-era row can't be a baseline). */
export async function lastSettledSnapshotBefore(before: Date, since?: Date) {
  return prisma.navSnapshot.findFirst({
    where: { ...SETTLED, at: { lt: before, ...(since ? { gte: since } : {}) } },
    orderBy: { at: "desc" },
  });
}

/** The settled NAV series in [from, to), oldest first — the tape every chart draws. */
export async function settledSnapshotsBetween(from: Date, to?: Date) {
  return prisma.navSnapshot.findMany({
    where: { ...SETTLED, at: { gte: from, ...(to ? { lt: to } : {}) } },
    orderBy: { at: "asc" },
    select: { at: true, navCents: true, benchmarkCents: true },
  });
}

/** The most recent settled mark — "what the fund is worth" on a scoreboard. */
export async function latestSettledSnapshot() {
  return prisma.navSnapshot.findFirst({ where: SETTLED, orderBy: { at: "desc" } });
}

/** The most recent `limit` settled marks, oldest first (the NAV chart's window). */
export async function recentSettledSnapshots(limit: number, since?: Date) {
  const rows = await prisma.navSnapshot.findMany({
    where: { ...SETTLED, ...(since ? { at: { gte: since } } : {}) },
    orderBy: { at: "desc" },
    take: limit,
  });
  return rows.reverse();
}
