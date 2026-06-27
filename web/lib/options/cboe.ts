// Tier 3 — Options positioning (D-options, Graham's ask). Source: CBOE's free, keyless,
// exchange-sourced delayed-quotes feed, which carries the full chain INCLUDING per-contract
// greeks (gamma/delta) + IV + OI + volume. We compute our own positioning signals from it
// (lib/options/signals.ts) — no vendor subscription. US-listed (OPRA) names only; a name CBOE
// doesn't carry → null (thin/no listed options, e.g. most Canadian single names). Data is ~15-min
// delayed / EOD-ish — fine for a daily-signal fund. The fund NEVER trades options (hard guardrail);
// this is only a SIGNAL about the underlying, fed in like everything else (an input, never the gate).
const BASE = "https://cdn.cboe.com/api/global/delayed_quotes/options";

export type OptContract = {
  type: "C" | "P";
  strikeCents: number; // strike price in cents
  expiry: string; // YYYY-MM-DD
  iv: number; // implied volatility, fraction (0.5283 = 52.83%)
  oi: number; // open interest (contracts)
  volume: number; // today's volume (contracts)
  delta: number; // signed (calls +, puts −)
  gamma: number; // per-share gamma
};
export type OptChain = { spotCents: number; contracts: OptContract[] };

// OCC option symbol → parts. e.g. "TSM260717C00400000" → call, 2026-07-17, strike $400.00.
// The trailing 6-digit date + C|P + 8-digit (strike×1000) is fixed-width; the root is the prefix.
function parseOcc(sym: string): { type: "C" | "P"; expiry: string; strikeCents: number } | null {
  const m = /(\d{6})([CP])(\d{8})$/.exec(sym);
  if (!m) return null;
  const [, ymd, cp, strikeRaw] = m;
  const expiry = `20${ymd.slice(0, 2)}-${ymd.slice(2, 4)}-${ymd.slice(4, 6)}`;
  const strikeCents = Math.round(parseInt(strikeRaw, 10) / 10); // strike×1000 → dollars (/1000) → cents (×100) = /10
  return { type: cp as "C" | "P", expiry, strikeCents };
}

/** Fetch + parse the full options chain for a BARE US ticker. null if CBOE doesn't carry it
 *  (no listed options / not US) or on any error — callers treat null as "no options coverage". */
export async function fetchOptionChain(bareTicker: string): Promise<OptChain | null> {
  const t = bareTicker.toUpperCase().trim();
  if (!t || !/^[A-Z.]{1,8}$/.test(t)) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(`${BASE}/${encodeURIComponent(t)}.json`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const d = (await res.json()) as { data?: { current_price?: number; close?: number; options?: unknown[] } };
    const data = d?.data;
    const spot = typeof data?.current_price === "number" ? data.current_price : typeof data?.close === "number" ? data.close : null;
    const opts = Array.isArray(data?.options) ? data!.options! : null;
    if (spot == null || spot <= 0 || !opts) return null;

    const contracts: OptContract[] = [];
    for (const raw of opts) {
      const o = raw as Record<string, unknown>;
      const p = parseOcc(String(o.option ?? ""));
      if (!p) continue;
      contracts.push({
        type: p.type,
        strikeCents: p.strikeCents,
        expiry: p.expiry,
        iv: Number(o.iv) || 0,
        oi: Number(o.open_interest) || 0,
        volume: Number(o.volume) || 0,
        delta: Number(o.delta) || 0,
        gamma: Number(o.gamma) || 0,
      });
    }
    if (contracts.length === 0) return null;
    return { spotCents: Math.round(spot * 100), contracts };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
