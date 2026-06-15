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

// FMP keys analyst coverage to the US/primary listing, not the .TO ticker, so we
// strip the exchange suffix before asking.
const stripSuffix = (s: string) => s.replace(/\.(TO|V|NE|CN)$/i, "");

export type ScreenerRow = {
  symbol: string;
  name: string;
  priceCents: number | null;
  marketCapM: number | null;
  sector: string | null;
  exchange: string | null;
  country: string | null;
  isEtf: boolean;
};

// Market-wide screener (FMP Ultimate). Browse the whole market by exchange /
// sector / country / cap. Caps in actual dollars (the FMP param unit).
export async function fmpScreener(opts: {
  exchange?: string;
  sector?: string;
  country?: string;
  marketCapMoreThan?: number;
  marketCapLowerThan?: number;
  limit?: number;
}): Promise<ScreenerRow[]> {
  const p = new URLSearchParams();
  if (opts.exchange) p.set("exchange", opts.exchange);
  if (opts.sector) p.set("sector", opts.sector);
  if (opts.country) p.set("country", opts.country);
  if (opts.marketCapMoreThan) p.set("marketCapMoreThan", String(opts.marketCapMoreThan));
  if (opts.marketCapLowerThan) p.set("marketCapLowerThan", String(opts.marketCapLowerThan));
  p.set("isActivelyTrading", "true");
  p.set("limit", String(opts.limit ?? 50));
  const raw = await fmpGet<Array<Record<string, unknown>>>(`company-screener?${p.toString()}`);
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => ({
    symbol: String(r.symbol ?? ""),
    name: String(r.companyName ?? ""),
    priceCents: typeof r.price === "number" ? Math.round(r.price * 100) : null,
    marketCapM: typeof r.marketCap === "number" ? Math.round(r.marketCap / 1_000_000) : null,
    sector: (r.sector as string) || null,
    exchange: (r.exchangeShortName as string) || (r.exchange as string) || null,
    country: (r.country as string) || null,
    isEtf: r.isEtf === true,
  }));
}

export type NewsItem = { title: string; publisher: string; url: string; at: string; image: string };

// Latest general market news (the Stocks-tab pulse + the Today brief's top stories).
export async function fmpNews(limit = 8): Promise<NewsItem[]> {
  const raw = await fmpGet<Array<Record<string, unknown>>>(`news/general-latest?limit=${limit}`);
  if (!Array.isArray(raw)) return [];
  return raw
    .map((n) => ({
      title: String(n.title ?? ""),
      publisher: String(n.publisher ?? n.site ?? ""),
      url: String(n.url ?? ""),
      at: String(n.publishedDate ?? ""),
      image: String(n.image ?? ""),
    }))
    .filter((n) => n.title);
}

export type Mover = { symbol: string; name: string; changePct: number; priceCents: number; exchange: string };

// The day's biggest market movers (gainers) — the Today brief's "top performers".
export async function fmpGainers(): Promise<Mover[]> {
  const raw = await fmpGet<Array<Record<string, unknown>>>(`biggest-gainers`);
  if (!Array.isArray(raw)) return [];
  return raw
    .map((m) => ({
      symbol: String(m.symbol ?? ""),
      name: String(m.name ?? ""),
      changePct: typeof m.changesPercentage === "number" ? m.changesPercentage / 100 : 0,
      priceCents: typeof m.price === "number" ? Math.round(m.price * 100) : 0,
      exchange: String(m.exchange ?? ""),
    }))
    .filter((m) => m.symbol)
    .slice(0, 6);
}

export type PeerStat = {
  symbol: string;
  name: string;
  peTtm: number | null;
  pbTtm: number | null;
  marketCapM: number | null;
  self: boolean;
};

// Valuation vs peers (Graham's ask). Peers come from FMP's stock-peers (keyed to
// the US/primary listing); P/E and P/B are ratios so they compare cleanly across
// currencies. Bounded to a few peers + parallel ratio calls to keep it light.
export async function fmpPeerComparison(symbol: string): Promise<PeerStat[]> {
  const base = stripSuffix(symbol);
  const peersRaw = await fmpGet<Array<{ symbol: string; companyName: string; mktCap: number }>>(
    `stock-peers?symbol=${encodeURIComponent(base)}`,
  );
  const peers = Array.isArray(peersRaw) ? peersRaw.slice(0, 4) : [];
  if (peers.length === 0) return [];
  const symbols = [base, ...peers.map((p) => p.symbol)];
  const ratios = await Promise.all(
    symbols.map((s) => fmpGet<Array<Record<string, number>>>(`ratios-ttm?symbol=${encodeURIComponent(s)}`)),
  );
  const nameBy = new Map(peers.map((p) => [p.symbol, p.companyName]));
  const capBy = new Map(peers.map((p) => [p.symbol, p.mktCap]));
  return symbols.map((s, i) => {
    const r = Array.isArray(ratios[i]) ? ratios[i]![0] : null;
    const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : null);
    const cap = capBy.get(s);
    return {
      symbol: s,
      name: i === 0 ? "" : nameBy.get(s) ?? s,
      peTtm: num(r?.priceToEarningsRatioTTM),
      pbTtm: num(r?.priceToBookRatioTTM),
      marketCapM: typeof cap === "number" ? Math.round(cap / 1_000_000) : null,
      self: i === 0,
    };
  });
}

export type FmpAnalyst = {
  upsidePct: number; // consensus vs the US-listing price — CURRENCY-INVARIANT, so it's valid for the TSX listing too
  consensusCents: number; // in the listing's own currency
  highCents: number;
  lowCents: number;
  currency: string;
};

/** Analyst price-target consensus + the implied upside, as an outside check on
 *  the agent's call. The % is computed against the same listing's price, which
 *  makes it currency-invariant (a +13% target is +13% in CAD or USD). */
export async function fmpAnalystTarget(symbol: string): Promise<FmpAnalyst | null> {
  const base = stripSuffix(symbol);
  const [tgt, prof] = await Promise.all([
    fmpGet<Array<Record<string, number>>>(`price-target-consensus?symbol=${encodeURIComponent(base)}`),
    fmpGet<Array<Record<string, unknown>>>(`profile?symbol=${encodeURIComponent(base)}`),
  ]);
  const t = Array.isArray(tgt) ? tgt[0] : null;
  const p = Array.isArray(prof) ? prof[0] : null;
  const usPrice = p && typeof p.price === "number" ? (p.price as number) : 0;
  if (!t || typeof t.targetConsensus !== "number" || usPrice <= 0) return null;
  const c = (n: number | undefined) => (typeof n === "number" ? Math.round(n * 100) : 0);
  return {
    upsidePct: (t.targetConsensus - usPrice) / usPrice,
    consensusCents: c(t.targetConsensus),
    highCents: c(t.targetHigh),
    lowCents: c(t.targetLow),
    currency: String((p?.currency as string) ?? "USD"),
  };
}
