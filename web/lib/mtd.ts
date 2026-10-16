import { lastSettledSnapshotBefore, latestSettledSnapshot } from "./nav-history";

// Month-to-date, fund vs benchmark, from the settled NAV history (D120's read seam): the base is the
// last settled mark BEFORE the month began in ET, the end is the latest settled mark. Used by the
// "Graham, start here" card on the Opus 5.5 plan so its headline figure stays live rather than
// freezing at the Oct 15 numbers in the text (Cam, 2026-10-15: "highlight the October +5.2% against
// the TSX's +2.5%"). Null when there is no base (first month) or no settled mark yet.
export type MonthToDate = { month: string; fundPct: number; benchPct: number; asOf: Date };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function etMonthStart(now: Date = new Date()): { start: Date; month: string } {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit" });
  const parts = Object.fromEntries(f.formatToParts(now).map((p) => [p.type, p.value]));
  const y = Number(parts.year);
  const m = Number(parts.month);
  // ET midnight on the 1st, in UTC: Toronto is UTC−4 (EDT) from the 1st of April to the 1st of
  // November inclusive, UTC−5 (EST) otherwise. The DST switches never fall on a 1st.
  const offsetHours = m >= 4 && m <= 11 ? 4 : 5;
  const start = new Date(Date.UTC(y, m - 1, 1, offsetHours));
  return { start, month: MONTHS[m - 1] };
}

export async function monthToDate(now: Date = new Date()): Promise<MonthToDate | null> {
  const { start, month } = etMonthStart(now);
  const [base, latest] = await Promise.all([lastSettledSnapshotBefore(start), latestSettledSnapshot()]);
  if (!base || !latest || base.navCents <= 0 || (base.benchmarkCents ?? 0) <= 0 || latest.at <= start) return null;
  const fundPct = (latest.navCents / base.navCents - 1) * 100;
  const benchPct = ((latest.benchmarkCents ?? 0) / (base.benchmarkCents ?? 1) - 1) * 100;
  return { month, fundPct, benchPct, asOf: latest.at };
}
