/**
 * Tier-8 (social sentiment) PROTOTYPE — read-only, no DB writes, no schema change.
 *
 *   cd web && npx tsx scripts/social-prototype.ts
 *
 * Proves the 8a signal is real against OUR actual book before we commit a SocialDaily table:
 *   1. pulls the same tracked set the news/options tiers use (held + watched + focus)  [newsTargets]
 *   2. fetches ApeWisdom (free, keyless, pre-aggregated Reddit) → mentions + 24h-ago velocity + rank
 *   3. fetches Stocktwits (free, keyless) per name → user-tagged Bullish/Bearish %
 *   4. joins on the bare ticker and prints a velocity/sentiment table for the book
 *
 * Throwaway probe — if the numbers look real, this logic becomes lib/social/*.
 */
import { newsTargets } from "../lib/news/ingest";

type Ape = { ticker: string; name: string; mentions: number; upvotes: number; rank: number; rank_24h_ago: number; mentions_24h_ago: number };

/** Pull the ApeWisdom ranked board into a bare-ticker → row map. One free call per page. */
async function fetchApeWisdom(filter: string, maxPages = 10): Promise<Map<string, Ape>> {
  const map = new Map<string, Ape>();
  for (let p = 1; p <= maxPages; p++) {
    const r = await fetch(`https://apewisdom.io/api/v1.0/filter/${filter}/page/${p}`, { signal: AbortSignal.timeout(12_000) }).catch(() => null);
    if (!r || !r.ok) break;
    const j = (await r.json().catch(() => null)) as { results?: Ape[]; pages?: number } | null;
    if (!j?.results?.length) break;
    for (const row of j.results) map.set(row.ticker.toUpperCase(), row);
    if (j.pages && p >= j.pages) break;
  }
  return map;
}

/** Stocktwits recent-message sentiment for a US ticker → {bull, bear} tagged-message counts. Best-effort. */
async function fetchStocktwits(ticker: string): Promise<{ bull: number; bear: number } | null> {
  const r = await fetch(`https://api.stocktwits.com/api/2/streams/symbol/${encodeURIComponent(ticker)}.json`, {
    headers: { "User-Agent": "grq-prototype/0.1" },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!r || !r.ok) return null;
  const j = (await r.json().catch(() => null)) as { messages?: Array<{ entities?: { sentiment?: { basic?: string } | null } }> } | null;
  if (!j?.messages) return null;
  let bull = 0, bear = 0;
  for (const m of j.messages) {
    const s = m.entities?.sentiment?.basic;
    if (s === "Bullish") bull++;
    else if (s === "Bearish") bear++;
  }
  return { bull, bear };
}

/** Run an array of async thunks with a small concurrency cap (be polite to Stocktwits). */
async function pool<T>(thunks: Array<() => Promise<T>>, size = 4): Promise<T[]> {
  const out: T[] = new Array(thunks.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, thunks.length) }, async () => {
      while (i < thunks.length) {
        const idx = i++;
        out[idx] = await thunks[idx]();
      }
    }),
  );
  return out;
}

function velocityLabel(now: number, prev: number): string {
  if (!prev) return now ? "NEW" : "—";
  const x = now / prev;
  const tag = x >= 2 ? " SPIKING" : x >= 1.3 ? " rising" : x <= 0.5 ? " cooling" : "";
  return `${x.toFixed(1)}x${tag}`;
}

async function main() {
  console.log("Tier-8 social prototype — pulling the book + ApeWisdom + Stocktwits…\n");

  const [targets, apeAll, apeWsb] = await Promise.all([
    newsTargets(),
    fetchApeWisdom("all-stocks"),
    fetchApeWisdom("wallstreetbets"),
  ]);
  console.log(`Book: ${targets.length} tracked names (held + watched + focus).`);
  console.log(`ApeWisdom: ${apeAll.size} names on the all-stocks board, ${apeWsb.size} on r/wallstreetbets.\n`);

  // Join the book to ApeWisdom on the bare FMP ticker; prefer the all-stocks board (wider).
  const rows = targets.map((t) => {
    const ape = apeAll.get(t.fmp) ?? apeWsb.get(t.fmp) ?? null;
    return { stored: t.stored, fmp: t.fmp, ape };
  });
  const covered = rows.filter((r) => r.ape);

  // Stocktwits sentiment, best-effort, for the covered names only (keep the call count small).
  const st = await pool(covered.map((r) => () => fetchStocktwits(r.fmp).then((s) => ({ fmp: r.fmp, s }))));
  const stBy = new Map(st.map((x) => [x.fmp, x.s]));

  // ---- the book, ApeWisdom-covered first, sorted by velocity ----
  console.log("ON OUR BOOK — social coverage:");
  console.log("name".padEnd(10) + "mentions".padEnd(10) + "24h-ago".padEnd(9) + "velocity".padEnd(13) + "rank(Δ)".padEnd(11) + "upvotes".padEnd(9) + "ST bull%");
  console.log("-".repeat(78));
  const sorted = covered
    .map((r) => ({ ...r, ape: r.ape! }))
    .sort((a, b) => b.ape.mentions / (b.ape.mentions_24h_ago || 1) - a.ape.mentions / (a.ape.mentions_24h_ago || 1));
  for (const r of sorted) {
    const a = r.ape;
    const rankDelta = a.rank_24h_ago ? a.rank - a.rank_24h_ago : 0;
    const rankStr = `#${a.rank}` + (rankDelta ? ` (${rankDelta > 0 ? "↓" : "↑"}${Math.abs(rankDelta)})` : "");
    const s = stBy.get(r.fmp);
    const bull = s && s.bull + s.bear > 0 ? `${Math.round((100 * s.bull) / (s.bull + s.bear))}% (n=${s.bull + s.bear})` : "—";
    console.log(
      r.fmp.padEnd(10) +
        String(a.mentions).padEnd(10) +
        String(a.mentions_24h_ago).padEnd(9) +
        velocityLabel(a.mentions, a.mentions_24h_ago).padEnd(13) +
        rankStr.padEnd(11) +
        String(a.upvotes).padEnd(9) +
        bull,
    );
  }

  const dark = rows.filter((r) => !r.ape).map((r) => r.fmp);
  console.log(`\nNo social chatter (not on either board): ${dark.length}/${targets.length} → ${dark.join(", ") || "none"}`);

  // ---- context: the hottest names overall, and which intersect our world ----
  console.log("\nFOR CONTEXT — top 12 on r/wallstreetbets right now:");
  const top = [...apeWsb.values()].sort((a, b) => a.rank - b.rank).slice(0, 12);
  const ours = new Set(targets.map((t) => t.fmp));
  for (const a of top) {
    const mine = ours.has(a.ticker) ? "  ← ON OUR BOOK" : "";
    console.log(`  #${String(a.rank).padEnd(3)} ${a.ticker.padEnd(8)} ${String(a.mentions).padStart(4)} mentions  ${velocityLabel(a.mentions, a.mentions_24h_ago).padEnd(12)}${mine}`);
  }
  console.log("\nDone. (read-only — nothing written)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
