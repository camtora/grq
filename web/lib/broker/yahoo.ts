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
  shortName?: string;
  longName?: string;
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  previousClose?: number;
  regularMarketTime?: number; // epoch seconds
};

async function fetchOne(symbol: string): Promise<FetchedQuote | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    await toYahoo(symbol),
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

/** Probe an explicit Yahoo symbol (used by the add-ticker flow to discover
 *  the right suffix). Returns price + best-effort name, or null. */
export async function probeYahooSymbol(
  yahooSymbol: string,
): Promise<{ priceCents: number; name: string | null } | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=2d`,
      { headers: { "User-Agent": "Mozilla/5.0" }, signal: ctrl.signal },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { chart?: { result?: { meta?: ChartMeta }[] } };
    const meta = json.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice;
    if (!meta || typeof price !== "number" || !(price > 0)) return null;
    return { priceCents: Math.round(price * 100), name: meta.shortName ?? meta.longName ?? null };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export type FetchedBar = {
  date: Date; // ET trading day at UTC midnight
  openCents: number;
  highCents: number;
  lowCents: number;
  closeCents: number;
  volume: number;
};

function etDayUtc(epochSeconds: number): Date {
  const s = new Date(epochSeconds * 1000).toLocaleDateString("en-CA", {
    timeZone: "America/Toronto",
  });
  return new Date(`${s}T00:00:00.000Z`);
}

/** Daily OHLCV history from the same crumb-free chart endpoint. */
export async function fetchDailyBars(symbol: string, range = "1y"): Promise<FetchedBar[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    await toYahoo(symbol),
  )}?interval=1d&range=${range}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: ctrl.signal });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      chart?: {
        result?: {
          timestamp?: number[];
          indicators?: {
            quote?: {
              open?: (number | null)[];
              high?: (number | null)[];
              low?: (number | null)[];
              close?: (number | null)[];
              volume?: (number | null)[];
            }[];
          };
        }[];
      };
    };
    const r = json.chart?.result?.[0];
    const ts = r?.timestamp ?? [];
    const q = r?.indicators?.quote?.[0];
    if (!q) return [];
    const out: FetchedBar[] = [];
    for (let i = 0; i < ts.length; i++) {
      const o = q.open?.[i];
      const h = q.high?.[i];
      const l = q.low?.[i];
      const c = q.close?.[i];
      if (![o, h, l, c].every((v) => typeof v === "number" && v > 0)) continue;
      out.push({
        date: etDayUtc(ts[i]),
        openCents: Math.round((o as number) * 100),
        highCents: Math.round((h as number) * 100),
        lowCents: Math.round((l as number) * 100),
        closeCents: Math.round((c as number) * 100),
        volume: Math.min(2_000_000_000, Math.max(0, Math.round(q.volume?.[i] ?? 0))),
      });
    }
    return out;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// t = ms epoch · c = close in cents · session = which trading session the bar fell in.
// `pre`/`post` are extended hours (US names; greyed on the chart), `regular` is 9:30–16:00.
export type IntradaySession = "pre" | "regular" | "post";
export type IntradayPoint = { t: number; c: number; session: IntradaySession };

/** Today's intraday line (1-min closes for the current session) for the stock-page
 *  chart's "1D" range. `includePrePost=true` pulls extended-hours bars too; each bar is
 *  tagged pre/regular/post off Yahoo's own regular-session window (meta.currentTradingPeriod
 *  — no DST/exchange-hours math) so the chart can grey the extended portion. Returns [] on
 *  any failure — the caller falls back to the daily series. */
export async function fetchIntradayBars(symbol: string): Promise<IntradayPoint[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    await toYahoo(symbol),
  )}?interval=1m&range=1d&includePrePost=true`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: ctrl.signal });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      chart?: {
        result?: {
          timestamp?: number[];
          meta?: { currentTradingPeriod?: { regular?: { start?: number; end?: number } } };
          indicators?: { quote?: { close?: (number | null)[] }[] };
        }[];
      };
    };
    const r = json.chart?.result?.[0];
    const ts = r?.timestamp ?? [];
    const close = r?.indicators?.quote?.[0]?.close ?? [];
    // Regular-session window in epoch SECONDS (Yahoo's own boundaries). If absent, every
    // bar falls through as `regular` — i.e. exactly today's behaviour, no greying.
    const reg = r?.meta?.currentTradingPeriod?.regular;
    const regStart = typeof reg?.start === "number" ? reg.start : null;
    const regEnd = typeof reg?.end === "number" ? reg.end : null;
    const sessionFor = (tSec: number): IntradaySession => {
      if (regStart !== null && tSec < regStart) return "pre";
      if (regEnd !== null && tSec >= regEnd) return "post";
      return "regular";
    };
    const out: IntradayPoint[] = [];
    for (let i = 0; i < ts.length; i++) {
      const c = close[i];
      if (typeof c !== "number" || !(c > 0)) continue; // skip gaps (null bars)
      out.push({ t: ts[i] * 1000, c: Math.round(c * 100), session: sessionFor(ts[i]) });
    }
    return out;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
