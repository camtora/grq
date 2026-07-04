// NB: no `import "server-only"` — the agent runner (plain tsx, not Next) imports this
// for the overnight pre-earnings dossier pass. Server-side only by use.
import { prisma } from "@/lib/db";
import { allUniverse } from "@/lib/universe";
import { fmpEnabled, fmpEarningsCalendar, stripSuffix } from "@/lib/fmp";

/** Names WE care about — universe (non-RETIRED) ∪ member watches ∪ agent focus — that
 *  report earnings on `dateStr` (YYYY-MM-DD, ET). Matched on the bare *yahoo* ticker,
 *  the same convention as the Today page's earnings panel: FMP lists the market ticker
 *  (RY.TO / AMD) while our symbol can carry a .US tag, and RETIRED CDR shells must not
 *  shadow the live listing (grq-universe-symbol-conventions). Returns OUR symbols. */
export async function earningsReportersFor(dateStr: string): Promise<string[]> {
  if (!fmpEnabled()) return [];
  const [universe, watches, focus, cal] = await Promise.all([
    allUniverse(),
    prisma.stockWatch.findMany({ select: { symbol: true } }).catch(() => []),
    prisma.agentFocus.findMany({ select: { symbol: true } }).catch(() => []),
    fmpEarningsCalendar(dateStr, dateStr),
  ]);
  if (cal.length === 0) return [];
  const watched = new Set([...watches, ...focus].map((w) => w.symbol));

  // bare market ticker → our symbol; on collision the live listing outranks a RETIRED shell.
  const STATUS_RANK: Record<string, number> = { ACTIVE: 0, CANDIDATE: 1, RETIRED: 2 };
  const best = new Map<string, { symbol: string; rank: number }>();
  for (const u of universe) {
    if (u.status === "RETIRED" && !watched.has(u.symbol)) continue;
    const key = stripSuffix(u.yahoo || u.symbol).toUpperCase();
    const rank = STATUS_RANK[u.status] ?? 3;
    const cur = best.get(key);
    if (!cur || rank < cur.rank) best.set(key, { symbol: u.symbol, rank });
  }
  // Watched names with no universe row — match on their own symbol.
  for (const w of watched) {
    const key = stripSuffix(w).toUpperCase();
    if (!best.has(key)) best.set(key, { symbol: w, rank: 1 });
  }

  const out = new Set<string>();
  for (const row of cal) {
    const hit = best.get(stripSuffix(row.symbol).toUpperCase());
    if (hit) out.add(hit.symbol);
  }
  return [...out];
}
