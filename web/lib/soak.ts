import { PAPER_INCEPTION } from "./portfolio";

// The soak gate (PROJECT_PLAN §9): ≥4 clean weeks total across sim + IBKR paper
// (28 days), AND ≥2 clean weeks on IBKR paper (14 days), before real money trades.
// We count ELAPSED CALENDAR DAYS from each inception — the soak is about wall-clock
// stable operation. Cleanliness isn't auto-tracked yet; a material incident or change
// (e.g. enabling US trading, D34/D62) resets the clock MANUALLY by moving the start
// dates / GRQ_SOAK_START. (This replaced a v0 that returned 0 unless GRQ_SOAK_START was
// set — it never was, so both iOS counters read 0, i.e. "never started".)

export const SOAK_TOTAL_REQUIRED_DAYS = 28; // 4 weeks total (sim + paper)
export const SOAK_PAPER_REQUIRED_DAYS = 14; // 2 weeks on IBKR paper

// Total soak day 1 = the sim soak start (2026-06-12); override with GRQ_SOAK_START.
// Paper soak day 1 = PAPER_INCEPTION (IBKR paper went live 2026-06-17, D33).
const SOAK_TOTAL_START = (() => {
  const env = process.env.GRQ_SOAK_START ? new Date(process.env.GRQ_SOAK_START) : null;
  return env && !isNaN(env.getTime()) ? env : new Date("2026-06-12T13:30:00Z");
})();

const DAY_MS = 24 * 60 * 60 * 1000;

export type SoakStatus = {
  totalDays: number;
  totalRequired: number;
  paperDays: number;
  paperRequired: number;
  passed: boolean;
  paperStart: Date;
};

export function soakStatus(now: Date = new Date()): SoakStatus {
  const elapsed = (from: Date) => Math.max(0, Math.floor((now.getTime() - from.getTime()) / DAY_MS));
  const totalDays = elapsed(SOAK_TOTAL_START);
  const paperDays = elapsed(PAPER_INCEPTION);
  return {
    totalDays,
    totalRequired: SOAK_TOTAL_REQUIRED_DAYS,
    paperDays,
    paperRequired: SOAK_PAPER_REQUIRED_DAYS,
    passed: totalDays >= SOAK_TOTAL_REQUIRED_DAYS && paperDays >= SOAK_PAPER_REQUIRED_DAYS,
    paperStart: PAPER_INCEPTION,
  };
}
