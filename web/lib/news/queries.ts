// News readers (D81, M2) — pure DB reads over the triaged NewsArticle store. Feeds the
// agent's "what moved" digest AND (M2b) the human pages (Today / stock page), which read
// the store first and fall back to live FMP so a name with no captured news never regresses
// to blank. The store also carries the triage enrichment (summary/sentiment/category) the
// raw FMP feed never had. docs/NEWS-AND-EVENTS.md.
import { prisma } from "../db";
import { fmpEnabled, fmpNews, fmpStockNews } from "../fmp";
import { trackedUniverse } from "../universe";

// Universal bare-ticker key (mirrors lib/graph/related.ts) — strips CA venue
// suffixes AND ".US" so co-mention tags join to the universe consistently.
const bareKey = (s: string) => s.trim().toUpperCase().replace(/\.(TO|V|NE|CN|US)$/i, "");

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

// A tracked universe name a headline co-mentions — the knowledge graph surfaced
// on the news ("this story also touches…"). docs/KNOWLEDGE-GRAPH.md, Slice 2.
export type Touch = { ticker: string; symbol: string; name: string; held: boolean };

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
  touches?: Touch[]; // tracked names this headline co-mentions (Today lane; populated by todayHeadlines)
};

type StoreRow = {
  publishedAt: Date;
  title: string;
  url: string;
  publisher: string;
  imageUrl: string | null;
  symbol: string | null;
  symbolsJson: string | null;
  text: string | null;
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
  symbolsJson: true,
  text: true,
  summary: true,
  sentiment: true,
  relevance: true,
  category: true,
} as const;

// The on-page summary: prefer the article's real lede (FMP `text` — a few grounded sentences) over
// the terse Haiku one-liner (which stays the AGENT's compact digest, untouched). Collapse whitespace
// and cap to ~600 chars on a word boundary so cards read as a 3–7 line paragraph and stay uniform.
function summaryFrom(text: string | null, fallback: string | null): string | null {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return fallback;
  if (t.length <= 600) return t;
  const cut = t.slice(0, 600);
  const sp = cut.lastIndexOf(" ");
  return (sp > 450 ? cut.slice(0, sp) : cut).trimEnd() + "…";
}

function storeToCard(r: StoreRow): NewsCard {
  return {
    at: r.publishedAt.toISOString().slice(0, 10),
    title: r.title,
    url: r.url,
    publisher: r.publisher,
    image: r.imageUrl,
    symbol: r.symbol,
    summary: summaryFrom(r.text, r.summary),
    sentiment: r.sentiment,
    relevance: r.relevance,
    category: r.category,
  };
}

function fmpToCard(n: { title: string; publisher: string; url: string; at: string; image: string; text?: string }, symbol: string | null): NewsCard {
  return { at: (n.at || "").slice(0, 10), title: n.title, url: n.url, publisher: n.publisher, image: n.image || null, symbol, summary: summaryFrom(n.text ?? null, null), sentiment: null, relevance: null, category: null };
}

/** Resolve the TRACKED universe names each card co-mentions (from symbol + symbolsJson)
 *  and attach them as `touches`, held names first. This is the knowledge graph on the
 *  news: a headline lights up the universe names it mentions. (docs/KNOWLEDGE-GRAPH.md) */
async function attachTouches(rows: StoreRow[], cards: NewsCard[]): Promise<void> {
  const tracked = await trackedUniverse();
  const byBare = new Map(tracked.map((r) => [bareKey(r.yahoo), { symbol: r.symbol, name: r.name }] as const));
  const held = new Set((await prisma.position.findMany({ select: { symbol: true } }).catch(() => [])).map((p) => p.symbol));
  rows.forEach((row, i) => {
    const self = row.symbol ? bareKey(row.symbol) : null;
    const set = new Set<string>();
    if (row.symbol) set.add(bareKey(row.symbol));
    if (row.symbolsJson) {
      try {
        const arr = JSON.parse(row.symbolsJson);
        if (Array.isArray(arr)) for (const s of arr) if (typeof s === "string") set.add(bareKey(s));
      } catch {
        /* malformed tag list — ignore */
      }
    }
    const touches: Touch[] = [];
    for (const t of set) {
      if (!t || t === self) continue; // don't link a story to its own primary subject
      const u = byBare.get(t);
      if (!u) continue;
      touches.push({ ticker: t, symbol: u.symbol, name: u.name, held: held.has(u.symbol) });
    }
    touches.sort((a, b) => Number(b.held) - Number(a.held) || a.ticker.localeCompare(b.ticker));
    cards[i].touches = touches.slice(0, 5);
  });
}

/** Today's general market headlines — latest captured (enriched where triaged), FMP fallback. */
export async function todayHeadlines(limit = 12): Promise<NewsCard[]> {
  const rows = await prisma.newsArticle.findMany({
    where: { source: "fmp-general" },
    orderBy: { publishedAt: "desc" },
    take: limit,
    select: CARD_SELECT,
  });
  if (rows.length) {
    const cards = rows.map(storeToCard);
    await attachTouches(rows, cards);
    return cards;
  }
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
