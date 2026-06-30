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

/** Fee-aware edge gate: expected edge (cents) must clear feeEdgeMultiple × round-trip commissions. */
export function breachesFeeEdge(edgeCents: number, commInCents: number, commOutCents: number, feeEdgeMultiple: number): boolean {
  return edgeCents < feeEdgeMultiple * (commInCents + commOutCents);
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
