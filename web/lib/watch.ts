import { prisma } from "@/lib/db";
import { personByEmail } from "@/lib/people";

// Personal watches (D-watch). A StockWatch row is one (symbol, member) pair, so a
// name can be watched by several members and shown as a stack of avatars. Watching
// is INDEPENDENT of UniverseMember.status: it doesn't make a name tradeable, and
// promoting a name doesn't un-watch it. Watchers are humans only — a non-member
// email (shouldn't happen) is dropped on read. This module is the single seam the
// UI + API use; nothing reads the table directly.

export type WatcherView = { key: "cam" | "graham"; name: string; photo: string };

const norm = (s: string) => s.trim();
const lower = (s: string) => s.trim().toLowerCase();

function viewFor(email: string): WatcherView | null {
  const p = personByEmail(email);
  return p ? { key: p.key, name: p.name, photo: p.photo } : null;
}

// Group raw {symbol,email} rows into symbol -> watchers, Cam-before-Graham so the
// avatar stack order is stable across renders.
function group(rows: { symbol: string; email: string }[]): Map<string, WatcherView[]> {
  const map = new Map<string, WatcherView[]>();
  for (const r of rows) {
    const v = viewFor(r.email);
    if (!v) continue;
    const list = map.get(r.symbol) ?? [];
    list.push(v);
    map.set(r.symbol, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => (a.key === b.key ? 0 : a.key === "cam" ? -1 : 1));
  }
  return map;
}

/** Batch resolver: symbol -> its human watchers. Pass the symbols a page renders. */
export async function watchersFor(symbols: string[]): Promise<Map<string, WatcherView[]>> {
  if (symbols.length === 0) return new Map();
  const keys = symbols.map((s) => norm(s).toUpperCase());
  const rows = await prisma.stockWatch.findMany({
    where: { symbol: { in: keys } },
    orderBy: { addedAt: "asc" },
    select: { symbol: true, email: true },
  });
  return group(rows);
}

/** Every watched symbol -> its watchers, in one query (the Watchlist page). */
export async function allWatches(): Promise<Map<string, WatcherView[]>> {
  const rows = await prisma.stockWatch.findMany({
    orderBy: { addedAt: "asc" },
    select: { symbol: true, email: true },
  });
  return group(rows);
}

/** The set of storage-key symbols (upper-cased) a member watches — for batch
 *  "do I watch this?" checks across a list of rows (Browse / tables). */
export async function watchedByMember(email: string): Promise<Set<string>> {
  const rows = await prisma.stockWatch.findMany({
    where: { email: lower(email) },
    select: { symbol: true },
  });
  return new Set(rows.map((r) => r.symbol.toUpperCase()));
}

/** Does this member watch this symbol right now? */
export async function isWatching(symbol: string, email: string): Promise<boolean> {
  const row = await prisma.stockWatch.findUnique({
    where: { symbol_email: { symbol: norm(symbol).toUpperCase(), email: lower(email) } },
  });
  return !!row;
}

/** Add a personal watch (idempotent). Does NOT touch UniverseMember. */
export async function watch(symbol: string, email: string): Promise<void> {
  const symbolKey = norm(symbol).toUpperCase();
  await prisma.stockWatch.upsert({
    where: { symbol_email: { symbol: symbolKey, email: lower(email) } },
    create: { symbol: symbolKey, email: lower(email) },
    update: {},
  });
}

/** Remove only THIS member's watch. Tracking/universe membership is untouched. */
export async function unwatch(symbol: string, email: string): Promise<void> {
  await prisma.stockWatch.deleteMany({
    where: { symbol: norm(symbol).toUpperCase(), email: lower(email) },
  });
}
