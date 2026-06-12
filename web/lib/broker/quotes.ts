import { prisma } from "../db";
import { trackedSymbols } from "../universe";
import { fetchYahooQuotes } from "./yahoo";
import type { Quote } from "./types";

// DB-cached delayed quotes. The agent's tick loop keeps the cache warm
// (refreshAllQuotes); web request paths read the cache and only fall back to
// a live fetch when an entry is missing or stale. If everything is down,
// callers get the stale row with its honest timestamp — the engine applies
// its own hard-staleness rejection on top (QUOTE_HARD_STALE_MS).

const FRESH_MS = 15 * 60_000; // don't refetch newer than this
export const QUOTE_HARD_STALE_MS = 90 * 60_000; // engine refuses to fill past this

type QuoteRow = {
  symbol: string;
  bidCents: number;
  askCents: number;
  midCents: number;
  dayChangeBps: number;
  at: Date;
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

async function upsertMany(rows: QuoteRow[]): Promise<void> {
  for (const q of rows) {
    await prisma.quote.upsert({
      where: { symbol: q.symbol },
      create: { ...q, source: "yahoo-delayed" },
      update: { ...q, source: "yahoo-delayed" },
    });
  }
}

export async function getQuotes(symbols: string[]): Promise<Map<string, Quote>> {
  const wanted = symbols.map((s) => s.toUpperCase());
  const rows = await prisma.quote.findMany({ where: { symbol: { in: wanted } } });
  const have = new Map<string, QuoteRow>(rows.map((r) => [r.symbol, r]));
  const now = Date.now();
  const missing = wanted.filter((s) => {
    const r = have.get(s);
    return !r || now - r.at.getTime() > FRESH_MS;
  });

  if (missing.length > 0) {
    try {
      const fetched = await fetchYahooQuotes(missing);
      await upsertMany(fetched);
      for (const q of fetched) have.set(q.symbol, { ...q });
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
