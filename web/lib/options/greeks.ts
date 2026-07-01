// Black-Scholes GREEKS for the options education portal (docs/OPTIONS-PORTAL.md). We already PRICE a
// contract in lib/options/price.ts; here we compute the sensitivities (delta/gamma/theta/vega) so the
// calculator can show them on ANY contract — even one CBOE doesn't quote — and roll the "today vs
// expiry" curves. Pure (no I/O), so it's trivially testable and client-safe. Greeks are analytics, not
// ledger money, so fractional values are fine here (rule #4 governs cents/shares in the books).
//
// Conventions (per share, like an options chain quotes them):
//   delta  — change in premium per $1 move in the underlying        (calls 0..1, puts −1..0)
//   gamma  — change in delta per $1 move                            (always ≥ 0 for a long option)
//   theta  — premium lost PER DAY from time passing ($/day)          (negative for a long option)
//   vega   — premium change per +1 percentage-point of IV ($/1%)     (always ≥ 0 for a long option)
// Inputs are cents (S/K) to match the rest of lib/options; outputs are in DOLLARS per share.

const RISK_FREE = 0.045; // flat US risk-free — matches lib/options/price.ts; an exact curve isn't the point.

// Standard-normal CDF (Abramowitz-Stegun) + PDF. Kept local so this module has no dependency on price.ts.
function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp(-(x * x) / 2);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}
function normPdf(x: number): number {
  return 0.3989422804014327 * Math.exp(-(x * x) / 2);
}

export type Greeks = { delta: number; gamma: number; theta: number; vega: number };

/** Per-share Black-Scholes greeks for a CALL/PUT. S/K in cents, iv a fraction (0.40 = 40%), T in years.
 *  At/after expiry (or zero vol) greeks collapse to the intrinsic step: delta is ±1 in-the-money else 0,
 *  everything else 0 — the honest limit, no NaNs. */
export function bsGreeks(right: "CALL" | "PUT", spotCents: number, strikeCents: number, iv: number, tYears: number): Greeks {
  const S = spotCents / 100;
  const K = strikeCents / 100;
  if (S <= 0 || K <= 0 || tYears <= 0 || iv <= 0) {
    const itm = right === "CALL" ? S > K : S < K;
    return { delta: itm ? (right === "CALL" ? 1 : -1) : 0, gamma: 0, theta: 0, vega: 0 };
  }
  const sqrtT = Math.sqrt(tYears);
  const d1 = (Math.log(S / K) + (RISK_FREE + (iv * iv) / 2) * tYears) / (iv * sqrtT);
  const d2 = d1 - iv * sqrtT;
  const disc = Math.exp(-RISK_FREE * tYears);
  const pdfD1 = normPdf(d1);

  const delta = right === "CALL" ? normCdf(d1) : normCdf(d1) - 1;
  const gamma = pdfD1 / (S * iv * sqrtT);
  const vega = (S * pdfD1 * sqrtT) / 100; // per +1 percentage point of IV
  // Theta per YEAR, then per day. Two terms: time-value bleed + the carry on the discounted strike.
  const bleed = -(S * pdfD1 * iv) / (2 * sqrtT);
  const carry = right === "CALL" ? -RISK_FREE * K * disc * normCdf(d2) : RISK_FREE * K * disc * normCdf(-d2);
  const theta = (bleed + carry) / 365;

  return { delta, gamma, theta, vega };
}

/** Net position greeks for a basket of legs, as SHARE-EQUIVALENT exposure (delta in shares, etc.).
 *  An option leg contributes per-share greek × multiplier × contracts × (BUY ? +1 : −1); a stock leg
 *  contributes only delta = ±qty. `daysLeft`/`iv` come from each option leg. */
export type GreekLeg =
  | { kind: "STOCK"; action: "BUY" | "SELL"; qty: number }
  | { kind: "CALL" | "PUT"; action: "BUY" | "SELL"; qty: number; strikeCents: number; multiplier?: number; ivFrac?: number; daysLeft?: number };

export function netGreeks(legs: GreekLeg[], spotCents: number): Greeks {
  const acc: Greeks = { delta: 0, gamma: 0, theta: 0, vega: 0 };
  for (const leg of legs) {
    const sign = leg.action === "BUY" ? 1 : -1;
    if (leg.kind === "STOCK") {
      acc.delta += sign * leg.qty;
      continue;
    }
    const mult = leg.multiplier ?? 100;
    const g = bsGreeks(leg.kind, spotCents, leg.strikeCents, leg.ivFrac ?? 0, Math.max(0, leg.daysLeft ?? 0) / 365);
    const scale = sign * mult * leg.qty;
    acc.delta += scale * g.delta;
    acc.gamma += scale * g.gamma;
    acc.theta += scale * g.theta;
    acc.vega += scale * g.vega;
  }
  return acc;
}
