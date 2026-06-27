// Option pricing for the Options Desk sandbox (docs/THE-OPTIONS-DESK.md). All per-share, cents.
// We price/mark a SPECIFIC contract two ways, in order:
//   1. CBOE delayed mid — (bid+ask)/2 when both are present (a real, if ~15-min-delayed, premium).
//   2. Black-Scholes from the contract's IV — when the contract has no quote (illiquid / zero bid).
// At/after expiry a contract is worth only its INTRINSIC value. This is MODELED, not executable —
// the desk never trades real options. Keep this pure (no I/O) so it's trivially testable.
import type { OptChain, OptContract } from "./cboe";

// Standard-normal CDF via an Abramowitz-Stegun erf approximation (no dependency).
function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp(-(x * x) / 2);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

const RISK_FREE = 0.045; // flat US risk-free; the desk is a sandbox, an exact curve isn't the point.

/** Whole calendar days from `now` to an YYYY-MM-DD expiry (UTC midnight). Negative once expired. */
export function daysToExpiry(expiry: string, now: Date): number {
  const exp = Date.parse(`${expiry}T20:00:00Z`); // ~16:00 ET close
  return Math.round((exp - now.getTime()) / (24 * 60 * 60 * 1000));
}

/** Intrinsic value (per share, cents) of a CALL/PUT at a given spot. Never negative. */
export function intrinsicCents(right: "CALL" | "PUT", spotCents: number, strikeCents: number): number {
  return Math.max(0, right === "CALL" ? spotCents - strikeCents : strikeCents - spotCents);
}

/** Black-Scholes per-share premium (cents). S/K/out in cents; iv a fraction; T in years. */
export function blackScholesCents(right: "CALL" | "PUT", spotCents: number, strikeCents: number, iv: number, tYears: number): number {
  const S = spotCents / 100;
  const K = strikeCents / 100;
  if (S <= 0 || K <= 0) return 0;
  if (tYears <= 0 || iv <= 0) return intrinsicCents(right, spotCents, strikeCents); // no time/vol → intrinsic
  const sqrtT = Math.sqrt(tYears);
  const d1 = (Math.log(S / K) + (RISK_FREE + (iv * iv) / 2) * tYears) / (iv * sqrtT);
  const d2 = d1 - iv * sqrtT;
  const disc = Math.exp(-RISK_FREE * tYears);
  const px = right === "CALL" ? S * normCdf(d1) - K * disc * normCdf(d2) : K * disc * normCdf(-d2) - S * normCdf(-d1);
  return Math.max(0, Math.round(px * 100));
}

/** Mark a known contract to a per-share premium (cents): CBOE mid, else last, else Black-Scholes. */
export function markContractCents(c: OptContract, spotCents: number, now: Date): number {
  if (c.bidCents > 0 && c.askCents > 0) return Math.round((c.bidCents + c.askCents) / 2);
  if (c.lastCents > 0) return c.lastCents;
  const right = c.type === "C" ? "CALL" : "PUT";
  const tYears = Math.max(0, daysToExpiry(c.expiry, now) / 365);
  return blackScholesCents(right, spotCents, c.strikeCents, c.iv, tYears);
}

/** Find a contract in a chain by right/strike/expiry (for marking an already-held position). */
export function findContract(chain: OptChain, right: "CALL" | "PUT", strikeCents: number, expiry: string): OptContract | null {
  const t = right === "CALL" ? "C" : "P";
  return chain.contracts.find((c) => c.type === t && c.strikeCents === strikeCents && c.expiry === expiry) ?? null;
}

/** DETERMINISTIC contract selection — the experiment's control (docs §3.4). Given a right + a coarse
 *  bias, pick ONE concrete contract: nearest monthly expiry in [minDte,maxDte] (fallback: nearest
 *  with ≥minDte, else the furthest available), then the strike nearest the bias target:
 *    ATM          → |delta| ~0.50 (≈ at the money)
 *    SLIGHTLY_OTM → |delta| ~0.35 (a cheaper, more leveraged out-of-the-money strike)
 *  Falls back to strike-distance when the chain lacks deltas. Returns null if nothing priceable. */
export function pickContract(
  chain: OptChain,
  right: "CALL" | "PUT",
  bias: "ATM" | "SLIGHTLY_OTM",
  now: Date,
  minDte = 30,
  maxDte = 60,
): OptContract | null {
  const t = right === "CALL" ? "C" : "P";
  const pool = chain.contracts.filter((c) => c.type === t && daysToExpiry(c.expiry, now) >= 1);
  if (pool.length === 0) return null;

  // Choose the expiry.
  const expiries = [...new Set(pool.map((c) => c.expiry))].map((e) => ({ e, dte: daysToExpiry(e, now) }));
  const inWindow = expiries.filter((x) => x.dte >= minDte && x.dte <= maxDte).sort((a, b) => a.dte - b.dte);
  const atLeast = expiries.filter((x) => x.dte >= minDte).sort((a, b) => a.dte - b.dte);
  const expiry = (inWindow[0] ?? atLeast[0] ?? expiries.sort((a, b) => b.dte - a.dte)[0]).e;

  const leg = pool.filter((c) => c.expiry === expiry);
  const targetDelta = bias === "ATM" ? 0.5 : 0.35;
  const haveDeltas = leg.some((c) => Math.abs(c.delta) > 0);
  if (haveDeltas) {
    return leg.reduce((best, c) => (Math.abs(Math.abs(c.delta) - targetDelta) < Math.abs(Math.abs(best.delta) - targetDelta) ? c : best));
  }
  // No deltas → use strike distance from spot (ATM = nearest; OTM = ~6% away in the right direction).
  const target = bias === "ATM" ? chain.spotCents : right === "CALL" ? chain.spotCents * 1.06 : chain.spotCents * 0.94;
  return leg.reduce((best, c) => (Math.abs(c.strikeCents - target) < Math.abs(best.strikeCents - target) ? c : best));
}
