// Financial Modeling Prep client (the paid fundamentals/search layer — Cam
// added the key 2026-06-15). Uses FMP's "stable" API (the v3/v4 endpoints went
// legacy Aug-2025). Every call is best-effort: a missing key or an error returns
// null/[] so the app degrades to Yahoo-only rather than breaking. The
// company-screener endpoint is gated on the current plan — don't wire it.

const BASE = "https://financialmodelingprep.com/stable";
const fmpKey = () => process.env.FMP_API_KEY ?? "";
export const fmpEnabled = () => fmpKey().length > 0;

async function fmpGet<T>(path: string): Promise<T | null> {
  const k = fmpKey();
  if (!k) return null;
  try {
    const sep = path.includes("?") ? "&" : "?";
    const r = await fetch(`${BASE}/${path}${sep}apikey=${k}`, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
    if (!r.ok) return null;
    const data = await r.json();
    // FMP returns { "Error Message": ... } for restricted/legacy endpoints.
    if (data && !Array.isArray(data) && typeof data === "object" && "Error Message" in data) return null;
    return data as T;
  } catch {
    return null;
  }
}

export type FmpMatch = {
  symbol: string;
  name: string;
  exchange: string; // e.g. NYSE, TSX, NASDAQ
  exchangeName: string; // full name
  currency: string;
};

/** Symbol search → multiple listings (the disambiguation: ANET → NYSE:ANET,
 *  not "invalid"). Crypto/empty rows dropped; exact-ticker matches first. */
export async function fmpSearch(query: string): Promise<FmpMatch[]> {
  const q = query.trim();
  if (!q) return [];
  const raw = await fmpGet<Array<{ symbol: string; name: string; exchange: string; exchangeFullName: string; currency: string }>>(
    `search-symbol?query=${encodeURIComponent(q)}`,
  );
  if (!Array.isArray(raw)) return [];
  const Q = q.toUpperCase();
  return raw
    .filter((d) => d.symbol && d.name && d.exchange && d.exchange.toUpperCase() !== "CRYPTO")
    .map((d) => ({
      symbol: d.symbol,
      name: d.name,
      exchange: d.exchange,
      exchangeName: d.exchangeFullName || d.exchange,
      currency: d.currency || "",
    }))
    .sort((a, b) => {
      // exact ticker first, then prefix matches, then the rest
      const score = (s: string) => (s.toUpperCase() === Q ? 0 : s.toUpperCase().startsWith(Q) ? 1 : 2);
      return score(a.symbol) - score(b.symbol);
    })
    .slice(0, 12);
}

export type FmpProfile = {
  symbol: string;
  companyName: string;
  marketCap: number;
  currency: string;
  exchange: string;
  sector: string | null;
  industry: string | null;
  country: string | null;
  priceCents: number | null;
};

export async function fmpProfile(symbol: string): Promise<FmpProfile | null> {
  const raw = await fmpGet<Array<Record<string, unknown>>>(`profile?symbol=${encodeURIComponent(symbol)}`);
  const p = Array.isArray(raw) ? raw[0] : null;
  if (!p) return null;
  const price = typeof p.price === "number" ? Math.round(p.price * 100) : null;
  return {
    symbol: String(p.symbol ?? symbol),
    companyName: String(p.companyName ?? ""),
    marketCap: typeof p.marketCap === "number" ? p.marketCap : 0,
    currency: String(p.currency ?? ""),
    exchange: String(p.exchange ?? ""),
    sector: (p.sector as string) || null,
    industry: (p.industry as string) || null,
    country: (p.country as string) || null,
    priceCents: price,
  };
}

export type FmpTargets = { consensusCents: number; highCents: number; lowCents: number; medianCents: number } | null;

/** Analyst price-target consensus (Wall Street's view, to set beside the agent's). */
export async function fmpPriceTarget(symbol: string): Promise<FmpTargets> {
  const raw = await fmpGet<Array<Record<string, number>>>(`price-target-consensus?symbol=${encodeURIComponent(symbol)}`);
  const t = Array.isArray(raw) ? raw[0] : null;
  if (!t || typeof t.targetConsensus !== "number") return null;
  const c = (n: number | undefined) => (typeof n === "number" ? Math.round(n * 100) : 0);
  return { consensusCents: c(t.targetConsensus), highCents: c(t.targetHigh), lowCents: c(t.targetLow), medianCents: c(t.targetMedian) };
}
