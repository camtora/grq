// News capture (D81, M2) — pure FMP fetch + dedup persist, NO model. Pulls general
// market news + per-symbol news for the fund's tracked names (held + watched + focus),
// dedupes on URL, and writes raw NewsArticle rows for the Haiku triage pass to enrich.
// Cheap (just FMP calls we already pay for). Full plan: docs/NEWS-AND-EVENTS.md.
import { prisma } from "../db";
import { fmpEnabled, fmpNews, fmpStockNews } from "../fmp";
import { allWatches } from "../watch";

// Bare FMP ticker from a stored symbol (TICKER.US / SYM.TO → TICKER / SYM).
export function bareTicker(s: string): string {
  return s.replace(/\.(TO|V|NE|CN|US)$/i, "").toUpperCase();
}

/** The names worth pulling per-symbol news for: held + watched + agent focus, deduped
 *  and capped. Each carries the stored symbol (for tagging) and the bare FMP ticker. */
export async function newsTargets(cap = 30): Promise<Array<{ stored: string; fmp: string }>> {
  const [positions, watches, focus, members] = await Promise.all([
    prisma.position.findMany({ select: { symbol: true } }),
    allWatches(),
    prisma.agentFocus.findMany({ select: { symbol: true } }),
    prisma.universeMember.findMany({ where: { status: { not: "RETIRED" } }, select: { symbol: true, yahoo: true } }),
  ]);
  const yahooBy = new Map(members.map((m) => [m.symbol, m.yahoo]));
  const stored = new Set<string>();
  positions.forEach((p) => stored.add(p.symbol));
  for (const s of watches.keys()) stored.add(s);
  focus.forEach((f) => stored.add(f.symbol));

  const out: Array<{ stored: string; fmp: string }> = [];
  for (const s of stored) {
    const fmp = bareTicker(yahooBy.get(s) ?? s);
    if (fmp) out.push({ stored: s, fmp });
  }
  return out.slice(0, cap);
}

function parsePublished(at: string): Date {
  const d = new Date(at);
  return isNaN(d.getTime()) ? new Date() : d;
}

async function persist(
  items: Array<{ title: string; publisher: string; url: string; at: string; image: string }>,
  source: string,
  symbol: string | null,
): Promise<number> {
  const rows = items
    .filter((n) => n.url && n.title)
    .map((n) => ({
      publishedAt: parsePublished(n.at),
      source,
      publisher: n.publisher || "",
      title: n.title.slice(0, 500),
      url: n.url,
      imageUrl: n.image || null,
      symbol,
    }));
  if (!rows.length) return 0;
  const r = await prisma.newsArticle.createMany({ data: rows, skipDuplicates: true });
  return r.count; // newly-inserted rows (URL dedupe drops repeats across publishers/feeds)
}

/** Capture general + per-tracked-name news. Idempotent across runs (unique URL). */
export async function runNewsIngest(): Promise<{ captured: number; symbols: number }> {
  if (!fmpEnabled()) return { captured: 0, symbols: 0 };
  let captured = 0;

  const general = await fmpNews(15).catch(() => []);
  captured += await persist(general, "fmp-general", null);

  const targets = await newsTargets();
  for (const t of targets) {
    const items = await fmpStockNews(t.fmp, 5).catch(() => []);
    captured += await persist(items, "fmp-stock", t.stored);
  }
  return { captured, symbols: targets.length };
}
