import { prisma } from "../db";
import { fmpLogo } from "../logos";
import { trackedUniverse } from "../universe";
import { ROSTER_FUNDS } from "../smart-money/portfolios";

// The universal bare-ticker key. US names are stored inconsistently — mostly bare
// (NVDA) but some carry a ".US" suffix (AMD.US), and news rows can store either —
// so we strip the listing suffix (CA venues AND ".US") to one canonical key. This
// is what stops a name leaking back as its own relative (AAPL ↔ "AAPL.US").
const bareKey = (s: string) => s.trim().toUpperCase().replace(/\.(TO|V|NE|CN|US)$/i, "");

// Knowledge graph — Slice 1 (docs/KNOWLEDGE-GRAPH.md). The "Related names" a stock
// is connected to, computed ON-THE-FLY from data we already pull (no schema, no
// agent, no LLM): FMP peers + 13F co-holdings + news co-mentions, with same-sector
// as a weak floor. Every edge is typed by its SOURCE (honest provenance, the
// literacy pillar) and scored 0–100. The agent never reads this — it's a human
// surface that validates edge quality before we ever pay to feed it upstream.

export type RelatedSource = "peer" | "coheld" | "comention" | "sector" | "chain";

export type RelatedName = {
  ticker: string; // bare ticker — the join key AND the display label
  name: string; // company name when known, else the ticker
  weight: number; // 0–100 derived relatedness score
  why: string; // human-readable provenance ("FMP peer · co-held by Buffett · 4 stories together (30d)")
  sources: RelatedSource[];
  // Resolved when the name is a tracked universe member; null = an untracked lead.
  symbol: string | null; // universe symbol → dossier link + stance key
  logoUrl: string | null;
  currency: string | null;
  stance: string | null; // Alfred's call (raw stance string), tracked names only
  capM: number | null; // tiebreaker for the weak sector floor
  // Market Base Layer Tier-1 read (docs/MARKET-BASE-LAYER.md) — "we have a read on this",
  // most useful on untracked leads. INTERESTING | WATCH | PASS + the one-line take.
  screenTag: string | null;
  screenTake: string | null;
};

type SourceHit = { score: number; why: string; name?: string; capM?: number | null };

// Per-source base weights, ordered by the spillover literature: co-mention and
// peer (connected-firm / shared-coverage) are the strongest, co-holding is strong
// but sparse, same-sector is the weak floor. Evidence bonuses layer on top.
const BASE = { comention: 70, peer: 65, chain: 62, coheld: 60, sector: 25 } as const;

const lastName = (full: string) => full.trim().split(/\s+/).pop() ?? full;

// ETFs aren't companies, so they're noise in a relationship graph — and FMP tags
// every ETF's sector as "Financial Services", which floods the sector floor of any
// financial name with index funds. `tier` is unreliable here (VOO is null, VFV is
// mislabeled "large"), so detect by the issuer brands + the word ETF. Real
// companies like "S&P Global" or "Berkshire" don't match, so they stay.
const ETF_RE = /\b(ETF|iShares|Vanguard|SPDR|Invesco|Horizons|ProShares|Direxion|Global X)\b/i;
const isEtfLike = (tier: string | null, name: string) => tier === "etf" || ETF_RE.test(name);

export async function relatedFor(opts: {
  symbol: string; // the page's universe symbol (for self-exclusion via yahoo)
  yahoo: string;
  peers: { symbol: string; name: string; self: boolean }[];
  sector?: string | null;
  limit?: number;
}): Promise<{ items: RelatedName[] }> {
  const { yahoo, peers, sector } = opts;
  const limit = opts.limit ?? 8;
  const self = bareKey(yahoo);

  const peerHits = new Map<string, SourceHit>();
  const coheldHits = new Map<string, SourceHit>();
  const comentionHits = new Map<string, SourceHit>();
  const sectorHits = new Map<string, SourceHit>();
  const chainHits = new Map<string, SourceHit>();

  // --- peer: FMP's stock-peers, already fetched on the page. Closer rank → higher. ---
  peers
    .filter((p) => !p.self)
    .forEach((p, i) => {
      const t = bareKey(p.symbol);
      if (!t || t === self) return;
      peerHits.set(t, { score: BASE.peer + Math.max(0, 15 - i * 4), why: "FMP peer", name: p.name || undefined });
    });

  // --- coheld: other names the roster's 13F filers hold alongside this one. Pure DB. ---
  const ciks = ROSTER_FUNDS.map((f) => f.cik);
  const cikName = new Map(ROSTER_FUNDS.map((f) => [f.cik, lastName(f.name)]));
  const heldRows = await prisma.portfolioHolding
    .findMany({
      where: { symbol: self, putCall: null, snapshot: { cik: { in: ciks } } },
      include: { snapshot: { select: { cik: true, asOf: true } } },
    })
    .catch(() => []);
  // The latest snapshot PER filer that actually holds this name (a filer may have exited since).
  const latestByCik = new Map<string, Date>();
  for (const h of heldRows) {
    const cur = latestByCik.get(h.snapshot.cik);
    if (!cur || h.snapshot.asOf > cur) latestByCik.set(h.snapshot.cik, h.snapshot.asOf);
  }
  if (latestByCik.size > 0) {
    const coRows = await prisma.portfolioHolding
      .findMany({
        where: { symbol: { not: self }, putCall: null, snapshot: { cik: { in: [...latestByCik.keys()] } } },
        include: { snapshot: { select: { cik: true, asOf: true } } },
      })
      .catch(() => []);
    const agg = new Map<string, { filers: Set<string>; maxPct: number; name: string }>();
    for (const r of coRows) {
      // Only holdings from the same snapshot we matched this name in.
      if (latestByCik.get(r.snapshot.cik)?.getTime() !== r.snapshot.asOf.getTime()) continue;
      if (r.pctOfPort < 0.0005) continue; // skip ~0% lines
      const t = bareKey(r.symbol);
      if (t === self) continue;
      let a = agg.get(t);
      if (!a) {
        a = { filers: new Set(), maxPct: 0, name: r.name };
        agg.set(t, a);
      }
      a.filers.add(r.snapshot.cik);
      a.maxPct = Math.max(a.maxPct, r.pctOfPort);
    }
    for (const [t, a] of agg) {
      const bonus = Math.min(30, a.filers.size * 12 + Math.round(a.maxPct * 100));
      const names = [...a.filers].map((c) => cikName.get(c) ?? "a tracked filer");
      coheldHits.set(t, { score: BASE.coheld + bonus, why: `co-held by ${names.join(", ")}`, name: a.name });
    }
  }

  // --- comention: tickers that share recent (30d) news with this name. Recency-decayed. ---
  const since = new Date(Date.now() - 30 * 86_400_000);
  const arts = await prisma.newsArticle
    .findMany({
      where: { publishedAt: { gte: since }, OR: [{ symbol: self }, { symbolsJson: { contains: `"${self}"` } }] },
      select: { symbol: true, symbolsJson: true, publishedAt: true },
      take: 250,
    })
    .catch(() => []);
  const tally = new Map<string, { n: number; recency: number }>();
  for (const a of arts) {
    const set = new Set<string>();
    if (a.symbol) set.add(bareKey(a.symbol));
    if (a.symbolsJson) {
      try {
        const arr = JSON.parse(a.symbolsJson);
        if (Array.isArray(arr)) for (const s of arr) if (typeof s === "string") set.add(bareKey(s));
      } catch {
        /* malformed tag list — ignore */
      }
    }
    set.delete(self);
    const ageDays = Math.max(0, (Date.now() - a.publishedAt.getTime()) / 86_400_000);
    const rec = Math.max(0.3, (30 - ageDays) / 30); // newer co-mentions count more
    for (const t of set) {
      if (!t) continue;
      const cur = tally.get(t) ?? { n: 0, recency: 0 };
      cur.n += 1;
      cur.recency += rec;
      tally.set(t, cur);
    }
  }
  for (const [t, v] of tally) {
    comentionHits.set(t, { score: BASE.comention + Math.min(25, Math.round(v.recency * 6)), why: `${v.n} ${v.n === 1 ? "story" : "stories"} together (30d)` });
  }

  // --- sector: the weak floor — same-sector tracked names, only when nothing stronger fills the list. ---
  const tracked = await trackedUniverse();
  const byBare = new Map(tracked.map((r) => [bareKey(r.yahoo), r] as const));
  if (sector) {
    for (const row of tracked) {
      if (row.sector !== sector) continue;
      if (isEtfLike(row.tier, row.name)) continue; // FMP files ETFs under "Financial Services" — skip them
      const t = bareKey(row.yahoo);
      if (!t || t === self) continue;
      sectorHits.set(t, { score: BASE.sector, why: `same sector (${sector})`, name: row.name, capM: row.marketCapM });
    }
  }

  // --- chain: persisted Chess Moves board links (docs/CHESS-MOVES.md). The agent's
  // value-chain reasoning, stored by Chess Moves keyed on the bare ticker (= self). ---
  const chainRows = await prisma.knowledgeEdge.findMany({ where: { fromSymbol: self, sources: { contains: "chain" } } }).catch(() => []);
  for (const r of chainRows) {
    const t = bareKey(r.toTicker);
    if (!t || t === self) continue;
    chainHits.set(t, { score: r.weight || BASE.chain, why: r.why });
  }

  // --- merge by ticker: max score per source + a corroboration bonus, stable why order ---
  const order: RelatedSource[] = ["peer", "coheld", "comention", "chain", "sector"];
  const maps: Record<RelatedSource, Map<string, SourceHit>> = { peer: peerHits, coheld: coheldHits, comention: comentionHits, chain: chainHits, sector: sectorHits };
  const tickers = new Set<string>([...peerHits.keys(), ...coheldHits.keys(), ...comentionHits.keys(), ...chainHits.keys(), ...sectorHits.keys()]);

  const merged: RelatedName[] = [];
  for (const ticker of tickers) {
    const sources: RelatedSource[] = [];
    const whyBits: string[] = [];
    let best = 0;
    let name: string | null = null;
    let capM: number | null = null;
    for (const src of order) {
      const hit = maps[src].get(ticker);
      if (!hit) continue;
      sources.push(src);
      whyBits.push(hit.why);
      best = Math.max(best, hit.score);
      if (!name && hit.name) name = hit.name;
      if (capM == null && hit.capM != null) capM = hit.capM;
    }
    const weight = Math.min(100, best + (sources.length >= 2 ? 10 : 0));
    const row = byBare.get(ticker);
    merged.push({
      ticker,
      name: row?.name ?? name ?? ticker,
      weight,
      why: whyBits.join(" · "),
      sources,
      symbol: row?.symbol ?? null,
      logoUrl: row?.logoUrl ?? fmpLogo(ticker),
      currency: row?.currency ?? null,
      stance: null,
      capM: row?.marketCapM ?? capM,
      screenTag: null,
      screenTake: null,
    });
  }

  merged.sort((a, b) => b.weight - a.weight || (b.capM ?? 0) - (a.capM ?? 0) || a.ticker.localeCompare(b.ticker));
  const items = merged.slice(0, limit);

  // Alfred's call for the tracked names that made the cut (one bounded query).
  const trackedSyms = items.map((r) => r.symbol).filter((s): s is string => !!s);
  if (trackedSyms.length > 0) {
    const rows = await prisma.journalEntry
      .findMany({ where: { stance: { not: null }, symbol: { in: trackedSyms } }, orderBy: { at: "desc" }, select: { symbol: true, stance: true } })
      .catch(() => []);
    const stanceBy = new Map<string, string>();
    for (const s of rows) if (s.symbol && !stanceBy.has(s.symbol)) stanceBy.set(s.symbol, s.stance as string);
    for (const r of items) if (r.symbol) r.stance = stanceBy.get(r.symbol) ?? null;
  }

  // Market Base Layer Tier-1 tags for the related names (the "we have a read on this"
  // payoff — especially on untracked leads). Highest-score listing wins per bare ticker.
  const relTickers = items.map((r) => r.ticker);
  if (relTickers.length > 0) {
    const screens = await prisma.marketScreen
      .findMany({ where: { ticker: { in: relTickers }, tag: { not: null } }, select: { ticker: true, tag: true, take: true }, orderBy: { screenScore: "desc" } })
      .catch(() => []);
    const screenBy = new Map<string, { tag: string | null; take: string | null }>();
    for (const s of screens) if (!screenBy.has(s.ticker)) screenBy.set(s.ticker, { tag: s.tag, take: s.take });
    for (const r of items) {
      const s = screenBy.get(r.ticker);
      if (s) {
        r.screenTag = s.tag;
        r.screenTake = s.take;
      }
    }
  }

  return { items };
}
