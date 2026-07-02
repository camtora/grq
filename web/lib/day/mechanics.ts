// Day-trading mechanics for the Day-Trading Lab (docs/DAY-TRADE-LAB.md, D103). Pure (no I/O), integer
// cents, whole shares (rule #4) — trivially testable and the lessons are locked. MODELED, never
// executable; the live fund is code-blocked from same-day round trips (§6). The whole point is to make
// the STRUCTURAL DRAG of day trading visible: you buy at the ask, sell at the bid (crossing the spread),
// and pay a commission on every fill — so a churner starts every round trip underwater vs a holder.

/** Buy fills at the ask (fall back to mid if the ask is missing/zero). */
export function buyFillCents(askCents: number, midCents: number): number {
  return askCents > 0 ? askCents : midCents;
}

/** Sell fills at the bid (fall back to mid if the bid is missing/zero). */
export function sellFillCents(bidCents: number, midCents: number): number {
  return bidCents > 0 ? bidCents : midCents;
}

/** The hidden spread cost of a fill vs the mid, over the whole order (a teaching stat). Never negative. */
export function spreadCostCents(fillCents: number, midCents: number, shares: number): number {
  return Math.max(0, Math.round(Math.abs(fillCents - midCents) * shares));
}

/** A book's equity: cash + shares marked at the mid (neutral — the fill-time spread already bit). */
export function equityCents(cashCents: number, shares: number, midCents: number): number {
  return cashCents + shares * midCents;
}

/** Realized P&L on a sell, net of the sell commission: shares × (bid − avgCost) − commission. */
export function sellRealizedCents(shares: number, avgCostCents: number, sellFill: number, commissionCents: number): number {
  return shares * (sellFill - avgCostCents) - commissionCents;
}

/** New weighted-average cost (price only) after adding `addShares` at `fillCents` to `heldShares`. */
export function newAvgCostCents(heldShares: number, avgCostCents: number, addShares: number, fillCents: number): number {
  const total = heldShares + addShares;
  return total > 0 ? Math.round((heldShares * avgCostCents + addShares * fillCents) / total) : fillCents;
}

/** A book's bottom line — equity minus what it started with. This inherently nets ALL fees + spread,
 *  so it's the honest verdict for the Trader-vs-Holder scoreboard. */
export function bottomLineCents(equity: number, startingCashCents: number): number {
  return equity - startingCashCents;
}
