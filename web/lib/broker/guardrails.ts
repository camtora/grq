// Pure §6 guardrail math — the deterministic thresholds the money path enforces, extracted from
// agent/validator.ts (the agent's pre-trade gate) and lib/broker/sim.ts (the engine's whole-share
// rule) so they are single-sourced and regression-locked by unit tests (test/guardrails.test.ts).
// NO I/O: every input is a plain number/flag the caller has already fetched from the DB/quote/portfolio.
// The callers pass live values in; these functions only answer the yes/no rule question. Keeping the
// EXACT same arithmetic as the original inline expressions is the whole point — change the math here
// and a test fails, instead of the gate quietly weakening.
//
// Convention: a `breaches*` function returns true when the order VIOLATES the rule (→ reject).

/** Rule #4: a tradeable quantity is a positive whole number of shares — no fractional, no zero/negative.
 *  (Also catches NaN/Infinity, which are not integers.) */
export function isValidQty(qty: number): boolean {
  return Number.isInteger(qty) && qty > 0;
}

/** Conviction gate (Graham): a BUY needs ≥ minBuyConfidence. An unstated (non-number) confidence fails. */
export function meetsConviction(confidence: number | undefined, minBuyConfidence: number): boolean {
  return typeof confidence === "number" && confidence >= minBuyConfidence;
}

/** Position-size cap: would the post-buy position value (CAD) exceed maxPositionPct of NAV? */
export function breachesPositionCap(newPosValueCadCents: number, navCents: number, maxPositionPct: number): boolean {
  return newPosValueCadCents > (navCents * maxPositionPct) / 100;
}

/** Cash floor: would cash after the buy (CAD) fall below cashFloorPct of NAV? */
export function breachesCashFloor(cashAfterCadCents: number, navCents: number, cashFloorPct: number): boolean {
  return cashAfterCadCents < (navCents * cashFloorPct) / 100;
}

/** Funding / no-margin (guardrail #3): an order's native-currency cost (qty·price + commission) must be
 *  covered by cash IN THAT SAME CURRENCY. Returns the shortfall in native cents — a positive value means
 *  the order is underfunded (→ reject); ≤ 0 means it's covered. The agent can't move money between
 *  currencies itself, so a shortfall routes to a member FX approval (request_fx). */
export function fundingShortfallCents(qty: number, priceCents: number, commissionCents: number, cashCents: number): number {
  return qty * priceCents + commissionCents - cashCents;
}

/** Rule #3 (no shorting): a SELL may never exceed the shares actually held. Returns the shortfall in
 *  SHARES — positive means the order would open/deepen a short (→ reject); ≤ 0 means it's covered.
 *
 *  `heldQty` must be the EFFECTIVE holding, not a raw mirror read: see effectiveHeldQty() in
 *  ./positions. On 2026-07-16 a CCO stop re-fired five times against a position mirror that had gone
 *  stale behind the fills, selling 24 shares each time and leaving the paper account short 96 — the
 *  sim engine has enforced this rule inline since day one, but the check was never ported to the IBKR
 *  adapter the fund actually trades through. Both callers now share this function. */
export function shortingShortfallQty(sellQty: number, heldQty: number): number {
  return sellQty - heldQty;
}

/** Fee-aware edge gate: expected edge (cents) must clear feeEdgeMultiple × round-trip commissions. */
export function breachesFeeEdge(edgeCents: number, commInCents: number, commOutCents: number, feeEdgeMultiple: number): boolean {
  return edgeCents < feeEdgeMultiple * (commInCents + commOutCents);
}

/** Monthly fee budget (§6, a hard stop): month-to-date commissions plus THIS order's must stay within
 *  the budget. Returns true when it BREACHES (→ reject).
 *
 *  `orderCommissionCents` is a pre-trade ESTIMATE — on the IBKR path the true fill price isn't known
 *  yet, so the estimate must err high (see ibkrFixedCommissionCents' absent-price branch). A gate fed
 *  a flattering fee is a gate that never fires: until 2026-07-16 this check existed only in sim.ts,
 *  and the fund had been trading through the IBKR adapter — where nothing read the budget at all —
 *  while every MARKET order booked $0.01 against a real ~$1.00 (D118). */
export function breachesFeeBudget(spentCents: number, orderCommissionCents: number, budgetCents: number): boolean {
  return spentCents + orderCommissionCents > budgetCents;
}

/** Options premium-at-risk cap (D99 — buy-to-open only, so premium = MAX LOSS). The total premium
 *  paid (qty·multiplier·perSharePremium + commission, valued in CAD) must not exceed maxPremiumPct
 *  of NAV. Returns true when it BREACHES (→ reject). This is the option analog of breachesPositionCap,
 *  but sized on the premium-at-risk (the real loss bound) rather than notional. */
export function breachesOptionPremiumCap(premiumCadCents: number, navCents: number, maxPremiumPct: number): boolean {
  return premiumCadCents > (navCents * maxPremiumPct) / 100;
}

/** The dollar premium (cents) of an option order: contracts × shares-per-contract × per-share premium.
 *  Pure helper so the sizing/funding math is single-sourced and unit-tested (no floats — rule #4). */
export function optionPremiumCents(contracts: number, multiplier: number, perSharePremiumCents: number): number {
  return contracts * multiplier * perSharePremiumCents;
}

/** Cash already committed to RESTING BUY limit orders — the money the fund has promised
 *  but not yet spent. Pure; currency-agnostic (callers sum per currency).
 *
 *  Why this exists (2026-09-23): the cash floor computed `cashAfter = cash - cost` and
 *  ignored open orders entirely, so cash already promised to a resting GTC buy counted as
 *  spendable. NOTE the honest bound: the cash floor ALREADY prevents an overdraw whenever
 *  the floor amount exceeds total commitments — on the day this was written, NAV $65.3k
 *  and a 2% floor left $1,306 untouchable against a $990 resting TD bid, so both filling
 *  still landed at +$316. The exposure is real but CONDITIONAL: it bites when committed
 *  cash exceeds the floor headroom (several resting orders, a looser dial, or a smaller
 *  NAV), which is exactly when nobody is watching. This is defence in depth and honest
 *  accounting — a commitment already made is not spendable cash — not a live incident.
 *
 *  MARKET orders never rest (they fill or reject), so only priced limits count. */
export function committedCashCents(
  resting: { qty: number; limitPriceCents: number | null }[],
  commissionFor: (qty: number, priceCents: number) => number,
): number {
  let total = 0;
  for (const o of resting) {
    const px = o.limitPriceCents ?? 0;
    if (px <= 0 || o.qty <= 0) continue;
    total += o.qty * px + commissionFor(o.qty, px);
  }
  return total;
}
