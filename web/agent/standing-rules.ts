// The members' standing rules from the 2026-10-23 plan decisions (D141; PlanDecision rows 3–10,
// recorded on /how-it-works?tab=opus-plan). Each is a §6-style rule: enforced in the agent's order
// gate (validator.ts), changed only by humans. Pure — test/standing-rules.test.ts pins them.
//
//   Q3 single-name cap      → the Aggressive dial's maxPositionPct 80 → 50 (policy.ts DIALS)
//   Q6 new stocks a week    → ≤ 2 new names per rolling 7 days; up to 4 in the first week of a run
//   Q8 book size            → a NEW position is at least US$5,000 at entry; top-ups are free
//   Q2 stop width           → a NEW position's written stop sits no closer than two normal weekly
//                             moves or the dial's safety stop, whichever is wider
//   Q4 VOO is parking       → ballast is left out of all three rules above, the round-trip rule and
//                             the rotation score
//
// "New" means the position was at zero when the window opened: a name opened on Monday and topped
// up on Wednesday is one new name, and a top-up of a long-held name is never new.

export const BALLAST = new Set(["VOO"]);
export const isBallast = (symbol: string) => BALLAST.has(symbol.toUpperCase());

export const STARTERS = {
  perWeek: 2,
  firstWeek: 4, // the book starts empty: pass mark 1 wants US$25,000 invested by day 5
  firstWeekDays: 7,
} as const;

export const MIN_FIRST_BUY_USD_CENTS = 500_000; // US$5,000 — one tenth of the US$50,000 launch size

const DAY = 86_400_000;

/** How many new names the rolling week allows, given when the run began. */
export function starterCap(now: Date, inception: Date): number {
  const age = now.getTime() - inception.getTime();
  return age >= 0 && age < STARTERS.firstWeekDays * DAY ? STARTERS.firstWeek : STARTERS.perWeek;
}

export type StockFill = { symbol: string; side: "BUY" | "SELL"; qty: number; at: Date };

/** The names opened (from zero) inside [since, now], ballast excluded. `currentQty` is the broker
 *  mirror; the quantity at `since` is reconstructed by walking the window's fills back from it. */
export function newNamesSince(fills: StockFill[], currentQty: Map<string, number>, since: Date): string[] {
  const inWin = fills.filter((f) => f.at >= since);
  const net = new Map<string, number>();
  const bought = new Set<string>();
  for (const f of inWin) {
    net.set(f.symbol, (net.get(f.symbol) ?? 0) + (f.side === "BUY" ? f.qty : -f.qty));
    if (f.side === "BUY") bought.add(f.symbol);
  }
  const out: string[] = [];
  for (const sym of bought) {
    if (isBallast(sym)) continue;
    const atStart = (currentQty.get(sym) ?? 0) - (net.get(sym) ?? 0);
    if (atStart <= 0) out.push(sym);
  }
  return out.sort();
}

/** A normal week's move, in bps: the median absolute 5-session return over the last ~26 weeks of
 *  daily closes, non-overlapping. null under 8 weeks of history (too little to call "normal"). */
export function weeklyMoveBps(closesCents: number[]): number | null {
  const c = closesCents.slice(-131);
  const moves: number[] = [];
  for (let i = c.length - 1; i - 5 >= 0; i -= 5) {
    const a = c[i - 5];
    const b = c[i];
    if (a > 0 && b > 0) moves.push(Math.abs(b / a - 1) * 10_000);
  }
  if (moves.length < 8) return null;
  moves.sort((x, y) => x - y);
  const mid = moves.length >> 1;
  const med = moves.length % 2 ? moves[mid] : (moves[mid - 1] + moves[mid]) / 2;
  return Math.round(med);
}

/** The minimum distance below the entry price a new position's stop may sit, in bps. */
export function minStopDistanceBps(weeklyBps: number | null, safetyStopPct: number): number {
  return Math.max(weeklyBps != null ? 2 * weeklyBps : 0, safetyStopPct * 100);
}

export type NewBuyCheck = {
  symbol: string;
  isNewName: boolean;
  costUsdCents: number; // the order's value in USD cents (a CAD name converted at today's rate)
  priceCents: number; // the estimated fill, native
  stopCents: number | undefined;
  invalidation: string | undefined;
  weeklyBps: number | null;
  safetyStopPct: number;
  newNamesThisWeek: string[]; // already opened in the rolling week (excluding this one)
  cap: number;
};

/** The members' rules for a BUY. null = passes; otherwise the plain-English refusal. Top-ups and
 *  ballast pass untouched. */
export function standingRuleRefusal(c: NewBuyCheck): string | null {
  if (!c.isNewName || isBallast(c.symbol)) return null;
  const others = c.newNamesThisWeek.filter((s) => s !== c.symbol);
  if (others.length >= c.cap) {
    return `New-stock limit: ${others.length} new name${others.length === 1 ? "" : "s"} opened in the last 7 days (${others.join(", ")}) — the members' ceiling is ${c.cap} a week. Top-ups of what you own don't count; add to a holding or wait.`;
  }
  if (c.costUsdCents < MIN_FIRST_BUY_USD_CENTS) {
    return `Minimum first buy: a new position is at least US$${(MIN_FIRST_BUY_USD_CENTS / 100).toLocaleString("en-US")} at entry (this order is ~US$${Math.round(c.costUsdCents / 100).toLocaleString("en-US")}). Size it up or pass; top-ups have no minimum.`;
  }
  if (!c.invalidation || !c.invalidation.trim()) {
    return "A new position needs a written invalidation: what would prove the thesis wrong.";
  }
  if (!c.stopCents) {
    return "A new position needs a written stop (stopCents): the price at which the thesis is wrong, not the price at which you get impatient.";
  }
  const minBps = minStopDistanceBps(c.weeklyBps, c.safetyStopPct);
  const distBps = Math.round(((c.priceCents - c.stopCents) / c.priceCents) * 10_000);
  if (distBps < minBps) {
    const floor = Math.floor(c.priceCents * (1 - minBps / 10_000));
    const why =
      c.weeklyBps != null && 2 * c.weeklyBps > c.safetyStopPct * 100
        ? `two normal weekly moves (a week here is ~${(c.weeklyBps / 100).toFixed(1)}%)`
        : `the ${c.safetyStopPct}% safety stop`;
    return `Stop too tight: $${(c.stopCents / 100).toFixed(2)} is ${(distBps / 100).toFixed(1)}% below ~$${(c.priceCents / 100).toFixed(2)}; the members' rule is no closer than ${why} = ${(minBps / 100).toFixed(1)}% → a stop at or below $${(floor / 100).toFixed(2)}. A stop is for losses, never for impatience.`;
  }
  return null;
}

/** The members' rules, as Alfred reads them in his context. */
export function standingRulesText(cap: number, safetyStopPct: number): string {
  return [
    `New stocks: at most ${cap} new names in any rolling 7 days${cap > STARTERS.perWeek ? ` (this is the first week of the run; ${STARTERS.perWeek} after)` : ""}. Top-ups never count.`,
    `Minimum first buy: a new position is at least US$${(MIN_FIRST_BUY_USD_CENTS / 100).toLocaleString("en-US")} at entry; top-ups have no minimum.`,
    `Stop width on a new position: your written stop sits no closer than two normal weekly moves or the ${safetyStopPct}% safety stop, whichever is wider. A stop is for losses, never for impatience.`,
    `VOO is parking, not a position: it is outside the new-stock limit, the minimum, the stop rule, the round-trip rule and your rotation score.`,
    `Put and call walls are timing colour only (where an order might fill), never a reason to buy, sell or hold.`,
  ]
    .map((l) => `- ${l}`)
    .join("\n");
}

/** The once-a-day idle-cash question (Q5, stage 5 of the prompt audit). */
export const IDLE_CASH_SLOT = "11:00";
export function idleCashQuestion(reason: string): string {
  if (!reason.includes(`scheduled ${IDLE_CASH_SLOT}`)) return "";
  return `
8. **Today's idle-cash question (the members ask it once a day; answer it in writing).** In your check-in note, under a heading **Idle cash**, answer for each currency leg: is cash sitting there without a reason? Does any holding deserve a top-up today, and why or why not? "No" is a fine answer when it has a reason. This is a question, not a quota: never buy just to answer it.`;
}
