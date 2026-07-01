// Payoff/P&L engine for the options education portal (docs/OPTIONS-PORTAL.md). Given a strategy's
// legs (option and/or stock), compute the profit/loss at any underlying price — at expiry OR at an
// earlier date (the Black-Scholes "today" curve) — plus break-even(s), max profit, max loss, and the
// net debit/credit. Pure (no I/O) → testable + client-safe. Integer cents end-to-end (rule #4); greeks
// live in ./greeks. This is MODELED and educational — the fund never trades options.
import { intrinsicCents, blackScholesCents } from "./price";

export type OptionLeg = {
  kind: "CALL" | "PUT";
  action: "BUY" | "SELL";
  qty: number; // contracts
  strikeCents: number;
  premiumCents: number; // per-share premium PAID (buy) or RECEIVED (sell) at entry
  multiplier?: number; // default 100
  ivFrac?: number; // implied vol, fraction — only needed for the pre-expiry "today" curve
  dteAtEntry?: number; // days to expiry at entry — the "today" curve rolls forward from here
};
export type StockLeg = {
  kind: "STOCK";
  action: "BUY" | "SELL";
  qty: number; // shares
  entryCents: number; // entry price per share
};
export type Leg = OptionLeg | StockLeg;

const mult = (l: OptionLeg) => l.multiplier ?? 100;

/** Per-share modeled premium of an option leg at `daysLeft` days to expiry, holding its IV fixed.
 *  daysLeft ≤ 0 (or no IV) → intrinsic value, i.e. the at-expiry payoff. */
export function modeledPremiumCents(leg: OptionLeg, spotCents: number, daysLeft: number): number {
  if (daysLeft <= 0 || !leg.ivFrac || leg.ivFrac <= 0) return intrinsicCents(leg.kind, spotCents, leg.strikeCents);
  return blackScholesCents(leg.kind, spotCents, leg.strikeCents, leg.ivFrac, daysLeft / 365);
}

/** P/L (cents) of a single leg at a given spot, `daysLeft` days before expiry. */
export function legPnlAt(leg: Leg, spotCents: number, daysLeft: number): number {
  if (leg.kind === "STOCK") {
    const move = spotCents - leg.entryCents;
    return (leg.action === "BUY" ? move : -move) * leg.qty;
  }
  const now = modeledPremiumCents(leg, spotCents, daysLeft);
  const perShare = leg.action === "BUY" ? now - leg.premiumCents : leg.premiumCents - now;
  return perShare * mult(leg) * leg.qty;
}

/** Total strategy P/L (cents) at a spot. `daysLeft = 0` (default) = at expiry. */
export function pnlAt(legs: Leg[], spotCents: number, daysLeft = 0): number {
  return legs.reduce((s, l) => s + legPnlAt(l, spotCents, daysLeft), 0);
}

/** Net upfront cash: positive = DEBIT (you pay), negative = CREDIT (you receive). */
export function netDebitCents(legs: Leg[]): number {
  let c = 0;
  for (const l of legs) {
    if (l.kind === "STOCK") c += (l.action === "BUY" ? 1 : -1) * l.qty * l.entryCents;
    else c += (l.action === "BUY" ? 1 : -1) * l.qty * mult(l) * l.premiumCents;
  }
  return c;
}

/** Cash a cash-secured short put must set aside (Σ strike × 100 × contracts over short puts). 0 otherwise. */
export function reservedCashCents(legs: Leg[]): number {
  let c = 0;
  for (const l of legs) if (l.kind === "PUT" && l.action === "SELL") c += l.strikeCents * mult(l) * l.qty;
  return c;
}

const strikesOf = (legs: Leg[]) => legs.filter((l): l is OptionLeg => l.kind !== "STOCK").map((l) => l.strikeCents);

/** The spot range to CHART: a band around the spot and every strike (±~60%), floored at 0. */
export function spotDomain(legs: Leg[], spotCents: number): { lo: number; hi: number } {
  const pts = [spotCents, ...strikesOf(legs)].filter((x) => x > 0);
  const max = Math.max(...pts, spotCents);
  const min = Math.min(...pts, spotCents);
  return { lo: Math.max(0, Math.round(min * 0.4)), hi: Math.round(max * 1.6) };
}

/** The spot range for MAX/MIN/BREAK-EVEN math: the full [0, ~2.5×] so a put's max profit (at spot→0)
 *  and the far tails are captured, not just the chart's zoom band. */
function statsDomain(legs: Leg[], spotCents: number): { lo: number; hi: number } {
  const max = Math.max(spotCents, ...strikesOf(legs));
  return { lo: 0, hi: Math.round(max * 2.5) };
}

/** Break-even spot price(s) in cents — where the at-expiry P/L crosses zero. Found by scanning the
 *  payoff on a fine grid and linearly interpolating each sign change. */
export function breakevensCents(legs: Leg[], spotCents: number): number[] {
  const { lo, hi } = statsDomain(legs, spotCents);
  const N = 2000;
  const step = (hi - lo) / N;
  const out: number[] = [];
  let prevS = lo;
  let prevP = pnlAt(legs, lo, 0);
  for (let i = 1; i <= N; i++) {
    const s = lo + i * step;
    const p = pnlAt(legs, s, 0);
    if (prevP === 0) out.push(Math.round(prevS));
    else if ((prevP < 0 && p > 0) || (prevP > 0 && p < 0)) {
      out.push(Math.round(prevS + (0 - prevP) * ((s - prevS) / (p - prevP))));
    }
    prevS = s;
    prevP = p;
  }
  // De-dup near-identical crossings (within a cent or two from grid rounding).
  return out.filter((v, i) => i === 0 || Math.abs(v - out[i - 1]) > 2);
}

/** Slope of the at-expiry payoff far to the RIGHT of every strike (spot → ∞), in cents of P/L per cent
 *  of spot. >0 ⇒ unlimited upside; <0 ⇒ unlimited loss on a rally (a naked short call). */
function rightTailSlope(legs: Leg[]): number {
  let m = 0;
  for (const l of legs) {
    if (l.kind === "STOCK") m += l.action === "BUY" ? l.qty : -l.qty;
    else if (l.kind === "CALL") m += (l.action === "BUY" ? 1 : -1) * mult(l) * l.qty; // calls gain slope above strike
    // puts are worthless far above their strike → slope 0
  }
  return m;
}

export type PayoffStats = {
  netDebitCents: number; // + pay / − receive
  maxProfitCents: number | null; // null = unlimited
  maxLossCents: number | null; // null = unlimited
  breakevensCents: number[];
};

/** Headline numbers for a strategy, evaluated at expiry. maxProfit/maxLoss are null when unbounded. */
export function payoffStats(legs: Leg[], spotCents: number): PayoffStats {
  const { lo, hi } = statsDomain(legs, spotCents);
  const N = 1000;
  const step = (hi - lo) / N;
  let maxP = -Infinity;
  let minP = Infinity;
  for (let i = 0; i <= N; i++) {
    const p = pnlAt(legs, lo + i * step, 0);
    if (p > maxP) maxP = p;
    if (p < minP) minP = p;
  }
  const slope = rightTailSlope(legs);
  return {
    netDebitCents: netDebitCents(legs),
    maxProfitCents: slope > 0 ? null : Math.round(maxP),
    maxLossCents: slope < 0 ? null : Math.round(minP),
    breakevensCents: breakevensCents(legs, spotCents),
  };
}

/** Sample the payoff curve for charting: `points` at-expiry P/L, and (if any option carries IV/DTE) a
 *  `today` curve `daysLeft` days before expiry. Returns spot/pnl pairs in cents. */
export function payoffCurve(
  legs: Leg[],
  spotCents: number,
  daysLeft: number,
  samples = 160,
): { lo: number; hi: number; expiry: { s: number; p: number }[]; today: { s: number; p: number }[] | null } {
  const { lo, hi } = spotDomain(legs, spotCents);
  const step = (hi - lo) / samples;
  const expiry: { s: number; p: number }[] = [];
  const hasModel = daysLeft > 0 && legs.some((l) => l.kind !== "STOCK" && l.ivFrac && l.ivFrac > 0);
  const today: { s: number; p: number }[] | null = hasModel ? [] : null;
  for (let i = 0; i <= samples; i++) {
    const s = lo + i * step;
    expiry.push({ s, p: pnlAt(legs, s, 0) });
    if (today) today.push({ s, p: pnlAt(legs, s, daysLeft) });
  }
  return { lo, hi, expiry, today };
}
