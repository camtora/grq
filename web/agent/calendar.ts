// Market calendar for the TSX + NYSE, computed in ET via Intl (no OS tzdata needed). Both exchanges
// share the 9:30–16:00 ET session; only the HOLIDAY lists differ — so the fund can trade the US sleeve
// on a TSX-only holiday (e.g. Canada Day) and the CA sleeve on a US-only holiday (e.g. July 4). The §6
// gate checks the ORDER's exchange (by currency). Extend both lists each December.

const ET = "America/Toronto";
export type Market = "CA" | "US" | "ANY";

// TSX full-closure holidays, 2026. (2027: add before New Year's.)
const CA_HOLIDAYS = new Set([
  "2026-01-01", // New Year's Day
  "2026-02-16", // Family Day
  "2026-04-03", // Good Friday
  "2026-05-18", // Victoria Day
  "2026-07-01", // Canada Day
  "2026-08-03", // Civic Holiday
  "2026-09-07", // Labour Day
  "2026-10-12", // Thanksgiving (CA)
  "2026-12-25", // Christmas
  "2026-12-28", // Boxing Day (observed)
]);

// NYSE full-closure holidays, 2026. (2027: add before New Year's.)
const US_HOLIDAYS = new Set([
  "2026-01-01", // New Year's Day
  "2026-01-19", // Martin Luther King Jr. Day
  "2026-02-16", // Washington's Birthday (Presidents' Day)
  "2026-04-03", // Good Friday
  "2026-05-25", // Memorial Day
  "2026-06-19", // Juneteenth
  "2026-07-03", // Independence Day (observed — July 4 is a Saturday)
  "2026-09-07", // Labor Day
  "2026-11-26", // Thanksgiving (US)
  "2026-12-25", // Christmas
]);

export type ETParts = {
  dateStr: string; // YYYY-MM-DD in ET
  weekday: number; // 0=Sun … 6=Sat
  hour: number;
  minute: number;
  minutesSinceMidnight: number;
};

export function etParts(d: Date = new Date()): ETParts {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: ET,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const hour = Number(parts.hour) % 24; // en-CA may render midnight as 24
  const minute = Number(parts.minute);
  return {
    dateStr: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: weekdayMap[parts.weekday.slice(0, 3)] ?? 0,
    hour,
    minute,
    minutesSinceMidnight: hour * 60 + minute,
  };
}

/** Is the given exchange trading `d`? `market` = "CA" (TSX), "US" (NYSE), or "ANY" (either open — the
 *  default, so a TSX-only holiday like Canada Day still counts as a trading day for the US sleeve). */
export function isMarketDay(d: Date = new Date(), market: Market = "ANY"): boolean {
  const p = etParts(d);
  if (p.weekday < 1 || p.weekday > 5) return false;
  const ca = !CA_HOLIDAYS.has(p.dateStr);
  const us = !US_HOLIDAYS.has(p.dateStr);
  return market === "CA" ? ca : market === "US" ? us : ca || us;
}

const OPEN_MIN = 9 * 60 + 30;
const CLOSE_MIN = 16 * 60;

export function isMarketOpen(d: Date = new Date(), market: Market = "ANY"): boolean {
  if (!isMarketDay(d, market)) return false;
  const m = etParts(d).minutesSinceMidnight;
  return m >= OPEN_MIN && m < CLOSE_MIN;
}

/** Which exchanges are trading `d` (for the agent's context note + honest UI). */
export function openExchanges(d: Date = new Date()): { ca: boolean; us: boolean } {
  return { ca: isMarketDay(d, "CA"), us: isMarketDay(d, "US") };
}

/** Minutes since the 9:30 open (negative before open). */
export function minutesSinceOpen(d: Date = new Date()): number {
  return etParts(d).minutesSinceMidnight - OPEN_MIN;
}

/** Minutes until the 16:00 close (negative after close). */
export function minutesToClose(d: Date = new Date()): number {
  return CLOSE_MIN - etParts(d).minutesSinceMidnight;
}

/** Start of "today" in ET, as a UTC Date — for day-bounded DB queries. */
export function startOfEtDay(d: Date = new Date()): Date {
  const p = etParts(d);
  // Find the UTC instant where ET reads 00:00 for this date by probing offsets.
  for (const offsetH of [4, 5]) {
    const guess = new Date(`${p.dateStr}T00:00:00-0${offsetH}:00`);
    if (etParts(guess).dateStr === p.dateStr && etParts(guess).minutesSinceMidnight === 0) {
      return guess;
    }
  }
  return new Date(`${p.dateStr}T00:00:00-05:00`);
}

/** The ET date string (YYYY-MM-DD) — handy as a Report date key. */
export function etDateStr(d: Date = new Date()): string {
  return etParts(d).dateStr;
}

/**
 * The 9:30 open and 16:00 close of the ET trading day containing `d`, as epoch ms.
 * Built off startOfEtDay (which probes the correct UTC offset), so DST is handled —
 * a trading day never straddles a DST switch, so adding the fixed session minutes is safe.
 * Used to pin the Today NAV tape to a fixed 9:30→16:00 x-axis.
 */
export function etSessionBounds(d: Date = new Date()): { open: number; close: number } {
  const midnight = startOfEtDay(d).getTime();
  return { open: midnight + OPEN_MIN * 60_000, close: midnight + CLOSE_MIN * 60_000 };
}
