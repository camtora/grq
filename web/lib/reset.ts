import type { PlaceOrderInput } from "./broker/types";

// D138 — the paper-account reset (docs/DECISIONS.md D138; the runbook is in the review doc). On the
// day the members sell the book flat THROUGH THE APP, every sell tagged "reset": the fills then exist
// (reconcile sees sells, not vanished shares, so the reset-detection guard stays quiet) and the
// agent's track record, the weekly review's grading and the retro leave them out. A flatten done in
// the IBKR portal would do neither. Pure planner here; the route that places the orders owns the I/O.

export const RESET_TAG = "reset" as const;

export function resetReason(day: string): string {
  return `Paper-account reset (D138, ${day}): the members flatten the book before the IBKR balance reset. Not a portfolio decision — excluded from the agent's record.`;
}

export type FlattenPosition = { symbol: string; qty: number };

/** One market SELL per open stock position, placed by the member, tagged. Zero and fractional
 *  quantities are skipped; the agent can never be the placer of a reset. */
export function planFlatten(positions: FlattenPosition[], placedBy: string, day: string): PlaceOrderInput[] {
  if (placedBy === "agent" || placedBy === "system-stop" || !placedBy.includes("@")) {
    throw new Error("a reset flatten is placed by a member, never by the agent");
  }
  return positions
    .filter((p) => Number.isInteger(p.qty) && p.qty > 0)
    .sort((a, b) => a.symbol.localeCompare(b.symbol))
    .map((p) => ({ symbol: p.symbol, side: "SELL" as const, type: "MARKET" as const, qty: p.qty, placedBy, reason: resetReason(day), tag: RESET_TAG }));
}

// ----- the reset day itself (2026-10-22): the pause, the guards, and the notes -----

/** The named reason the agent is paused for the reset. It rides the limit-quiet skip
 *  (AgentState.limitQuietUntil) through this entry point, never a faked limit error: every Claude
 *  session is skipped, the tick (quotes, reconcile, finalize, stops) keeps running, the order path
 *  stays open for the members' tagged sells. Lifted from the same panel on day 1 (Monday). */
export const RESET_PAUSE_REASON = "D138 maintenance pause — the paper-account reset (a human lifts it)";

export function isResetPause(reason: string | null | undefined): boolean {
  return !!reason && reason.startsWith("D138 maintenance pause");
}

export type FlattenGuardState = {
  killSwitch: boolean;
  paused: boolean;
  marketOpen: boolean;
  running: boolean;
  openPositions: number;
};

/** Why a flatten may not start right now, or null when it may. The order of the runbook is
 *  enforced here: the agent is paused FIRST (so no check-in trades into the sells), the kill switch
 *  is OFF (it blocks the members' orders too), the market is open (market sells), nothing else is
 *  mid-flight, and there is something to sell. Pure. */
export function flattenRefusal(s: FlattenGuardState): string | null {
  if (s.running) return "A flatten is already running — watch it finish.";
  if (s.openPositions === 0) return "The book is already flat — nothing to sell.";
  if (!s.paused) return "Pause Alfred first (step 1): a check-in must not trade into the sells.";
  if (s.killSwitch) return "The kill switch is on — it blocks every order, yours included. It goes on AFTER the flatten.";
  if (!s.marketOpen) return "The market is closed — these are market sells; run it between 9:30 and 16:00 ET.";
  return null;
}

export type FlattenNoteInput = {
  symbol: string;
  qty: number;
  avgCostCents: number;
  currency: string;
  fillPriceCents: number | null;
  day: string;
  by: string;
};

const money = (cents: number, ccy: string) => `${ccy === "USD" ? "US$" : "C$"}${(cents / 100).toFixed(2)}`;

/** The per-name SYSTEM note written at the flatten, so every later session reads the exit as
 *  housekeeping. Mirrors the June 26 notes ("Position cleared by IBKR paper reset — X (not a thesis
 *  exit)") but says the truth of this reset: the members SOLD it, tagged, on purpose. */
export function flattenNote(i: FlattenNoteInput): { title: string; body: string } {
  const sym = i.symbol.toUpperCase();
  const moved = i.fillPriceCents && i.avgCostCents > 0 ? ((i.fillPriceCents - i.avgCostCents) / i.avgCostCents) * 100 : null;
  return {
    title: `Position closed for the paper-account reset — ${sym} (not a thesis exit)`,
    body:
      `On ${i.day} the fund's ${sym} position (${i.qty} sh, entry ACB ${money(i.avgCostCents, i.currency)}) was SOLD by ${i.by} as part of the planned paper-account reset (D138): ` +
      `a market sell tagged "reset", placed by a member, not by the agent. ` +
      (i.fillPriceCents ? `Filled at ${money(i.fillPriceCents, i.currency)}${moved !== null ? ` (${moved >= 0 ? "+" : ""}${moved.toFixed(1)}% vs entry)` : ""}. ` : "Fill pending at the broker. ") +
      `This exit carries NO signal about ${sym}: no thesis was confirmed or broken, no stop fired, no target was hit. ` +
      `Do NOT score it as a win or a loss, do NOT grade the ${sym} thesis or its sources on it, and do NOT write a RETRO for it. ` +
      `The dossier, the call and the universe status stand; the name may be bought again on its own merits from the new baseline.`,
  };
}

/** The fund-level LESSON written once, after the flatten, so the weekend retro excludes the day. */
export function flattenLesson(day: string, symbols: string[], by: string): { title: string; body: string } {
  const list = symbols.map((s) => s.toUpperCase()).sort().join(", ");
  return {
    title: `Operational close, not a thesis exit — the book was sold flat for the paper-account reset (${day})`,
    body:
      `${day}: ${by} sold the whole book flat — ${symbols.length} positions (${list}) — ahead of the planned IBKR paper-account reset and the launch rehearsal from a clean US$50,000 baseline (D138). ` +
      `Every sell is tagged "reset" and placed by a member. None is a thesis exit, a stop, a hit target or a verdict on the name. ` +
      `For the weekend RETRO and every future session: EXCLUDE every closure dated ${day} from performance attribution, source grading and the track record; write no RETRO for them. ` +
      `Treat the fund as a clean slate from the restart forward; score only positions opened from the new baseline. The dossiers, calls, lessons and universe are unchanged.`,
  };
}
