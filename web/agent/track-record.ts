// The agent's own track record (stage 3 of the Opus 5.5 prompt audit, R6, 2026-09-30).
//
// Why this exists: on Opus 5.5 the fund went from ~1.2 orders a day to ~3.8, opening 8 new names in
// a week and selling holdings to fund them, because every instruction rewarded activity and nothing
// showed the agent whether a trade paid. Cam's goal is to make more than we put in, month over
// month. Caps would only move the number it fills; the incentive is feedback. So every decision
// session now sees what its trading actually did: whether each rotation beat simply holding, how
// long it holds, how much it turns over, and what it realizes in taxable gains.
//
// Information only: nothing here gates an order (the §6 gate is untouched). The math is pure and
// tested (test/track-record.test.ts); trackRecordBlock() is the thin DB/quote wrapper.

import { prisma } from "../lib/db";
import { getQuotes } from "../lib/broker/quotes";
import { lastSettledSnapshotBefore } from "../lib/nav-history";
import { etDateStr, startOfEtDay } from "./calendar";

export type Fill = {
  symbol: string;
  side: "BUY" | "SELL";
  qty: number;
  priceCents: number;
  commissionCents: number;
  realizedPnlCents: number | null;
  at: Date;
  placedBy: string; // "agent" | "system-stop" | a member's email
};

/** One continuous holding of a name: opened when the position went 0 → >0, closed on >0 → 0. */
export type Episode = { symbol: string; openedAt: Date; closedAt: Date | null };

/** Holding episodes, replayed BACKWARDS from the broker's current quantities. A forward replay of the
 *  whole trade table is wrong here: the 2026-06-26 paper-account reset cleared positions without any
 *  SELL, so a forward replay still "holds" pre-reset shares (it had IFC open after the fund sold out,
 *  and MRU/ATD/NVDA held for months). Walking back from today's truth is right whatever happened
 *  before, and the walk stops trusting a name's history the moment it contradicts itself. */
export function episodes(fills: Fill[], currentQty?: Map<string, number>): Episode[] {
  const cur = currentQty ?? forwardNet(fills);
  const bySymbol = new Map<string, Fill[]>();
  for (const f of fills) bySymbol.set(f.symbol, [...(bySymbol.get(f.symbol) ?? []), f]);
  const out: Episode[] = [];
  for (const [symbol, fs] of bySymbol) {
    const desc = [...fs].sort((x, y) => y.at.getTime() - x.at.getTime());
    let qty = cur.get(symbol) ?? 0;
    let closedAt: Date | null = null; // the close of the episode we are walking back through
    for (const f of desc) {
      const before = qty - (f.side === "BUY" ? f.qty : -f.qty);
      if (before < 0) break; // history no longer adds up (e.g. a reset) — stop trusting it
      if (qty > 0 && before <= 0) out.push({ symbol, openedAt: f.at, closedAt });
      if (qty <= 0 && before > 0) closedAt = f.at;
      qty = before;
    }
  }
  return out.sort((x, y) => x.openedAt.getTime() - y.openedAt.getTime());
}

function forwardNet(fills: Fill[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const f of fills) m.set(f.symbol, (m.get(f.symbol) ?? 0) + (f.side === "BUY" ? f.qty : -f.qty));
  for (const [k, v] of m) if (v < 0) m.set(k, 0);
  return m;
}

/** A rotation: agent SELLs and agent BUYs placed together (within `windowMs` of each other), the
 *  sells funding the buys. Stops, take-profits and member orders are not the agent's rotations. */
export type Rotation = { at: Date; sold: Fill[]; bought: Fill[] };

export function rotations(fills: Fill[], windowMs = 45 * 60_000): Rotation[] {
  const agent = fills.filter((f) => f.placedBy === "agent").sort((a, b) => a.at.getTime() - b.at.getTime());
  const clusters: Fill[][] = [];
  for (const f of agent) {
    const last = clusters.at(-1);
    const lastAt = last?.at(-1)?.at.getTime();
    if (last && lastAt != null && f.at.getTime() - lastAt <= windowMs) last.push(f);
    else clusters.push([f]);
  }
  return clusters
    .map((c) => ({ at: c[0].at, sold: c.filter((f) => f.side === "SELL"), bought: c.filter((f) => f.side === "BUY") }))
    .filter((r) => r.sold.length > 0 && r.bought.length > 0);
}

/** Value-weighted % move of a basket of fills from their fill prices to `now` prices. Null when no
 *  fill in the basket has a current price. */
export function basketMovePct(legs: Fill[], nowCents: Map<string, number>): number | null {
  let base = 0;
  let now = 0;
  for (const f of legs) {
    const p = nowCents.get(f.symbol);
    if (p == null || f.priceCents <= 0) continue;
    base += f.priceCents * f.qty;
    now += p * f.qty;
  }
  return base > 0 ? ((now - base) / base) * 100 : null;
}

/** Did the swap beat holding? (bought basket's move) − (sold basket's move) − round-trip commissions
 *  as a % of what was bought. Positive = the rotation paid. */
export function rotationEdgePct(r: Rotation, nowCents: Map<string, number>): number | null {
  const soldMove = basketMovePct(r.sold, nowCents);
  const boughtMove = basketMovePct(r.bought, nowCents);
  if (soldMove == null || boughtMove == null) return null;
  const boughtCents = r.bought.reduce((s, f) => s + f.priceCents * f.qty, 0);
  const commissions = [...r.sold, ...r.bought].reduce((s, f) => s + f.commissionCents, 0);
  const costPct = boughtCents > 0 ? (commissions / boughtCents) * 100 : 0;
  return boughtMove - soldMove - costPct;
}

const DAY = 86_400_000;
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
const money = (c: number) => `${c < 0 ? "−" : ""}$${(Math.abs(c) / 100).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export type TrackInputs = {
  fills: Fill[]; // full history (episodes need it)
  now: Date;
  windowDays: number;
  nowCents: Map<string, number>;
  openPositions: number;
  currentQty: Map<string, number>; // the broker mirror's quantities — episodes replay back from these
  ordersInWindow: number; // orders the agent placed in the window (any outcome)
  mtd: { pnlCents: number; startNavCents: number } | null;
};

/** The block's text. Pure: every number comes from the inputs. */
export function renderTrackRecord(t: TrackInputs): string {
  const since = new Date(t.now.getTime() - t.windowDays * DAY);
  const inWin = (d: Date) => d >= since;
  const eps = episodes(t.fills, t.currentQty);
  const opened = eps.filter((e) => inWin(e.openedAt));
  const closed = eps.filter((e) => e.closedAt && inWin(e.closedAt));
  const held = closed.map((e) => ((e.closedAt as Date).getTime() - e.openedAt.getTime()) / DAY);
  const avgHeld = held.length ? held.reduce((s, d) => s + d, 0) / held.length : null;
  const quick = held.filter((d) => d < 28).length;

  const winFills = t.fills.filter((f) => inWin(f.at));
  const realized = winFills.reduce((s, f) => s + (f.realizedPnlCents ?? 0), 0);
  const commissions = winFills.reduce((s, f) => s + f.commissionCents, 0);

  const rots = rotations(winFills);
  const scored = rots.map((r) => ({ r, edge: rotationEdgePct(r, t.nowCents) }));
  const withEdge = scored.filter((s): s is { r: Rotation; edge: number } => s.edge != null);
  const paid = withEdge.filter((s) => s.edge > 0).length;
  const avgEdge = withEdge.length ? withEdge.reduce((s, x) => s + x.edge, 0) / withEdge.length : null;
  const names = (fs: Fill[]) => [...new Set(fs.map((f) => f.symbol))].join("+");

  const lines: string[] = [];
  if (t.mtd) {
    const mtdPct = t.mtd.startNavCents > 0 ? (t.mtd.pnlCents / t.mtd.startNavCents) * 100 : null;
    lines.push(`- **The goal — this month:** ${money(t.mtd.pnlCents)}${mtdPct != null ? ` (${pct(mtdPct)})` : ""} month-to-date, after contributions. This is the number you are judged on.`);
  }
  lines.push(
    `- **Activity (last ${t.windowDays} days):** ${t.ordersInWindow} orders · ${opened.length} new names opened · ${closed.length} full exits · ${t.openPositions} positions now.`,
  );
  lines.push(
    `- **Holding period:** ${avgHeld != null ? `positions closed in the window were held ${avgHeld.toFixed(0)} days on average; ${quick} of ${closed.length} were sold within 4 weeks of opening` : "no positions closed in the window"}.`,
  );
  lines.push(
    `- **Cost of trading:** ${realized >= 0 ? `${money(realized)} realized gains (half is taxable in a non-registered account)` : `${money(realized)} realized losses (they offset taxable gains)`} · ${money(commissions)} commissions recorded.`,
  );
  if (rots.length === 0) {
    lines.push(`- **Rotations:** none in the window.`);
  } else {
    lines.push(
      `- **Rotations (sold to fund a buy):** ${rots.length}; ${withEdge.length ? `${paid} of ${withEdge.length} beat simply holding so far, average ${pct(avgEdge as number)} vs holding` : "not yet scoreable (no current prices)"}.`,
    );
    for (const s of scored.slice(-8).reverse()) {
      const soldMove = basketMovePct(s.r.sold, t.nowCents);
      const boughtMove = basketMovePct(s.r.bought, t.nowCents);
      const d = s.r.at.toISOString().slice(5, 10);
      lines.push(
        `  - ${d}: sold ${names(s.r.sold)} (${soldMove != null ? pct(soldMove) : "n/a"} since) to buy ${names(s.r.bought)} (${boughtMove != null ? pct(boughtMove) : "n/a"} since) → ${s.edge != null ? `${pct(s.edge)} vs holding` : "not yet scoreable"}`,
      );
    }
  }
  return lines.join("\n");
}

/** Build the block from the DB and live quotes. Best-effort: returns a one-line note on failure so a
 *  quote hiccup never blanks a decision session. */
export async function trackRecordBlock(windowDays = 30): Promise<string> {
  try {
    const now = new Date();
    const since = new Date(now.getTime() - windowDays * DAY);
    const trades = await prisma.trade.findMany({
      where: { secType: "STK" },
      orderBy: { at: "asc" },
      select: { symbol: true, side: true, qty: true, priceCents: true, commissionCents: true, realizedPnlCents: true, at: true, orderId: true },
    });
    const orderIds = [...new Set(trades.map((t) => t.orderId))];
    const [orders, positions, ordersInWindow] = await Promise.all([
      prisma.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, placedBy: true } }),
      prisma.position.findMany({ where: { qty: { gt: 0 } }, select: { symbol: true, qty: true } }),
      prisma.order.count({ where: { placedBy: "agent", createdAt: { gte: since } } }),
    ]);
    const placedBy = new Map(orders.map((o) => [o.id, o.placedBy]));
    const fills: Fill[] = trades.map((t) => ({
      symbol: t.symbol,
      side: t.side as "BUY" | "SELL",
      qty: t.qty,
      priceCents: t.priceCents,
      commissionCents: t.commissionCents,
      realizedPnlCents: t.realizedPnlCents,
      at: t.at,
      placedBy: placedBy.get(t.orderId) ?? "unknown",
    }));

    const rotSymbols = [...new Set(rotations(fills.filter((f) => f.at >= since)).flatMap((r) => [...r.sold, ...r.bought].map((f) => f.symbol)))];
    const quotes = rotSymbols.length ? await getQuotes(rotSymbols).catch(() => new Map()) : new Map();
    const nowCents = new Map<string, number>();
    for (const [sym, q] of quotes) if (q?.midCents) nowCents.set(sym, q.midCents);

    // Month-to-date P&L after contributions: settled NAV now − settled NAV before the ET month began
    // − money added since. SETTLED only: an unsettled snapshot can double-count a sale (D120).
    const monthStart = startOfEtDay(new Date(`${etDateStr(now).slice(0, 8)}01T12:00:00Z`));
    const [startSnap, latestSnap, added] = await Promise.all([
      lastSettledSnapshotBefore(monthStart),
      lastSettledSnapshotBefore(now),
      prisma.contribution.aggregate({ where: { at: { gte: monthStart } }, _sum: { amountCents: true } }),
    ]);
    const mtd =
      startSnap && latestSnap
        ? { pnlCents: latestSnap.navCents - startSnap.navCents - (added._sum.amountCents ?? 0), startNavCents: startSnap.navCents }
        : null;

    const currentQty = new Map(positions.map((p) => [p.symbol, p.qty]));
    return renderTrackRecord({ fills, now, windowDays, nowCents, openPositions: positions.length, currentQty, ordersInWindow, mtd });
  } catch (e) {
    return `- (track record unavailable this session: ${e instanceof Error ? e.message : String(e)})`;
  }
}
