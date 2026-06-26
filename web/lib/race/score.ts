// The Race — per-call scoring (pure, no I/O). A "call" is one model's BUY/SELL proposal with a
// price snapshot taken at call time (entryPriceCents, native ccy). We mark it to the live price
// and compute what it WOULD have made — for every model on identical hypothetical terms (no fills,
// no slippage, no gate). A SELL is scored DIRECTIONALLY: it profits when the price falls, as if the
// model had shorted or sidestepped the move. HOLD/NONE aren't directional bets and don't score.

export type RaceCall = {
  action: string | null;
  entryPriceCents: number | null;
  entryCurrency: string | null;
  qty: number | null;
};

export type CallScore = {
  pnlNativeCents: number; // native-currency P&L (entryCurrency)
  returnBps: number; // signed directional return, basis points (size-agnostic)
  isGreen: boolean; // direction was right
};

/** Score one call against a mark price (both in the call's native ccy). Returns null when the
 *  call isn't a priceable directional bet (HOLD/NONE, missing entry, missing mark). */
export function scoreCall(call: RaceCall, markCents: number | null): CallScore | null {
  const { action, entryPriceCents } = call;
  if (action !== "BUY" && action !== "SELL") return null;
  if (entryPriceCents == null || entryPriceCents <= 0 || markCents == null || markCents <= 0) return null;
  const qty = call.qty && call.qty > 0 ? call.qty : 1; // unsized call still scores as a 1-share bet
  const dir = action === "BUY" ? 1 : -1;
  const moveCents = (markCents - entryPriceCents) * dir;
  return {
    pnlNativeCents: moveCents * qty,
    returnBps: Math.round((moveCents / entryPriceCents) * 10000),
    isGreen: moveCents > 0,
  };
}

/** The benchmark's (XIC) return in bps from a call's entry date to the current mark — the bar a
 *  call is measured against. Finds the last close on/before entryAt; if the call predates our
 *  history, anchors on the oldest close we have. Null when we can't price the benchmark. */
export function benchmarkReturnBps(
  closes: { date: Date; closeCents: number }[],
  nowCents: number | null,
  entryAt: Date,
): number | null {
  if (nowCents == null || nowCents <= 0 || closes.length === 0) return null;
  let base: number | null = null;
  for (const c of closes) {
    if (c.date.getTime() <= entryAt.getTime()) base = c.closeCents;
    else break;
  }
  if (base == null) base = closes[0].closeCents; // entry predates our bars → oldest anchor
  if (base <= 0) return null;
  return Math.round(((nowCents - base) / base) * 10000);
}
