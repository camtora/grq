import { prisma } from "../db";
import { fmpEnabled, fmpPeerComparison } from "../fmp";
import { trackedUniverse, type UniverseRow } from "../universe";
import { relatedFor, type RelatedName } from "./related";

// Knowledge graph — Slice 2 persistence (docs/KNOWLEDGE-GRAPH.md). A deterministic
// batch that materialises the on-the-fly edges (lib/graph/related.ts) into the
// KnowledgeEdge table so other surfaces (the Today "also touches" lane, and later
// the agent context) can read them without recomputing. No LLM, no model output —
// pure data. The batch visits every tracked node, so symmetric pairs persist in
// both directions. Never gates an order (§6 untouched).

const STORE_LIMIT = 20; // persist more edges per node than the panel shows (8)

async function persistEdges(fromSymbol: string, items: RelatedName[]): Promise<void> {
  const keep = items.map((i) => i.ticker);
  // Drop neighbours that no longer hold for this node (stale edges).
  if (keep.length === 0) {
    await prisma.knowledgeEdge.deleteMany({ where: { fromSymbol } });
    return;
  }
  await prisma.knowledgeEdge.deleteMany({ where: { fromSymbol, toTicker: { notIn: keep } } });
  for (const it of items) {
    const data = { toSymbol: it.symbol, weight: it.weight, sources: it.sources.join(","), why: it.why, computedAt: new Date() };
    await prisma.knowledgeEdge.upsert({
      where: { fromSymbol_toTicker: { fromSymbol, toTicker: it.ticker } },
      create: { fromSymbol, toTicker: it.ticker, ...data },
      update: data,
    });
  }
}

/** Compute + persist edges for ONE tracked name. Peers are an optional FMP fetch
 *  (the DB sources — coheld / comention / sector — are free); skip them for a
 *  light run. Returns the number of edges written. */
export async function buildEdgesForSymbol(row: UniverseRow, opts?: { withPeers?: boolean }): Promise<number> {
  const peers = opts?.withPeers && fmpEnabled() ? await fmpPeerComparison(row.yahoo).catch(() => []) : [];
  const { items } = await relatedFor({ symbol: row.symbol, yahoo: row.yahoo, peers, sector: row.sector, limit: STORE_LIMIT });
  await persistEdges(row.symbol, items);
  return items.length;
}

/** Recompute the whole graph over tracked names. Deterministic; safe to re-run.
 *  `limit` caps the node count (for testing). Intended to run nightly from the
 *  runner once the agent-coupled deploy lands (Slice 2). */
export async function runGraphScan(opts?: { withPeers?: boolean; limit?: number }): Promise<{ nodes: number; edges: number }> {
  const tracked = await trackedUniverse();
  const nodes = opts?.limit ? tracked.slice(0, opts.limit) : tracked;
  let edges = 0;
  for (const row of nodes) edges += await buildEdgesForSymbol(row, opts).catch(() => 0);
  return { nodes: nodes.length, edges };
}

export type GraphEdge = { toTicker: string; toSymbol: string | null; weight: number; sources: string[]; why: string };

/** Persisted edges for a name — the read side (Today lane / agent). */
export async function edgesFor(symbol: string, limit = 8): Promise<GraphEdge[]> {
  const rows = await prisma.knowledgeEdge.findMany({ where: { fromSymbol: symbol }, orderBy: { weight: "desc" }, take: limit });
  return rows.map((r) => ({ toTicker: r.toTicker, toSymbol: r.toSymbol, weight: r.weight, sources: r.sources.split(","), why: r.why }));
}
