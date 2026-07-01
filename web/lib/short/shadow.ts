// Shadow shorts (docs/SHORT-LAB.md Phase 3) — "what if, instead of just SELLING a name, the fund had
// flipped to SHORT it?" For every real-fund stock SELL we open a MODELED short at the sell price in a
// dedicated shadow lab and track it over time. It teaches whether our exits tend to keep falling — an
// input the live agent can weigh — while NEVER shorting anything real (rule #3). Pure sandbox.
import { prisma } from "../db";
import { getQuotes } from "../broker/quotes";
import { shortUnrealizedCents, accrueBorrowCents } from "./mechanics";

const SHADOW_OWNER = "shadow:fund";
const DAY_MS = 86_400_000;

export async function ensureShadowLab() {
  const existing = await prisma.shortLab.findFirst({ where: { owner: SHADOW_OWNER } });
  // Big virtual cash + 0% maintenance → these are observations, never margin-called or covered.
  return existing ?? prisma.shortLab.create({ data: { owner: SHADOW_OWNER, name: "Shadow shorts — our exits", startingCashCents: 100_000_000, cashCents: 100_000_000, maintMarginPct: 0 } });
}

/** Open a modeled short for each real-fund STOCK SELL (last 60d) not already shadowed, at the sell price.
 *  Idempotent via sourceTradeId (@unique). Returns the number opened. Read-only w.r.t. the real fund. */
export async function syncShadowShorts(): Promise<number> {
  const lab = await ensureShadowLab();
  const since = new Date(Date.now() - 60 * DAY_MS);
  const sells = await prisma.trade.findMany({ where: { side: "SELL", secType: "STK", at: { gte: since } }, orderBy: { at: "asc" } });
  if (sells.length === 0) return 0;
  const seen = new Set((await prisma.shortPosition.findMany({ where: { labId: lab.id, sourceTradeId: { not: null } }, select: { sourceTradeId: true } })).map((x) => x.sourceTradeId));
  let opened = 0;
  for (const t of sells) {
    if (seen.has(t.id) || t.qty < 1 || t.priceCents <= 0) continue;
    await prisma.shortPosition
      .create({ data: { labId: lab.id, symbol: t.symbol, currency: t.symbol.endsWith(".TO") ? "CAD" : "USD", qty: t.qty, avgShortCents: t.priceCents, borrowBps: 50, lastMarkCents: t.priceCents, openedAt: t.at, lastAccruedAt: t.at, sourceTradeId: t.id } })
      .then(() => opened++)
      .catch(() => {}); // unique race → already shadowed
  }
  return opened;
}

export type ShadowShort = { symbol: string; qty: number; avgShortCents: number; markCents: number; unrealCents: number; returnPct: number; daysHeld: number };
export type ShadowView = { count: number; avgReturnPct: number; winRatePct: number; totalUnrealCents: number; positions: ShadowShort[] };

export async function loadShadow(): Promise<ShadowView> {
  const lab = await prisma.shortLab.findFirst({ where: { owner: SHADOW_OWNER } });
  const empty: ShadowView = { count: 0, avgReturnPct: 0, winRatePct: 0, totalUnrealCents: 0, positions: [] };
  if (!lab) return empty;
  const rows = await prisma.shortPosition.findMany({ where: { labId: lab.id, status: "OPEN" }, orderBy: { openedAt: "desc" } });
  if (rows.length === 0) return empty;
  const quotes = await getQuotes(rows.map((r) => r.symbol));
  const now = Date.now();
  const positions: ShadowShort[] = rows.map((p) => {
    const mark = quotes.get(p.symbol.toUpperCase())?.midCents ?? p.lastMarkCents ?? p.avgShortCents;
    const accrued = p.accruedBorrowCents + accrueBorrowCents(p.qty * mark, p.borrowBps, Math.max(0, (now - p.lastAccruedAt.getTime()) / DAY_MS));
    const unreal = shortUnrealizedCents(p.qty, p.avgShortCents, mark, accrued);
    return { symbol: p.symbol, qty: p.qty, avgShortCents: p.avgShortCents, markCents: mark, unrealCents: unreal, returnPct: p.qty * p.avgShortCents > 0 ? (unreal / (p.qty * p.avgShortCents)) * 100 : 0, daysHeld: Math.max(0, Math.floor((now - p.openedAt.getTime()) / DAY_MS)) };
  });
  const count = positions.length;
  return {
    count,
    avgReturnPct: count ? positions.reduce((s, p) => s + p.returnPct, 0) / count : 0,
    winRatePct: count ? Math.round((positions.filter((p) => p.unrealCents > 0).length / count) * 100) : 0,
    totalUnrealCents: positions.reduce((s, p) => s + p.unrealCents, 0),
    positions,
  };
}

/** A one-line lesson for the LIVE agent's context — informs "do my exits keep falling?", never an action. */
export async function shortLessonLine(): Promise<string | null> {
  const v = await loadShadow().catch(() => null);
  if (!v || v.count < 3) return null;
  return `Shorting lesson (Short Lab sandbox — the fund does NOT short, rule #3): of the last ${v.count} names the fund SOLD, shorting them instead would be ${v.avgReturnPct >= 0 ? "+" : ""}${v.avgReturnPct.toFixed(0)}% on average and ${v.winRatePct}% would have profited. An INPUT on whether your exits tend to keep falling — never an action.`;
}
