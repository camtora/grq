import { toYahoo } from "../universe";

// Delayed (~15 min) quotes — free, unofficial, feeds the sim only (D12).
// We hit Yahoo's crumb-free v8 chart endpoint with plain fetch: the
// yahoo-finance2 library's quote() needs a cookie+crumb dance that 429s from
// this host. One request per symbol, small concurrency, defensive parsing.

export type FetchedQuote = {
  symbol: string;
  bidCents: number;
  askCents: number;
  midCents: number;
  dayChangeBps: number;
  at: Date;
};

const SYNTH_SPREAD_BPS = 10; // bid/ask synthesized around the delayed last price
const CONCURRENCY = 4;
const TIMEOUT_MS = 10_000;

type ChartMeta = {
  symbol?: string;
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  previousClose?: number;
  regularMarketTime?: number; // epoch seconds
};

async function fetchOne(symbol: string): Promise<FetchedQuote | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    toYahoo(symbol),
  )}?interval=1d&range=2d`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      chart?: { result?: { meta?: ChartMeta }[] };
    };
    const meta = json.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice;
    if (!meta || typeof price !== "number" || !(price > 0)) return null;

    const mid = Math.round(price * 100);
    const half = Math.max(1, Math.round((mid * SYNTH_SPREAD_BPS) / 10_000 / 2));
    const prev = meta.chartPreviousClose ?? meta.previousClose;
    return {
      symbol: symbol.toUpperCase(),
      midCents: mid,
      bidCents: mid - half,
      askCents: mid + half,
      dayChangeBps:
        typeof prev === "number" && prev > 0 ? Math.round((price / prev - 1) * 10_000) : 0,
      at:
        typeof meta.regularMarketTime === "number"
          ? new Date(meta.regularMarketTime * 1000)
          : new Date(),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchYahooQuotes(symbols: string[]): Promise<FetchedQuote[]> {
  const wanted = [...new Set(symbols.map((s) => s.toUpperCase()))];
  const out: FetchedQuote[] = [];
  for (let i = 0; i < wanted.length; i += CONCURRENCY) {
    const batch = wanted.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(fetchOne));
    for (const q of results) if (q) out.push(q);
  }
  return out;
}
