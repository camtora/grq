// Option pricing for the mobile options learning page — the pure slice of
// web/lib/options/price.ts (the CBOE-chain helpers stay web-side; the phone only
// needs intrinsic + Black-Scholes for the calculator). Per-share, cents. MODELED,
// educational — the fund never trades options.

// Standard-normal CDF via an Abramowitz-Stegun erf approximation (no dependency).
function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp(-(x * x) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

const RISK_FREE = 0.045; // flat US risk-free; a sandbox, an exact curve isn't the point.

/** Intrinsic value (per share, cents) of a CALL/PUT at a given spot. Never negative. */
export function intrinsicCents(right: 'CALL' | 'PUT', spotCents: number, strikeCents: number): number {
  return Math.max(0, right === 'CALL' ? spotCents - strikeCents : strikeCents - spotCents);
}

/** Black-Scholes per-share premium (cents). S/K/out in cents; iv a fraction; T in years. */
export function blackScholesCents(right: 'CALL' | 'PUT', spotCents: number, strikeCents: number, iv: number, tYears: number): number {
  const S = spotCents / 100;
  const K = strikeCents / 100;
  if (S <= 0 || K <= 0) return 0;
  if (tYears <= 0 || iv <= 0) return intrinsicCents(right, spotCents, strikeCents); // no time/vol → intrinsic
  const sqrtT = Math.sqrt(tYears);
  const d1 = (Math.log(S / K) + (RISK_FREE + (iv * iv) / 2) * tYears) / (iv * sqrtT);
  const d2 = d1 - iv * sqrtT;
  const disc = Math.exp(-RISK_FREE * tYears);
  const px = right === 'CALL' ? S * normCdf(d1) - K * disc * normCdf(d2) : K * disc * normCdf(-d2) - S * normCdf(-d1);
  return Math.max(0, Math.round(px * 100));
}
