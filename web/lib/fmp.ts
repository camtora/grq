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

type RawMatch = { symbol: string; name: string; exchange: string; exchangeFullName: string; currency: string };

// Major North-American exchanges — surfaced above obscure global listings so a
// search for e.g. ANET leads with NYSE, not a Thai/Indian lookalike.
const PRIMARY_EXCHANGES = new Set(["NYSE", "NASDAQ", "AMEX", "TSX", "TSXV", "TSE", "NEO", "CBOE"]);

/** Symbol search → multiple listings (the disambiguation: ANET → NYSE:ANET,
 *  not "invalid"). Searches BOTH ticker and company NAME (so "Shopify" works,
 *  not just "SHOP"), merges + dedupes, drops crypto, and ranks exact ticker
 *  then North-American listings first. */
export async function fmpSearch(query: string): Promise<FmpMatch[]> {
  const q = query.trim();
  if (!q) return [];
  const Q = q.toUpperCase();
  const [bySymbol, byName] = await Promise.all([
    fmpGet<RawMatch[]>(`search-symbol?query=${encodeURIComponent(q)}`).catch(() => [] as RawMatch[]),
    fmpGet<RawMatch[]>(`search-name?query=${encodeURIComponent(q)}`).catch(() => [] as RawMatch[]),
  ]);
  const raw = [...(Array.isArray(bySymbol) ? bySymbol : []), ...(Array.isArray(byName) ? byName : [])];
  const seen = new Set<string>();
  return raw
    .filter((d) => d.symbol && d.name && d.exchange && d.exchange.toUpperCase() !== "CRYPTO")
    .map((d) => ({
      symbol: d.symbol,
      name: d.name,
      exchange: d.exchange,
      exchangeName: d.exchangeFullName || d.exchange,
      currency: d.currency || "",
    }))
    .filter((m) => {
      const k = `${m.symbol}|${m.exchange}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => {
      const ticker = (s: string) => (s.toUpperCase() === Q ? 0 : s.toUpperCase().startsWith(Q) ? 1 : 2);
      const t = ticker(a.symbol) - ticker(b.symbol);
      if (t !== 0) return t;
      return (PRIMARY_EXCHANGES.has(a.exchange.toUpperCase()) ? 0 : 1) - (PRIMARY_EXCHANGES.has(b.exchange.toUpperCase()) ? 0 : 1);
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
export const stripSuffix = (s: string) => s.replace(/\.(TO|V|NE|CN)$/i, "");

export type ScreenerRow = {
  symbol: string;
  name: string;
  priceCents: number | null;
  marketCapM: number | null;
  sector: string | null;
  exchange: string | null;
  country: string | null;
  currency: string | null;
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
    currency: (r.currency as string) || null,
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

export type EconEvent = { date: string; country: string; event: string; impact: string; previous: number | null; estimate: number | null };

// Upcoming high-impact US/CA macro events (FOMC, CPI, jobs, BoC decisions). FMP's
// global economic calendar is a firehose (every country, every print); we keep only
// what moves a North-American fund — US/CA, High impact. Forward-looking: feeds the
// agent's "upcoming catalysts" macro context (D81). Best-effort → [] on any error.
export async function fmpEconomicCalendar(from: string, to: string): Promise<EconEvent[]> {
  const raw = await fmpGet<Array<Record<string, unknown>>>(`economic-calendar?from=${from}&to=${to}`);
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e) => ({
      date: String(e.date ?? ""),
      country: String(e.country ?? ""),
      event: String(e.event ?? ""),
      impact: String(e.impact ?? ""),
      previous: typeof e.previous === "number" ? e.previous : null,
      estimate: typeof e.estimate === "number" ? e.estimate : null,
    }))
    .filter((e) => e.date && e.event && (e.country === "US" || e.country === "CA") && e.impact === "High");
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

const numOrNull = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : null);

// --- Tier 6: earnings intelligence --------------------------------------------
export type FmpEarnings = {
  date: string; // YYYY-MM-DD
  upcoming: boolean;
  epsEstimated: number | null;
  epsActual: number | null;
  revenueEstimated: number | null;
  revenueActual: number | null;
};

/** Next earnings date + estimate (or the most recent result if none upcoming).
 *  Company-level + analyst-driven, so it covers cross-listed TSX names by their
 *  bare ticker. Tier 6. */
export async function fmpEarnings(symbol: string): Promise<FmpEarnings | null> {
  const raw = await fmpGet<Array<Record<string, unknown>>>(`earnings?symbol=${encodeURIComponent(stripSuffix(symbol))}&limit=8`);
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const today = new Date().toISOString().slice(0, 10);
  const rows = raw
    .map((r) => ({
      date: String(r.date ?? ""),
      epsEstimated: numOrNull(r.epsEstimated),
      epsActual: numOrNull(r.epsActual),
      revenueEstimated: numOrNull(r.revenueEstimated),
      revenueActual: numOrNull(r.revenueActual),
    }))
    .filter((r) => r.date);
  const upcoming = rows.filter((r) => r.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const past = rows.filter((r) => r.date < today).sort((a, b) => b.date.localeCompare(a.date));
  const pick = upcoming[0] ?? past[0];
  if (!pick) return null;
  return { ...pick, upcoming: pick.date >= today };
}

// Richer earnings for the stock page: BOTH the last reported quarter (actuals vs
// estimates → beat/miss) AND the next scheduled date. Same endpoint as fmpEarnings,
// just split into the two halves rather than picking one. Tier 6.
export type EarningsRow = { date: string; epsEstimated: number | null; epsActual: number | null; revenueEstimated: number | null; revenueActual: number | null };
export type FmpEarningsReport = { last: EarningsRow | null; next: EarningsRow | null };

export async function fmpEarningsReport(symbol: string): Promise<FmpEarningsReport | null> {
  const raw = await fmpGet<Array<Record<string, unknown>>>(`earnings?symbol=${encodeURIComponent(stripSuffix(symbol))}&limit=8`);
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const today = new Date().toISOString().slice(0, 10);
  const rows: EarningsRow[] = raw
    .map((r) => ({
      date: String(r.date ?? ""),
      epsEstimated: numOrNull(r.epsEstimated),
      epsActual: numOrNull(r.epsActual),
      revenueEstimated: numOrNull(r.revenueEstimated),
      revenueActual: numOrNull(r.revenueActual),
    }))
    .filter((r) => r.date);
  // "Last" = most recent quarter that has actuals filed; "next" = nearest upcoming
  // date not yet reported. A row reported today lands in "last", not "next".
  const last = rows.filter((r) => r.epsActual != null || r.revenueActual != null).sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
  const next = rows.filter((r) => r.date >= today && r.epsActual == null && r.revenueActual == null).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
  if (!last && !next) return null;
  return { last, next };
}

// Bulk earnings calendar across ALL companies in a date window — ONE call covers
// the whole tracked list, vs. a per-symbol fetch each. The Today page filters the
// result down to our universe∪watchlist. Same row shape as the per-symbol endpoint.
// (FMP's stable endpoint carries no before-open/after-close field, so we don't.) Tier 6.
export type EarningsCalRow = EarningsRow & { symbol: string };

export async function fmpEarningsCalendar(from: string, to: string): Promise<EarningsCalRow[]> {
  const raw = await fmpGet<Array<Record<string, unknown>>>(
    `earnings-calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => ({
      symbol: String(r.symbol ?? ""),
      date: String(r.date ?? ""),
      epsEstimated: numOrNull(r.epsEstimated),
      epsActual: numOrNull(r.epsActual),
      revenueEstimated: numOrNull(r.revenueEstimated),
      revenueActual: numOrNull(r.revenueActual),
    }))
    .filter((r) => r.symbol && r.date);
}

// --- Tier 7: per-stock news ---------------------------------------------------
export type StockNews = { title: string; publisher: string; url: string; at: string; image: string };

export async function fmpStockNews(symbol: string, limit = 5): Promise<StockNews[]> {
  const raw = await fmpGet<Array<Record<string, unknown>>>(`news/stock?symbols=${encodeURIComponent(stripSuffix(symbol))}&limit=${limit}`);
  if (!Array.isArray(raw)) return [];
  return raw
    .map((n) => ({
      title: String(n.title ?? ""),
      publisher: String(n.publisher ?? n.site ?? ""),
      url: String(n.url ?? ""),
      at: String(n.publishedDate ?? "").slice(0, 10),
      image: String(n.image ?? ""),
    }))
    .filter((n) => n.title);
}

// --- Tier 2 deepening: analyst rating breakdown -------------------------------
export type FmpGrades = { strongBuy: number; buy: number; hold: number; sell: number; strongSell: number; consensus: string; total: number };

export async function fmpGrades(symbol: string): Promise<FmpGrades | null> {
  const raw = await fmpGet<Array<Record<string, unknown>>>(`grades-consensus?symbol=${encodeURIComponent(stripSuffix(symbol))}`);
  const g = Array.isArray(raw) ? raw[0] : null;
  if (!g) return null;
  const n = (v: unknown) => (typeof v === "number" ? v : 0);
  const strongBuy = n(g.strongBuy), buy = n(g.buy), hold = n(g.hold), sell = n(g.sell), strongSell = n(g.strongSell);
  const total = strongBuy + buy + hold + sell + strongSell;
  if (total === 0) return null;
  return { strongBuy, buy, hold, sell, strongSell, consensus: String(g.consensus ?? ""), total };
}

// The latest analyst RATING ACTIONS behind the consensus — firm, what they did
// (upgrade/downgrade/maintain/initiate), and the old→new grade. Fleshes out the
// ratings panel with named receipts. Keyed to the US/primary listing like the rest
// of FMP's analyst coverage; date-desc from FMP, sliced to the freshest few.
export type FmpGradeAction = { date: string; company: string; action: string; fromGrade: string; toGrade: string };

export async function fmpGradeActions(symbol: string, limit = 4): Promise<FmpGradeAction[]> {
  const raw = await fmpGet<Array<Record<string, unknown>>>(`grades?symbol=${encodeURIComponent(stripSuffix(symbol))}`);
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => ({
      date: String(r.date ?? "").slice(0, 10),
      company: String(r.gradingCompany ?? "").trim(),
      action: String(r.action ?? "").toLowerCase().trim(),
      fromGrade: String(r.previousGrade ?? "").trim(),
      toGrade: String(r.newGrade ?? "").trim(),
    }))
    .filter((a) => a.date && a.company && a.toGrade)
    .slice(0, limit);
}

// Whether the analyst consensus is drifting bull/bear. grades-historical gives
// monthly buy/hold/sell snapshots; we compare the latest to ~3 months back and net
// the buy-side vs sell-side moves into a one-line direction. null if too thin.
export type FmpGradesTrend = { direction: "more bullish" | "more bearish" | "steady"; buyDelta: number; sellDelta: number; months: number };

export async function fmpGradesTrend(symbol: string): Promise<FmpGradesTrend | null> {
  const raw = await fmpGet<Array<Record<string, unknown>>>(`grades-historical?symbol=${encodeURIComponent(stripSuffix(symbol))}&limit=6`);
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const n = (v: unknown) => (typeof v === "number" ? v : 0);
  const bulls = (r: Record<string, unknown>) => n(r.analystRatingsStrongBuy) + n(r.analystRatingsBuy);
  const bears = (r: Record<string, unknown>) => n(r.analystRatingsSell) + n(r.analystRatingsStrongSell);
  // FMP returns these date-desc → index 0 is the latest snapshot.
  const latest = raw[0];
  const priorIdx = Math.min(3, raw.length - 1);
  const prior = raw[priorIdx];
  const buyDelta = bulls(latest) - bulls(prior);
  const sellDelta = bears(latest) - bears(prior);
  const net = buyDelta - sellDelta;
  const direction = net > 0 ? "more bullish" : net < 0 ? "more bearish" : "steady";
  return { direction, buyDelta, sellDelta, months: priorIdx };
}

// Whether Wall St.'s PRICE targets are climbing. price-target-summary gives avg
// targets + counts over rolling windows; we express the move as a currency-invariant
// % (last quarter vs last year) so it's valid for a CDR/TSX listing too. null if thin.
export type FmpTargetTrend = { changePct: number; recentCount: number; lastMonthCount: number };

export async function fmpTargetTrend(symbol: string): Promise<FmpTargetTrend | null> {
  const raw = await fmpGet<Array<Record<string, unknown>>>(`price-target-summary?symbol=${encodeURIComponent(stripSuffix(symbol))}`);
  const s = Array.isArray(raw) ? raw[0] : null;
  if (!s) return null;
  const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : 0);
  const recentAvg = num(s.lastQuarterAvgPriceTarget);
  const yearAvg = num(s.lastYearAvgPriceTarget);
  const recentCount = num(s.lastQuarterCount);
  if (recentAvg <= 0 || yearAvg <= 0 || recentCount === 0) return null;
  return { changePct: (recentAvg - yearAvg) / yearAvg, recentCount, lastMonthCount: num(s.lastMonthCount) };
}

// --- Live ticker quotes (FMP Ultimate batch-quote-short) ----------------------
// One call returns {symbol, price, change, volume} for many symbols — real-time
// for US; TSX freshness depends on FMP's exchange entitlement (verified live).
export type LiveQuote = { symbol: string; priceCents: number; changePct: number };

export async function fmpBatchQuotes(fmpSymbols: string[]): Promise<LiveQuote[]> {
  const list = [...new Set(fmpSymbols.map((s) => s.toUpperCase()).filter(Boolean))];
  if (list.length === 0) return [];
  const raw = await fmpGet<Array<Record<string, unknown>>>(`batch-quote-short?symbols=${encodeURIComponent(list.join(","))}`);
  if (!Array.isArray(raw)) return [];
  return raw
    .map((q) => {
      const price = typeof q.price === "number" ? q.price : null;
      const change = typeof q.change === "number" ? q.change : 0;
      const prev = price !== null ? price - change : null;
      return {
        symbol: String(q.symbol ?? ""),
        priceCents: price !== null ? Math.round(price * 100) : 0,
        changePct: prev && prev !== 0 ? (change / prev) * 100 : 0,
      };
    })
    .filter((q) => q.symbol && q.priceCents > 0);
}

// --- Tier 5: institutional ownership (13F summary) ----------------------------
// 13F covers US-traded securities, so it carries cross-listed TSX names (RY, SHOP)
// by their bare ticker — but NOT pure-Canadian issuers. Quarterly + ~45d lagged.
export type FmpInstitutional = {
  date: string;
  investorsHolding: number;
  investorsHoldingChange: number;
  shares: number;
  sharesChange: number;
};

export async function fmpInstitutional(symbol: string): Promise<FmpInstitutional | null> {
  const base = stripSuffix(symbol);
  // Walk back recent quarters in parallel (13F lags); take the freshest with data.
  const now = new Date();
  const cands: { year: number; quarter: number }[] = [];
  let y = now.getUTCFullYear();
  let q = Math.floor(now.getUTCMonth() / 3) + 1;
  for (let i = 0; i < 4; i++) {
    cands.push({ year: y, quarter: q });
    q -= 1;
    if (q < 1) { q = 4; y -= 1; }
  }
  const results = await Promise.all(
    cands.map((c) => fmpGet<Array<Record<string, unknown>>>(`institutional-ownership/symbol-positions-summary?symbol=${encodeURIComponent(base)}&year=${c.year}&quarter=${c.quarter}`)),
  );
  for (const raw of results) {
    const r = Array.isArray(raw) ? raw[0] : null;
    if (r && typeof r.investorsHolding === "number") {
      return {
        date: String(r.date ?? ""),
        investorsHolding: r.investorsHolding,
        investorsHoldingChange: typeof r.investorsHoldingChange === "number" ? r.investorsHoldingChange : 0,
        shares: typeof r.numberOf13Fshares === "number" ? r.numberOf13Fshares : 0,
        sharesChange: typeof r.numberOf13FsharesChange === "number" ? r.numberOf13FsharesChange : 0,
      };
    }
  }
  return null;
}

// The actual institutions behind that summary — the top holders of THIS symbol by
// position size, with the Q/Q change in their stake + how much of the company they
// own. Same 13F universe (US-listed, ~45-day lag); walks back recent quarters for
// the freshest filing with holders. Option (put/call) lines are dropped — share
// ownership only.
export type FmpHolder = { name: string; ownershipPct: number; sharesChangePct: number; isNew: boolean; marketValueUsd: number };

export async function fmpTopHolders(symbol: string, limit = 5): Promise<FmpHolder[]> {
  const base = stripSuffix(symbol);
  const now = new Date();
  const cands: { year: number; quarter: number }[] = [];
  let y = now.getUTCFullYear();
  let q = Math.floor(now.getUTCMonth() / 3) + 1;
  for (let i = 0; i < 4; i++) {
    cands.push({ year: y, quarter: q });
    q -= 1;
    if (q < 1) { q = 4; y -= 1; }
  }
  const results = await Promise.all(
    cands.map((c) =>
      fmpGet<Array<Record<string, unknown>>>(
        `institutional-ownership/extract-analytics/holder?symbol=${encodeURIComponent(base)}&year=${c.year}&quarter=${c.quarter}&page=0&limit=40`,
      ),
    ),
  );
  const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : 0);
  for (const raw of results) {
    if (!Array.isArray(raw) || raw.length === 0) continue;
    const holders = raw
      .map((r) => ({
        name: String(r.investorName ?? "").trim(),
        ownershipPct: num(r.ownership),
        sharesChangePct: num(r.changeInSharesNumberPercentage),
        isNew: r.isNew === true,
        marketValueUsd: num(r.marketValue),
        shares: num(r.sharesNumber),
        putCall: String(r.putCallShare ?? "").toLowerCase(),
      }))
      .filter((h) => h.name && h.shares > 0 && h.putCall !== "put" && h.putCall !== "call")
      .sort((a, b) => b.marketValueUsd - a.marketValueUsd)
      .slice(0, limit)
      .map(({ name, ownershipPct, sharesChangePct, isNew, marketValueUsd }) => ({ name, ownershipPct, sharesChangePct, isNew, marketValueUsd }));
    if (holders.length > 0) return holders;
  }
  return [];
}

// --- Smart Money: 13F holdings BY HOLDER (Tier 5) -----------------------------
// Unlike fmpInstitutional (one symbol, who-holds-it), these key off a manager's
// CIK to reconstruct their whole 13F portfolio. Quarterly + ~45-day lag; a symbol
// can appear as common + PUT + CALL line items (the options tell).
export type Fmp13FDate = { date: string; year: number; quarter: number };

export async function fmp13FDates(cik: string): Promise<Fmp13FDate[]> {
  const raw = await fmpGet<Array<Record<string, unknown>>>(`institutional-ownership/dates?cik=${encodeURIComponent(cik)}`);
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => ({ date: String(r.date ?? ""), year: Number(r.year ?? 0), quarter: Number(r.quarter ?? 0) }))
    .filter((r) => r.year && r.quarter);
}

export type Fmp13FHolding = { symbol: string; name: string; shares: number; valueUsd: number; putCall: "PUT" | "CALL" | null };

export async function fmp13FHoldings(cik: string, year: number, quarter: number): Promise<Fmp13FHolding[]> {
  // FMP paginates extract at 100/page; roster funds top out ~200 lines (ARK).
  const out: Fmp13FHolding[] = [];
  for (let page = 0; page < 6; page++) {
    const raw = await fmpGet<Array<Record<string, unknown>>>(
      `institutional-ownership/extract?cik=${encodeURIComponent(cik)}&year=${year}&quarter=${quarter}&page=${page}`,
    );
    if (!Array.isArray(raw) || raw.length === 0) break;
    for (const r of raw) {
      const sym = String(r.symbol ?? "").toUpperCase();
      if (!sym) continue;
      const pc = String(r.putCallShare ?? "").toUpperCase();
      out.push({
        symbol: sym,
        name: String(r.nameOfIssuer ?? sym),
        shares: typeof r.shares === "number" ? r.shares : 0,
        valueUsd: typeof r.value === "number" ? r.value : 0,
        putCall: pc === "PUT" ? "PUT" : pc === "CALL" ? "CALL" : null,
      });
    }
    if (raw.length < 100) break;
  }
  return out;
}

export type Fmp13FSummary = {
  date: string;
  investorName: string;
  portfolioSize: number;
  marketValueUsd: number;
  securitiesAdded: number;
  securitiesRemoved: number;
  perf1yPct: number | null;
};

export async function fmp13FSummary(cik: string): Promise<Fmp13FSummary | null> {
  const raw = await fmpGet<Array<Record<string, unknown>>>(`institutional-ownership/holder-performance-summary?cik=${encodeURIComponent(cik)}&page=0`);
  const r = Array.isArray(raw) ? raw[0] : null;
  if (!r) return null;
  const n = (v: unknown) => (typeof v === "number" ? v : null);
  return {
    date: String(r.date ?? ""),
    investorName: String(r.investorName ?? ""),
    portfolioSize: n(r.portfolioSize) ?? 0,
    marketValueUsd: n(r.marketValue) ?? 0,
    securitiesAdded: n(r.securitiesAdded) ?? 0,
    securitiesRemoved: n(r.securitiesRemoved) ?? 0,
    perf1yPct: n(r.performancePercentage1year),
  };
}

// --- Smart Money: congressional trades ----------------------------------------
// senate-latest / house-latest share a shape. Amounts are disclosed as RANGES.
export type FmpPoliticalTrade = {
  symbol: string;
  memberId: string;
  memberName: string;
  district: string;
  assetName: string;
  type: string; // "Purchase" | "Sale" | "Sale (Partial)" | "Exchange"
  amountRange: string;
  txnDate: string;
  disclosureDate: string;
  link: string;
};

function mapPolitical(raw: unknown): FmpPoliticalTrade[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => {
      const first = String(r.firstName ?? "").trim();
      const last = String(r.lastName ?? "").trim();
      return {
        symbol: String(r.symbol ?? "").toUpperCase(),
        memberId: String(r.senateID ?? r.houseID ?? ""),
        memberName: String(r.office ?? "").trim() || [first, last].filter(Boolean).join(" "),
        district: String(r.district ?? ""),
        assetName: String(r.assetDescription ?? ""),
        type: String(r.type ?? ""),
        amountRange: String(r.amount ?? ""),
        txnDate: String(r.transactionDate ?? ""),
        disclosureDate: String(r.disclosureDate ?? ""),
        link: String(r.link ?? ""),
      };
    })
    .filter((t) => t.symbol && t.type);
}

async function fmpPoliticalLatest(endpoint: "senate-latest" | "house-latest", pages: number): Promise<FmpPoliticalTrade[]> {
  const out: FmpPoliticalTrade[] = [];
  for (let p = 0; p < pages; p++) {
    const batch = mapPolitical(await fmpGet<unknown>(`${endpoint}?page=${p}&limit=100`));
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

export const fmpSenateLatest = (pages = 3) => fmpPoliticalLatest("senate-latest", pages);
export const fmpHouseLatest = (pages = 3) => fmpPoliticalLatest("house-latest", pages);

// A specific member's trades by last name (the "latest" feeds only carry the most
// recent disclosures chronologically, so infrequent filers like Pelosi never
// appear there — we fetch tracked members by name). Checks both chambers.
export async function fmpCongressByName(lastName: string): Promise<Array<{ chamber: "senate" | "house"; trade: FmpPoliticalTrade }>> {
  const [house, senate] = await Promise.all([
    fmpGet<unknown>(`house-trades-by-name?name=${encodeURIComponent(lastName)}`).catch(() => null),
    fmpGet<unknown>(`senate-trades-by-name?name=${encodeURIComponent(lastName)}`).catch(() => null),
  ]);
  return [
    ...mapPolitical(house).map((trade) => ({ chamber: "house" as const, trade })),
    ...mapPolitical(senate).map((trade) => ({ chamber: "senate" as const, trade })),
  ];
}

// --- Smart Money: insider Form 4 ----------------------------------------------
// insider-trading/latest returns ALL Form-4 lines; the "top buys" board filters
// to open-market PURCHASES (transactionType "P-Purchase"), not option exercises.
export type FmpInsiderTrade = {
  symbol: string;
  reportingName: string;
  typeOfOwner: string;
  transactionType: string;
  acquiredDisposed: string; // "A" | "D"
  shares: number;
  price: number;
  txnDate: string;
  filingDate: string;
  url: string;
};

export async function fmpInsiderLatest(pages = 4): Promise<FmpInsiderTrade[]> {
  const out: FmpInsiderTrade[] = [];
  for (let p = 0; p < pages; p++) {
    const raw = await fmpGet<Array<Record<string, unknown>>>(`insider-trading/latest?page=${p}&limit=100`);
    if (!Array.isArray(raw) || raw.length === 0) break;
    for (const r of raw) {
      const sym = String(r.symbol ?? "").toUpperCase();
      if (!sym) continue;
      out.push({
        symbol: sym,
        reportingName: String(r.reportingName ?? ""),
        typeOfOwner: String(r.typeOfOwner ?? ""),
        transactionType: String(r.transactionType ?? ""),
        acquiredDisposed: String(r.acquisitionOrDisposition ?? ""),
        shares: typeof r.securitiesTransacted === "number" ? r.securitiesTransacted : 0,
        price: typeof r.price === "number" ? r.price : 0,
        txnDate: String(r.transactionDate ?? ""),
        filingDate: String(r.filingDate ?? ""),
        url: String(r.url ?? ""),
      });
    }
    if (raw.length < 100) break;
  }
  return out;
}

// --- Market indices + commodities strip (Today's "live until close" ticker) -----
// Index levels / commodity prices are reference figures, not fund money — kept as
// plain numbers (not cents). FMP batch-quote-short serves all of these.
export type IndexQuote = { symbol: string; label: string; price: number; change: number; changePct: number };

const INDEX_DEFS: { symbol: string; label: string }[] = [
  { symbol: "^GSPTSE", label: "TSX Comp" },
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "^DJI", label: "DJIA" },
  { symbol: "^IXIC", label: "NASDAQ" },
  { symbol: "GCUSD", label: "Gold (USD)" },
  { symbol: "CLUSD", label: "Oil (USD)" },
];

export async function fmpIndices(): Promise<IndexQuote[]> {
  const raw = await fmpGet<Array<Record<string, unknown>>>(
    `batch-quote-short?symbols=${encodeURIComponent(INDEX_DEFS.map((d) => d.symbol).join(","))}`,
  );
  const by = new Map<string, { price: number; change: number }>();
  if (Array.isArray(raw)) {
    for (const q of raw) {
      const s = String(q.symbol ?? "");
      const price = typeof q.price === "number" ? q.price : null;
      const change = typeof q.change === "number" ? q.change : 0;
      if (s && price !== null) by.set(s, { price, change });
    }
  }
  return INDEX_DEFS.flatMap((d) => {
    const v = by.get(d.symbol);
    if (!v) return [];
    const prev = v.price - v.change;
    return [{ symbol: d.symbol, label: d.label, price: v.price, change: v.change, changePct: prev !== 0 ? (v.change / prev) * 100 : 0 }];
  });
}
