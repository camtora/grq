// The Short Lab engine + read layer (docs/SHORT-LAB.md, D101). A permanently sandboxed, MODELED study
// of short selling — the fund never shorts (rule #3, unchanged). Opening a short credits proceeds to the
// virtual book and creates a buy-back liability; positions mark to the live quote, accrue a modeled
// borrow carry, and get force-covered on a MARGIN CALL. Integer cents, whole shares (rule #4). Marking
// is pure math + quotes → ZERO model tokens (this is why "lab first" is cheap).
import { prisma } from "../db";
import { getQuotes } from "../broker/quotes";
import { money } from "../money";
import {
  proceedsCents,
  shortUnrealizedCents,
  coverRealizedCents,
  accrueBorrowCents,
  modeledBorrowBps,
  marginHealth,
  type ShortLot,
  type MarginHealth,
} from "./mechanics";
import { shortDividendCents } from "./dividends";
import type { ShortPosition } from "@prisma/client";

const DAY_MS = 86_400_000;
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(0)}%`;
const retOnNotional = (realizedCents: number, qty: number, avgShortCents: number) => (qty * avgShortCents > 0 ? (realizedCents / (qty * avgShortCents)) * 100 : 0);

// ── teaching cards ───────────────────────────────────────────────────────────
function openCard(symbol: string, qty: number, priceCents: number, borrowBps: number): string {
  return `Shorted ${qty} ${symbol} at ${money(priceCents)}. You borrowed and sold ${qty} share${qty === 1 ? "" : "s"} — you now owe them back. You PROFIT if it falls below ${money(priceCents)}; you LOSE, with NO cap, if it rises. Carry to stay short: ~${(borrowBps / 100).toFixed(1)}%/yr.`;
}
function coverCard(symbol: string, qty: number, exitCents: number, realizedCents: number): string {
  const p = pct(retOnNotional(realizedCents, qty, exitCents));
  return `Covered ${qty} ${symbol} at ${money(exitCents)} — a realized ${realizedCents >= 0 ? "gain" : "loss"} of ${money(Math.abs(realizedCents))} (${p}). ${realizedCents >= 0 ? "The stock fell, as the short bet." : "The stock rose against the short — the cost of betting down."}`;
}
function marginCallCard(symbol: string, qty: number, exitCents: number, realizedCents: number): string {
  return `MARGIN CALL — ${symbol} ran against the short and equity fell below the maintenance line, so it was force-covered at ${money(exitCents)} for a ${money(Math.abs(realizedCents))} loss. This is how shorts blow up: the loss is unbounded and the buy-in comes at the worst moment.`;
}

// ── house lab ──────────────────────────────────────────────────────────────
export async function ensureHouseLab() {
  const existing = await prisma.shortLab.findFirst({ where: { owner: null }, orderBy: { id: "asc" } });
  return existing ?? prisma.shortLab.create({ data: { name: "The Short Lab" } });
}

const toLot = (p: { qty: number; lastMarkCents: number | null; avgShortCents: number; accruedBorrowCents: number }): ShortLot => ({
  qty: p.qty,
  markCents: p.lastMarkCents ?? p.avgShortCents,
  accruedBorrowCents: p.accruedBorrowCents,
});

// ── marking + the margin call (the mutation the tick + actions call) ─────────
/** Re-quote every OPEN position, accrue borrow since its last mark, write a mark point, then run the
 *  margin check — force-covering the worst shorts until equity clears the maintenance requirement —
 *  and snapshot book equity. Pure math + quotes; no model tokens. */
export async function markLab(labId: number): Promise<void> {
  const lab = await prisma.shortLab.findUnique({ where: { id: labId } });
  if (!lab) return;
  const open = await prisma.shortPosition.findMany({ where: { labId, status: "OPEN" } });
  if (open.length === 0) {
    await snapshot(labId, lab.cashCents, []);
    return;
  }
  const quotes = await getQuotes(open.map((p) => p.symbol));
  const now = new Date();
  const marked: ShortPosition[] = [];
  for (const p of open) {
    const mark = quotes.get(p.symbol.toUpperCase())?.midCents ?? p.lastMarkCents ?? p.avgShortCents;
    const days = Math.max(0, (now.getTime() - p.lastAccruedAt.getTime()) / DAY_MS);
    // Carry = borrow fee + any dividend whose ex-date fell since the last mark (a short OWES it). Both
    // fold into accruedBorrow (settled on cover), so equity reflects them.
    const divPerShare = await shortDividendCents(p.symbol, p.lastAccruedAt.toISOString().slice(0, 10));
    const divCost = divPerShare * p.qty;
    const accrued = p.accruedBorrowCents + accrueBorrowCents(p.qty * mark, p.borrowBps, days) + divCost;
    const unreal = shortUnrealizedCents(p.qty, p.avgShortCents, mark, accrued);
    const updated = await prisma.shortPosition.update({ where: { id: p.id }, data: { lastMarkCents: mark, accruedBorrowCents: accrued, lastAccruedAt: now } });
    await prisma.shortPositionMark.create({ data: { positionId: p.id, markCents: mark, unrealCents: unreal, accruedBorrowCents: accrued } });
    if (divCost > 0) await prisma.shortTrade.create({ data: { labId, symbol: p.symbol, side: "DIVIDEND", qty: p.qty, priceCents: divPerShare, borrowCostCents: divCost, card: `Paid ${money(divCost)} in dividends on the ${p.symbol} short — a short OWES the dividend to the share lender, another cost of holding it.` } });
    marked.push(updated);
  }

  // Margin check → force-cover the worst until equity ≥ requirement.
  let cash = lab.cashCents;
  let lots = marked.slice();
  let health = marginHealth(cash, lots.map(toLot), lab.maintMarginPct);
  while (health.call && lots.length > 0) {
    const worst = lots.reduce((a, b) => (shortUnrealizedCents(a.qty, a.avgShortCents, a.lastMarkCents ?? a.avgShortCents, a.accruedBorrowCents) < shortUnrealizedCents(b.qty, b.avgShortCents, b.lastMarkCents ?? b.avgShortCents, b.accruedBorrowCents) ? a : b));
    const exit = worst.lastMarkCents ?? worst.avgShortCents;
    const realized = coverRealizedCents(worst.qty, worst.avgShortCents, exit, worst.accruedBorrowCents);
    cash -= worst.qty * exit + worst.accruedBorrowCents;
    await prisma.shortPosition.update({ where: { id: worst.id }, data: { status: "CALLED", closedAt: now, exitCents: exit, realizedPnlCents: realized } });
    await prisma.shortTrade.create({ data: { labId, symbol: worst.symbol, side: "MARGIN_CALL", qty: worst.qty, priceCents: exit, borrowCostCents: worst.accruedBorrowCents, realizedPnlCents: realized, card: marginCallCard(worst.symbol, worst.qty, exit, realized) } });
    lots = lots.filter((l) => l.id !== worst.id);
    health = marginHealth(cash, lots.map(toLot), lab.maintMarginPct);
  }
  if (cash !== lab.cashCents) await prisma.shortLab.update({ where: { id: labId }, data: { cashCents: cash } });
  await snapshot(labId, cash, lots.map(toLot), lab.maintMarginPct);
}

async function snapshot(labId: number, cashCents: number, lots: ShortLot[], maintPct = 30): Promise<void> {
  const h = marginHealth(cashCents, lots, maintPct);
  await prisma.shortLabSnapshot.create({ data: { labId, equityCents: h.equityCents, cashCents, shortMktValCents: lots.reduce((s, l) => s + l.qty * l.markCents, 0), marginUsedPct: Math.min(999, h.usedPct) } });
}

// ── open a short ─────────────────────────────────────────────────────────────
export async function openShort(labId: number, symbol: string, opts: { qty?: number; notionalCents?: number }): Promise<{ ok: true } | { error: string }> {
  const sym = symbol.trim().toUpperCase();
  if (!/^[A-Z0-9.\-]{1,12}$/.test(sym)) return { error: "Enter a valid ticker." };
  const lab = await prisma.shortLab.findUnique({ where: { id: labId } });
  if (!lab) return { error: "No lab." };
  const q = (await getQuotes([sym])).get(sym);
  if (!q || q.midCents <= 0) return { error: `No live quote for ${sym} (try a liquid US ticker).` };
  const price = q.midCents;
  const qty = opts.qty && opts.qty > 0 ? Math.floor(opts.qty) : opts.notionalCents ? Math.floor(opts.notionalCents / price) : 0;
  if (qty < 1) return { error: "Size is below one share at this price." };

  const openLots = (await prisma.shortPosition.findMany({ where: { labId, status: "OPEN" } })).map(toLot);
  const newCash = lab.cashCents + proceedsCents(qty, price);
  const health = marginHealth(newCash, [...openLots, { qty, markCents: price, accruedBorrowCents: 0 }], lab.maintMarginPct);
  if (health.call) return { error: "Not enough collateral to open this short safely (it would breach maintenance margin). Try fewer shares." };

  const borrowBps = modeledBorrowBps({ priceCents: price });
  const currency = sym.endsWith(".TO") ? "CAD" : "USD";
  await prisma.shortPosition.create({ data: { labId, symbol: sym, currency, qty, avgShortCents: price, borrowBps, lastMarkCents: price } });
  await prisma.shortLab.update({ where: { id: labId }, data: { cashCents: newCash } });
  await prisma.shortTrade.create({ data: { labId, symbol: sym, side: "SHORT_OPEN", qty, priceCents: price, card: openCard(sym, qty, price, borrowBps) } });
  await markLab(labId);
  return { ok: true };
}

// ── cover (close) a short ─────────────────────────────────────────────────────
export async function coverShort(positionId: number): Promise<{ ok: true } | { error: string }> {
  const p = await prisma.shortPosition.findUnique({ where: { id: positionId } });
  if (!p || p.status !== "OPEN") return { error: "Position not open." };
  const q = (await getQuotes([p.symbol])).get(p.symbol.toUpperCase());
  const exit = q?.midCents ?? p.lastMarkCents ?? p.avgShortCents;
  const now = new Date();
  const days = Math.max(0, (now.getTime() - p.lastAccruedAt.getTime()) / DAY_MS);
  const accrued = p.accruedBorrowCents + accrueBorrowCents(p.qty * exit, p.borrowBps, days);
  const realized = coverRealizedCents(p.qty, p.avgShortCents, exit, accrued);
  await prisma.shortPosition.update({ where: { id: p.id }, data: { status: "COVERED", closedAt: now, exitCents: exit, realizedPnlCents: realized, accruedBorrowCents: accrued, lastMarkCents: exit } });
  await prisma.shortLab.update({ where: { id: p.labId }, data: { cashCents: { decrement: p.qty * exit + accrued } } });
  await prisma.shortTrade.create({ data: { labId: p.labId, symbol: p.symbol, side: "COVER", qty: p.qty, priceCents: exit, borrowCostCents: accrued, realizedPnlCents: realized, card: coverCard(p.symbol, p.qty, exit, realized) } });
  await markLab(p.labId);
  return { ok: true };
}

export async function resetLab(labId: number): Promise<void> {
  const lab = await prisma.shortLab.findUnique({ where: { id: labId } });
  if (!lab) return;
  await prisma.shortPosition.deleteMany({ where: { labId } }); // cascades marks
  await prisma.shortTrade.deleteMany({ where: { labId } });
  await prisma.shortLabSnapshot.deleteMany({ where: { labId } });
  await prisma.shortLab.update({ where: { id: labId }, data: { cashCents: lab.startingCashCents, status: "RUNNING" } });
}

// ── read layer for the page ────────────────────────────────────────────────
export type ShortHolding = {
  id: number;
  symbol: string;
  companyName: string | null;
  currency: string;
  qty: number;
  avgShortCents: number;
  markCents: number;
  liabilityCents: number;
  borrowBps: number;
  accruedBorrowCents: number;
  unrealCents: number;
  returnPct: number;
  daysHeld: number;
  decay: number[];
  card: string;
};
export type ShortResolved = { id: number; symbol: string; qty: number; avgShortCents: number; exitCents: number; side: "COVER" | "MARGIN_CALL"; realizedPnlCents: number; returnPct: number; at: Date; decay: number[]; card: string };
export type ShortView = {
  lab: { id: number; name: string; cashCents: number; startingCashCents: number; maintMarginPct: number; status: string };
  equityCents: number;
  shortMktValCents: number;
  health: MarginHealth;
  realizedCents: number;
  open: ShortHolding[];
  history: ShortResolved[];
  navHistory: { at: Date; returnPct: number }[];
};

export async function loadShortLab(labId?: number): Promise<ShortView> {
  const lab = labId ? (await prisma.shortLab.findUnique({ where: { id: labId } })) ?? (await ensureHouseLab()) : await ensureHouseLab();
  const [positions, trades, snaps] = await Promise.all([
    prisma.shortPosition.findMany({ where: { labId: lab.id }, orderBy: { openedAt: "desc" }, include: { marks: { orderBy: { at: "asc" }, select: { unrealCents: true } } } }),
    prisma.shortTrade.findMany({ where: { labId: lab.id }, orderBy: { at: "desc" }, take: 60 }),
    prisma.shortLabSnapshot.findMany({ where: { labId: lab.id }, orderBy: { at: "asc" }, take: 400 }),
  ]);
  const openRows = positions.filter((p) => p.status === "OPEN");
  const quotes = await getQuotes(openRows.map((p) => p.symbol));
  const now = Date.now();

  const open: ShortHolding[] = openRows.map((p) => {
    const mark = quotes.get(p.symbol.toUpperCase())?.midCents ?? p.lastMarkCents ?? p.avgShortCents;
    const days = Math.max(0, (now - p.lastAccruedAt.getTime()) / DAY_MS);
    const accrued = p.accruedBorrowCents + accrueBorrowCents(p.qty * mark, p.borrowBps, days);
    const unreal = shortUnrealizedCents(p.qty, p.avgShortCents, mark, accrued);
    return {
      id: p.id,
      symbol: p.symbol,
      companyName: p.companyName,
      currency: p.currency,
      qty: p.qty,
      avgShortCents: p.avgShortCents,
      markCents: mark,
      liabilityCents: p.qty * mark,
      borrowBps: p.borrowBps,
      accruedBorrowCents: accrued,
      unrealCents: unreal,
      returnPct: retOnNotional(unreal, p.qty, p.avgShortCents),
      daysHeld: Math.max(0, Math.floor((now - p.openedAt.getTime()) / DAY_MS)),
      decay: p.marks.map((m) => m.unrealCents),
      card: openCard(p.symbol, p.qty, p.avgShortCents, p.borrowBps),
    };
  });

  const lots: ShortLot[] = open.map((h) => ({ qty: h.qty, markCents: h.markCents, accruedBorrowCents: h.accruedBorrowCents }));
  const health = marginHealth(lab.cashCents, lots, lab.maintMarginPct);
  const shortMktValCents = lots.reduce((s, l) => s + l.qty * l.markCents, 0);

  const history: ShortResolved[] = positions
    .filter((p) => p.status !== "OPEN" && p.exitCents != null && p.realizedPnlCents != null)
    .slice(0, 20)
    .map((p) => ({
      id: p.id,
      symbol: p.symbol,
      qty: p.qty,
      avgShortCents: p.avgShortCents,
      exitCents: p.exitCents!,
      side: p.status === "CALLED" ? "MARGIN_CALL" : "COVER",
      realizedPnlCents: p.realizedPnlCents!,
      returnPct: retOnNotional(p.realizedPnlCents!, p.qty, p.avgShortCents),
      at: p.closedAt ?? p.openedAt,
      decay: p.marks.map((m) => m.unrealCents),
      card: (p.status === "CALLED" ? marginCallCard : coverCard)(p.symbol, p.qty, p.exitCents!, p.realizedPnlCents!),
    }));

  const realizedCents = positions.filter((p) => p.status !== "OPEN").reduce((s, p) => s + (p.realizedPnlCents ?? 0), 0);
  const navHistory = snaps.map((s) => ({ at: s.at, returnPct: lab.startingCashCents > 0 ? ((s.equityCents - lab.startingCashCents) / lab.startingCashCents) * 100 : 0 }));
  void trades; // reserved for a future raw-ledger view

  return {
    lab: { id: lab.id, name: lab.name, cashCents: lab.cashCents, startingCashCents: lab.startingCashCents, maintMarginPct: lab.maintMarginPct, status: lab.status },
    equityCents: health.equityCents,
    shortMktValCents,
    health,
    realizedCents,
    open,
    history,
    navHistory,
  };
}
