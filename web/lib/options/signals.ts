import type { OptChain, OptContract } from "./cboe";

// Derived options-positioning signals — computed by us from the CBOE chain (no vendor). Each is a
// SIGNAL about the underlying, never a verdict. Plain-English meaning lives next to each field; the
// stock-page panel + glossary explain them for non-options readers (the literacy pillar).
export type OptionsSignals = {
  spotCents: number;
  // Put/Call ratios — > 1 = more puts (defensive/bearish lean or hedging); < 1 = call-heavy (bullish/greedy).
  pcOI: number | null; // by open interest (standing positioning)
  pcVol: number | null; // by today's volume (fresh flow)
  // Net dealer Gamma EXposure ($ that dealers must trade per 1% move). POSITIVE ⇒ dealers dampen
  // moves → range-bound / "pinned"; NEGATIVE ⇒ dealers amplify → trendy / volatile. Calls +, puts −.
  netGex: number;
  regime: "positive" | "negative";
  // Strikes where dealer gamma is heaviest — act like magnets/resistance (call wall) & support (put wall).
  callWallCents: number | null;
  putWallCents: number | null;
  // ~30-day at-the-money implied vol (the market's expected swing) in bps, and 25-delta SKEW
  // (downside-put IV − upside-call IV) in bps — positive skew = the market is paying up for crash protection.
  atmIvBps: number | null;
  skewBps: number | null;
  // Raw aggregates (transparency — every number explainable).
  totalCallOI: number;
  totalPutOI: number;
  totalCallVol: number;
  totalPutVol: number;
  contracts: number; // live (OI>0) contracts the signals were computed over
};

const sum = (a: OptContract[], f: (c: OptContract) => number) => a.reduce((s, c) => s + f(c), 0);

// Pick a representative expiry for IV/skew: the nearest one at least ~14 days out (skip 0-7DTE noise)
// that has meaningful OI. Falls back to the highest-OI expiry if none qualify.
function representativeExpiry(live: OptContract[]): string | null {
  const now = Date.now();
  const byExp = new Map<string, { oi: number; days: number }>();
  for (const c of live) {
    const days = (Date.parse(`${c.expiry}T20:00:00Z`) - now) / 86_400_000;
    const e = byExp.get(c.expiry) ?? { oi: 0, days };
    e.oi += c.oi;
    byExp.set(c.expiry, e);
  }
  const entries = [...byExp.entries()].filter(([, v]) => v.oi > 0);
  if (entries.length === 0) return null;
  const eligible = entries.filter(([, v]) => v.days >= 14).sort((a, b) => a[1].days - b[1].days);
  if (eligible.length) return eligible[0][0];
  return entries.sort((a, b) => b[1].oi - a[1].oi)[0][0];
}

export function computeOptionsSignals(chain: OptChain): OptionsSignals {
  const spot = chain.spotCents;
  const spot$ = spot / 100;
  const live = chain.contracts.filter((c) => c.oi > 0);
  const calls = live.filter((c) => c.type === "C");
  const puts = live.filter((c) => c.type === "P");

  const totalCallOI = sum(calls, (c) => c.oi);
  const totalPutOI = sum(puts, (c) => c.oi);
  const totalCallVol = sum(calls, (c) => c.volume);
  const totalPutVol = sum(puts, (c) => c.volume);

  // Net GEX over near-money strikes (0.8–1.2 × spot): gamma × OI × 100 × spot$² × 0.01, calls +, puts −.
  const nm = live.filter((c) => c.strikeCents > 0.8 * spot && c.strikeCents < 1.2 * spot);
  const netGex = nm.reduce((s, c) => s + c.gamma * c.oi * 100 * spot$ * spot$ * 0.01 * (c.type === "C" ? 1 : -1), 0);

  // Walls — the strike with the largest gamma×OI on each side (where hedging pressure concentrates).
  const wall = (a: OptContract[]): number | null => {
    let best: OptContract | null = null;
    let bestV = 0;
    for (const c of a) {
      const v = c.gamma * c.oi;
      if (v > bestV) {
        bestV = v;
        best = c;
      }
    }
    return best ? best.strikeCents : null;
  };

  // ATM IV + 25-delta skew from a representative ~monthly expiry.
  let atmIvBps: number | null = null;
  let skewBps: number | null = null;
  const exp = representativeExpiry(live);
  if (exp) {
    const inExp = live.filter((c) => c.expiry === exp && c.iv > 0);
    const expCalls = inExp.filter((c) => c.type === "C");
    const expPuts = inExp.filter((c) => c.type === "P");
    // ATM = strike nearest spot (avg of the call + put IV there).
    const nearest = (a: OptContract[]) => a.reduce<OptContract | null>((b, c) => (!b || Math.abs(c.strikeCents - spot) < Math.abs(b.strikeCents - spot) ? c : b), null);
    const atmC = nearest(expCalls);
    const atmP = nearest(expPuts);
    const atmIvs = [atmC?.iv, atmP?.iv].filter((v): v is number => typeof v === "number" && v > 0);
    if (atmIvs.length) atmIvBps = Math.round((atmIvs.reduce((s, v) => s + v, 0) / atmIvs.length) * 10_000);
    // 25-delta skew = IV(put @ |delta|≈0.25) − IV(call @ delta≈0.25), in bps.
    const byDelta = (a: OptContract[], target: number) =>
      a.reduce<OptContract | null>((b, c) => (!b || Math.abs(Math.abs(c.delta) - target) < Math.abs(Math.abs(b.delta) - target) ? c : b), null);
    const p25 = byDelta(expPuts, 0.25);
    const c25 = byDelta(expCalls, 0.25);
    if (p25 && c25 && p25.iv > 0 && c25.iv > 0) skewBps = Math.round((p25.iv - c25.iv) * 10_000);
  }

  return {
    spotCents: spot,
    pcOI: totalCallOI > 0 ? totalPutOI / totalCallOI : null,
    pcVol: totalCallVol > 0 ? totalPutVol / totalCallVol : null,
    netGex,
    regime: netGex >= 0 ? "positive" : "negative",
    callWallCents: wall(calls),
    putWallCents: wall(puts),
    atmIvBps,
    skewBps,
    totalCallOI,
    totalPutOI,
    totalCallVol,
    totalPutVol,
    contracts: live.length,
  };
}
