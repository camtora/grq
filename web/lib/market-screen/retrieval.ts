import { prisma } from "../db";
import { allUniverse } from "../universe";

// Market Base Layer — Tier-3 retrieval (docs/MARKET-BASE-LAYER.md, Slice 3). Pure DB
// reads (no agent imports) that surface the screened market to the agent: fresh
// INTERESTING finds for the decision context, plus an avoid-list + seed for the hunt.
// Inputs the agent weighs, NEVER the gate.

const bareKey = (s: string) => s.trim().toUpperCase().replace(/\.(TO|V|NE|CN|US)$/i, "");

export type ScreenFind = {
  ticker: string;
  name: string;
  exchange: string;
  sector: string | null;
  take: string | null;
  obscurity: number | null;
  screenScore: number;
};

/** Top INTERESTING screen names NOT already in the universe — the freshest leads from
 *  the deterministic+Haiku market scan. Obscure-first (GRQ's edge), then score. */
export async function screenFinds(limit = 8): Promise<ScreenFind[]> {
  const tracked = new Set((await allUniverse()).map((u) => bareKey(u.yahoo)));
  const rows = await prisma.marketScreen.findMany({
    where: { tag: "INTERESTING" },
    orderBy: [{ obscurity: "desc" }, { screenScore: "desc" }],
    take: limit * 4, // over-fetch, then drop tracked + dedupe by bare ticker
    select: { ticker: true, name: true, exchange: true, sector: true, take: true, obscurity: true, screenScore: true },
  });
  const out: ScreenFind[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (tracked.has(r.ticker) || seen.has(r.ticker)) continue;
    seen.add(r.ticker);
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

/** For the discovery hunt: bare tickers we've surfaced in the last 45 days (so the hunt
 *  stops re-suggesting the same obscure pool — the anti-saturation list) + a screen seed
 *  of INTERESTING names worth vetting. */
export async function huntAvoidAndSeed(): Promise<{ avoid: string[]; seed: ScreenFind[] }> {
  const since = new Date(Date.now() - 45 * 86_400_000);
  const recent = await prisma.journalEntry.findMany({
    where: { kind: "RESEARCH", title: { startsWith: "Hunt dossier" }, at: { gte: since }, symbol: { not: null } },
    orderBy: { at: "desc" },
    take: 250,
    select: { symbol: true },
  });
  const avoid = [...new Set(recent.map((r) => bareKey(r.symbol as string)))];
  const seed = await screenFinds(12);
  return { avoid, seed };
}

/** One-line-per-find render for the hunt seed / context. */
export function findLine(f: ScreenFind): string {
  return `- ${f.ticker} (${f.name}, ${f.exchange}${f.sector ? `, ${f.sector}` : ""})${f.obscurity ? ` · obscurity ${f.obscurity}/5` : ""}${f.take ? ` — ${f.take}` : ""}`;
}
