// Lognormal terminal-price probabilities for the options calculator (docs/OPTIONS-PORTAL.md). Educational
// only. We use a DRIFTLESS lognormal (drift 0, vol = implied vol) — answering "where could the stock
// realistically land?", not pricing a risk-neutral expectation. Pure (no I/O), cents in. These are
// rough odds from one number (IV); they are not a forecast.
import { pnlAt, type Leg } from "./payoff";

function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp(-(x * x) / 2);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}
function normPdf(x: number): number {
  return 0.3989422804014327 * Math.exp(-(x * x) / 2);
}

/** P(S_T ≥ price) under a driftless lognormal — the chance the stock is at/above `priceCents` by the
 *  horizon. At/before zero time (or zero vol) it's a step at the current spot. */
export function probAbove(spotCents: number, priceCents: number, ivFrac: number, tYears: number): number {
  if (spotCents <= 0 || priceCents <= 0) return 0;
  if (tYears <= 0 || ivFrac <= 0) return spotCents >= priceCents ? 1 : 0;
  const sd = ivFrac * Math.sqrt(tYears);
  const d = (Math.log(spotCents / priceCents) - 0.5 * sd * sd) / sd;
  return normCdf(d);
}

/** Probability the strategy is profitable at expiry — the lognormal mass over the underlying prices
 *  where the at-expiry P/L is positive. Integrated in z-space (Gauss-spaced), so it works for any of
 *  the four strategies regardless of how many break-evens they have. */
export function probOfProfit(legs: Leg[], spotCents: number, ivFrac: number, tYears: number): number {
  if (spotCents <= 0) return 0;
  if (tYears <= 0 || ivFrac <= 0) return pnlAt(legs, spotCents, 0) > 0 ? 1 : 0;
  const sd = ivFrac * Math.sqrt(tYears);
  const drift = -0.5 * sd * sd;
  const spot$ = spotCents / 100;
  const N = 600;
  let total = 0;
  let profit = 0;
  for (let i = 0; i <= N; i++) {
    const z = -5 + (10 * i) / N;
    const w = normPdf(z);
    const s$ = spot$ * Math.exp(drift + sd * z);
    const p = pnlAt(legs, Math.round(s$ * 100), 0);
    total += w;
    if (p > 0) profit += w;
  }
  return total > 0 ? profit / total : 0;
}
