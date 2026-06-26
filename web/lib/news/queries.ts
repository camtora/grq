// News readers (D81, M2) — pure DB reads over the triaged NewsArticle store. Feeds the
// agent's "what moved" digest AND (M2b) the human pages (Today / stock page), which read
// the store first and fall back to live FMP so a name with no captured news never regresses
// to blank. The store also carries the triage enrichment (summary/sentiment/category) the
// raw FMP feed never had. docs/NEWS-AND-EVENTS.md.
import { prisma } from "../db";
import { fmpEnabled, fmpNews, fmpStockNews } from "../fmp";

export type NewsDigestRow = {
  publishedAt: Date;
  symbol: string | null;
  title: string;
  summary: string | null;
  sentiment: string | null;
  relevance: number | null;
  category: string | null;
};

/** Recent, triaged, materially-relevant items — relevance-ranked. The bounded digest the
 *  agent sees (it never reads raw articles). Defaults are deliberately tight to stay small. */
export async function recentNewsDigest(opts?: { hours?: number; minRelevance?: number; limit?: number }): Promise<NewsDigestRow[]> {
  const hours = opts?.hours ?? 36;
  const minRelevance = opts?.minRelevance ?? 50;
  const limit = opts?.limit ?? 12;
  const since = new Date(Date.now() - hours * 3_600_000);
  return prisma.newsArticle.findMany({
    where: { triagedAt: { not: null }, publishedAt: { gte: since }, relevance: { gte: minRelevance } },
    orderBy: [{ relevance: "desc" }, { publishedAt: "desc" }],
    take: limit,
    select: { publishedAt: true, symbol: true, title: true, summary: true, sentiment: true, relevance: true, category: true },
  });
}

/** Triaged news for one symbol (stored form) — agent-side reader. */
export async function newsForSymbol(symbol: string, limit = 6): Promise<NewsDigestRow[]> {
  return prisma.newsArticle.findMany({
    where: { symbol, triagedAt: { not: null } },
    orderBy: { publishedAt: "desc" },
    take: limit,
    select: { publishedAt: true, symbol: true, title: true, summary: true, sentiment: true, relevance: true, category: true },
  });
}

// ---- M2b: render-friendly readers for the web pages (store-first, FMP fallback) --------

// A complete row for rendering a news link/card. Triage fields are null on FMP-fallback rows.
export type NewsCard = {
  at: string; // YYYY-MM-DD for display
  title: string;
  url: string;
  publisher: string;
  image: string | null;
  symbol: string | null;
  summary: string | null;
  sentiment: string | null; // POS | NEU | NEG
  relevance: number | null;
  category: string | null;
};

type StoreRow = {
  publishedAt: Date;
  title: string;
  url: string;
  publisher: string;
  imageUrl: string | null;
  symbol: string | null;
  summary: string | null;
  sentiment: string | null;
  relevance: number | null;
  category: string | null;
};

const CARD_SELECT = {
  publishedAt: true,
  title: true,
  url: true,
  publisher: true,
  imageUrl: true,
  symbol: true,
  summary: true,
  sentiment: true,
  relevance: true,
  category: true,
} as const;

function storeToCard(r: StoreRow): NewsCard {
  return {
    at: r.publishedAt.toISOString().slice(0, 10),
    title: r.title,
    url: r.url,
    publisher: r.publisher,
    image: r.imageUrl,
    symbol: r.symbol,
    summary: r.summary,
    sentiment: r.sentiment,
    relevance: r.relevance,
    category: r.category,
  };
}

function fmpToCard(n: { title: string; publisher: string; url: string; at: string; image: string }, symbol: string | null): NewsCard {
  return { at: (n.at || "").slice(0, 10), title: n.title, url: n.url, publisher: n.publisher, image: n.image || null, symbol, summary: null, sentiment: null, relevance: null, category: null };
}

/** Today's general market headlines — latest captured (enriched where triaged), FMP fallback. */
export async function todayHeadlines(limit = 12): Promise<NewsCard[]> {
  const rows = await prisma.newsArticle.findMany({
    where: { source: "fmp-general" },
    orderBy: { publishedAt: "desc" },
    take: limit,
    select: CARD_SELECT,
  });
  if (rows.length) return rows.map(storeToCard);
  if (!fmpEnabled()) return [];
  return (await fmpNews(limit).catch(() => [])).map((n) => fmpToCard(n, null));
}

/** Per-stock news for the stock page — store-first (stored symbol), FMP fallback by ticker. */
export async function stockNewsCards(symbol: string, fmpTicker: string, limit = 6): Promise<NewsCard[]> {
  const rows = await prisma.newsArticle.findMany({
    where: { symbol },
    orderBy: { publishedAt: "desc" },
    take: limit,
    select: CARD_SELECT,
  });
  if (rows.length) return rows.map(storeToCard);
  if (!fmpEnabled()) return [];
  return (await fmpStockNews(fmpTicker, limit).catch(() => [])).map((n) => fmpToCard(n, symbol));
}
