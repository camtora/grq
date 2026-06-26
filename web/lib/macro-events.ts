// Macro events (D81, M1) — turn the leveled BoC/FRED snapshot into discrete EVENTS.
// Once per ET day the runner diffs the live getMacro() against yesterday's persisted
// snapshot; a tracked series that moved beyond its threshold becomes a MarketEvent the
// agent reads in context (a rate decision, a CPI print, a notable yield/FX move). It's
// an INPUT the agent weighs, never the gate. Full plan: docs/NEWS-AND-EVENTS.md.
import { prisma } from "./db";
import { getMacro, type MacroSnapshot } from "./macro";
import { fmpEconomicCalendar } from "./fmp";

// ET calendar date (YYYY-MM-DD). lib/ stays free of agent/ imports, so compute inline.
function etDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

type MacroKey = Exclude<keyof MacroSnapshot, "asOf">;

// Per-series event config. Thresholds are in the series' own units and tuned to the
// series' noise floor: BoC overnight/target only moves on a decision (small threshold);
// FRED DFF (daily *effective* fed funds) wiggles a basis point or two daily, so it needs
// a wider 10bp gate to catch a real policy move and not the daily jitter. CPI is a
// monthly print (any change is a new print). Yields/FX move continuously → flag notable.
const SERIES: Array<{
  key: MacroKey;
  region: "CA" | "US";
  source: "BoC" | "FRED";
  label: string;
  kind: string;
  threshold: number;
  fmt: (v: number) => string;
}> = [
  { key: "overnightRate", region: "CA", source: "BoC", label: "BoC overnight rate", kind: "RATE_DECISION", threshold: 0.05, fmt: (v) => `${v.toFixed(2)}%` },
  { key: "fedFunds", region: "US", source: "FRED", label: "Fed funds rate", kind: "RATE_DECISION", threshold: 0.1, fmt: (v) => `${v.toFixed(2)}%` },
  { key: "cpiYoY", region: "CA", source: "BoC", label: "Canada CPI YoY", kind: "CPI_PRINT", threshold: 0.05, fmt: (v) => `${v.toFixed(1)}%` },
  { key: "usCpiYoY", region: "US", source: "FRED", label: "US CPI YoY", kind: "CPI_PRINT", threshold: 0.05, fmt: (v) => `${v.toFixed(1)}%` },
  { key: "ust10y", region: "US", source: "FRED", label: "US 10y Treasury", kind: "YIELD_MOVE", threshold: 0.1, fmt: (v) => `${v.toFixed(2)}%` },
  { key: "goc5yr", region: "CA", source: "BoC", label: "5y GoC yield", kind: "YIELD_MOVE", threshold: 0.1, fmt: (v) => `${v.toFixed(2)}%` },
  { key: "usdcad", region: "CA", source: "BoC", label: "USD/CAD", kind: "FX_MOVE", threshold: 0.01, fmt: (v) => v.toFixed(4) },
];

/**
 * Once-per-ET-day macro delta scan: record a MarketEvent for every tracked series that
 * moved beyond its threshold vs the most recent prior daily snapshot, then upsert today's
 * snapshot as the next day's baseline. Idempotent — the @@unique([kind,region,series,at])
 * constraint means re-running the same day is a no-op. First-ever run just seeds the
 * baseline (no prior → no events).
 */
export async function runMacroEventScan(): Promise<{ events: number; date: string }> {
  const snap = await getMacro();
  const date = etDate();
  // Stable per-day timestamp (noon UTC of the ET date) so the unique key is deterministic.
  const at = new Date(`${date}T12:00:00Z`);

  const prior = await prisma.macroDaily.findFirst({
    where: { date: { lt: date } },
    orderBy: { date: "desc" },
  });

  let events = 0;
  if (prior) {
    for (const s of SERIES) {
      const cur = snap[s.key];
      const prev = prior[s.key];
      if (cur == null || prev == null) continue;
      const delta = cur - prev;
      if (Math.abs(delta) < s.threshold) continue;
      const dir = delta > 0 ? "↑" : "↓";
      const headline = `${s.label} ${dir} ${s.fmt(prev)} → ${s.fmt(cur)}`;
      try {
        await prisma.marketEvent.create({
          data: { at, kind: s.kind, region: s.region, series: s.key, headline, value: cur, prevValue: prev, source: s.source },
        });
        events++;
      } catch {
        // unique([kind,region,series,at]) collision → already recorded for today; ignore.
      }
    }
  }

  await prisma.macroDaily.upsert({
    where: { date },
    create: {
      date,
      usdcad: snap.usdcad,
      overnightRate: snap.overnightRate,
      goc5yr: snap.goc5yr,
      cpiYoY: snap.cpiYoY,
      fedFunds: snap.fedFunds,
      ust10y: snap.ust10y,
      usCpiYoY: snap.usCpiYoY,
    },
    update: {
      usdcad: snap.usdcad,
      overnightRate: snap.overnightRate,
      goc5yr: snap.goc5yr,
      cpiYoY: snap.cpiYoY,
      fedFunds: snap.fedFunds,
      ust10y: snap.ust10y,
      usCpiYoY: snap.usCpiYoY,
      at: new Date(),
    },
  });

  return { events, date };
}

/** Recent observed macro deltas (not forward calendar items) for the agent context. */
export async function recentMacroEvents(days = 10, limit = 6): Promise<Array<{ at: Date; headline: string }>> {
  const since = new Date(Date.now() - days * 86_400_000);
  return prisma.marketEvent.findMany({
    where: { at: { gte: since }, scheduledFor: null },
    orderBy: { at: "desc" },
    take: limit,
    select: { at: true, headline: true },
  });
}

/**
 * Refresh the forward calendar: pull the next ~16 days of high-impact US/CA macro events
 * (FOMC, CPI, jobs, BoC decisions) and upsert them as scheduled MarketEvents. Idempotent —
 * the @@unique([kind,region,series,at]) constraint dedupes re-pulls. Once per ET day.
 */
export async function refreshEconomicCalendar(daysAhead = 16): Promise<{ events: number }> {
  const now = new Date();
  const from = etDate(now);
  const to = etDate(new Date(now.getTime() + daysAhead * 86_400_000));
  const events = await fmpEconomicCalendar(from, to).catch(() => []);
  let written = 0;
  for (const e of events) {
    const when = new Date(e.date.replace(" ", "T") + "Z");
    if (isNaN(when.getTime())) continue;
    const series = e.event.slice(0, 120);
    try {
      await prisma.marketEvent.create({
        data: {
          at: when,
          scheduledFor: when,
          kind: "CALENDAR",
          region: e.country, // "US" | "CA"
          series,
          headline: `${e.country}: ${e.event}${e.estimate != null ? ` (est ${e.estimate})` : ""}`,
          value: e.estimate,
          prevValue: e.previous,
          source: "FMP",
        },
      });
      written++;
    } catch {
      // unique collision → already on the calendar; ignore.
    }
  }
  return { events: written };
}

/** Upcoming scheduled macro catalysts for the agent context ("CPI prints in 3 days"). */
export async function upcomingEvents(limit = 8): Promise<Array<{ at: Date; headline: string }>> {
  const now = new Date();
  const rows = await prisma.marketEvent.findMany({
    where: { kind: "CALENDAR", scheduledFor: { gte: now } },
    orderBy: { scheduledFor: "asc" },
    take: limit,
    select: { scheduledFor: true, headline: true },
  });
  return rows.map((r) => ({ at: r.scheduledFor as Date, headline: r.headline }));
}
