import { prisma } from "../db";
import { trackedSymbols } from "../universe";
import { fetchYahooQuotes, type FetchedQuote } from "./yahoo";
import { isMarketOpen } from "../../agent/calendar";
import type { Quote } from "./types";

// DB-cached delayed quotes. The agent's tick loop keeps the cache warm
// (refreshAllQuotes); web request paths read the cache and only fall back to
// a live fetch when an entry is missing or stale. If everything is down,
// callers get the stale row with its honest timestamp — the engine applies
// its own hard-staleness rejection on top (QUOTE_HARD_STALE_MS).
//
// Staleness is judged on `fetchedAt` (when WE pulled the quote), NOT `at` —
// `at` is Yahoo's trade time, which pins at the close whenever the market is
// shut, so judging on it made every closed-market page load refetch the whole
// watchlist from Yahoo (~3s for 69 names) and never satisfy the cache.

const FRESH_MS = 15 * 60_000; // market open: don't refetch newer than this
const CLOSED_FRESH_MS = 60 * 60_000; // market closed: prices can't move — hourly at most
export const QUOTE_HARD_STALE_MS = 90 * 60_000; // engine refuses to fill past this (trade-time based)

type QuoteRow = {
  symbol: string;
  bidCents: number;
  askCents: number;
  midCents: number;
  dayChangeBps: number;
  at: Date;
  fetchedAt: Date;
};

function toQuote(r: QuoteRow): Quote {
  return {
    symbol: r.symbol,
    bidCents: r.bidCents,
    askCents: r.askCents,
    midCents: r.midCents,
    dayChangeBps: r.dayChangeBps,
    at: r.at,
  };
}

async function upsertMany(rows: FetchedQuote[]): Promise<void> {
  const fetchedAt = new Date();
  for (const q of rows) {
    await prisma.quote.upsert({
      where: { symbol: q.symbol },
      create: { ...q, fetchedAt, source: "yahoo-delayed" },
      update: { ...q, fetchedAt, source: "yahoo-delayed" },
    });
  }
}

export async function getQuotes(symbols: string[]): Promise<Map<string, Quote>> {
  const wanted = symbols.map((s) => s.toUpperCase());
  const rows = await prisma.quote.findMany({ where: { symbol: { in: wanted } } });
  const have = new Map<string, QuoteRow>(rows.map((r) => [r.symbol, r]));
  const now = Date.now();
  // "ANY" market open → the tight window; both exchanges shut (nights/weekends/
  // shared holidays) → the relaxed one. On a split holiday the closed exchange's
  // names refetch on the tight window — bounded and rare, so not worth per-symbol
  // exchange resolution here.
  const freshMs = isMarketOpen(new Date(), "ANY") ? FRESH_MS : CLOSED_FRESH_MS;
  const missing = wanted.filter((s) => {
    const r = have.get(s);
    return !r || now - r.fetchedAt.getTime() > freshMs;
  });

  if (missing.length > 0) {
    try {
      const fetched = await fetchYahooQuotes(missing);
      await upsertMany(fetched);
      const fetchedAt = new Date();
      for (const q of fetched) have.set(q.symbol, { ...q, fetchedAt });
    } catch {
      // fall through with whatever cache we have — staleness is visible via `at`
    }
  }

  const out = new Map<string, Quote>();
  for (const s of wanted) {
    const r = have.get(s);
    if (r) out.set(s, toQuote(r));
  }
  return out;
}

export async function getQuote(symbol: string): Promise<Quote | null> {
  const m = await getQuotes([symbol]);
  return m.get(symbol.toUpperCase()) ?? null;
}

/** Refresh specific symbols (ignores freshness — callers decide cadence). */
export async function refreshQuotesFor(symbols: string[]): Promise<number> {
  const fetched = await fetchYahooQuotes(symbols);
  await upsertMany(fetched);
  return fetched.length;
}

/** Bulk refresh of all tracked symbols — called by the agent tick loop. */
export async function refreshAllQuotes(): Promise<number> {
  return refreshQuotesFor(await trackedSymbols());
}

export function isHardStale(q: Quote, now = Date.now()): boolean {
  return now - q.at.getTime() > QUOTE_HARD_STALE_MS;
}
