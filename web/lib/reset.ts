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
