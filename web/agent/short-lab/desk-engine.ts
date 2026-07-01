import { prisma } from "../../lib/db";
import { getQuotes } from "../../lib/broker/quotes";
import { SHORTDESK, DIALS } from "../policy";
import { runSession } from "../sessions";
import { isMarketOpen, startOfEtDay } from "../calendar";
import { buildShortDeskContext, type ShortArmLite } from "./desk-context";
import { parseShortDeskCall, type ShortDeskCall } from "./desk-parse";
import { shortUnrealizedCents, coverRealizedCents, accrueBorrowCents, modeledBorrowBps, marginHealth, type ShortLot } from "../../lib/short/mechanics";

// The Short Lab agent A/B engine (docs/SHORT-LAB.md Phase 2). Each session, each arm (control = long
// only, treatment = long + may SHORT) decides one action that fills into ITS OWN book. FULLY ISOLATED —
// only ever touches the ShortDesk* tables, never the real fund, the §6 gate, or the broker; the real
// fund never shorts (rule #3). Single-currency virtual book (no FX). Reuses lib/short/mechanics.
const DAY_MS = 86_400_000;
const COMMISSION = 100; // flat $1 modeled

type ArmLite = { id: number; arm: string; dial: string; cashCents: number };
type FillResult = { filled: boolean; rejectReason: string | null };
const priceOf = async (sym: string): Promise<number | null> => {
  const q = (await getQuotes([sym])).get(sym.toUpperCase());
  return q && q.midCents > 0 ? q.midCents : null;
};

async function armSnapshotInputs(armId: number, cashCents: number): Promise<{ equityCents: number; longValCents: number; shortLots: (ShortLot & { id: number; symbol: string; avgCostCents: number })[] }> {
  const positions = await prisma.shortDeskPosition.findMany({ where: { armId, status: "OPEN" } });
  const quotes = positions.length ? await getQuotes(positions.map((p) => p.symbol)) : new Map();
  const now = Date.now();
  let longVal = 0;
  const shortLots: (ShortLot & { id: number; symbol: string; avgCostCents: number })[] = [];
  for (const p of positions) {
    const mark = quotes.get(p.symbol.toUpperCase())?.midCents || p.lastMarkCents || p.avgCostCents;
    if (p.side === "SHORT") {
      const accrued = p.accruedBorrowCents + accrueBorrowCents(p.qty * mark, p.borrowBps, Math.max(0, (now - p.lastAccruedAt.getTime()) / DAY_MS));
      shortLots.push({ id: p.id, symbol: p.symbol, qty: p.qty, markCents: mark, accruedBorrowCents: accrued, avgCostCents: p.avgCostCents });
    } else longVal += p.qty * mark;
  }
  const health = marginHealth(cashCents + longVal, shortLots, SHORTDESK.maintMarginPct);
  return { equityCents: health.equityCents, longValCents: longVal, shortLots };
}

// ── fills ──────────────────────────────────────────────────────────────────
async function applyBuy(arm: ArmLite, call: ShortDeskCall, sessionAt: Date): Promise<FillResult> {
  if (!call.symbol || !call.qty) return { filled: false, rejectReason: "no symbol/qty" };
  const sym = call.symbol.toUpperCase();
  const price = await priceOf(sym);
  if (!price) return { filled: false, rejectReason: `no quote for ${sym}` };
  const cost = call.qty * price + COMMISSION;
  if (cost > arm.cashCents) return { filled: false, rejectReason: "insufficient cash" };
  const { equityCents } = await armSnapshotInputs(arm.id, arm.cashCents);
  const dial = DIALS[arm.dial as keyof typeof DIALS] ?? DIALS.BALANCED;
  const held = await prisma.shortDeskPosition.findFirst({ where: { armId: arm.id, symbol: sym, side: "LONG", status: "OPEN" } });
  if ((held ? held.qty * price : 0) + call.qty * price > (dial.maxPositionPct / 100) * equityCents) return { filled: false, rejectReason: `exceeds ${dial.maxPositionPct}% position cap` };
  if (held) {
    const newQty = held.qty + call.qty;
    await prisma.shortDeskPosition.update({ where: { id: held.id }, data: { qty: newQty, avgCostCents: Math.round((held.qty * held.avgCostCents + call.qty * price) / newQty), lastMarkCents: price } });
  } else {
    await prisma.shortDeskPosition.create({ data: { armId: arm.id, symbol: sym, side: "LONG", qty: call.qty, avgCostCents: price, lastMarkCents: price } });
  }
  await prisma.shortDeskArm.update({ where: { id: arm.id }, data: { cashCents: { decrement: cost } } });
  await prisma.shortDeskTrade.create({ data: { armId: arm.id, sessionAt, symbol: sym, side: "BUY", qty: call.qty, priceCents: price } });
  return { filled: true, rejectReason: null };
}

async function applySell(arm: ArmLite, call: ShortDeskCall, sessionAt: Date): Promise<FillResult> {
  if (!call.symbol) return { filled: false, rejectReason: "no symbol" };
  const sym = call.symbol.toUpperCase();
  const held = await prisma.shortDeskPosition.findFirst({ where: { armId: arm.id, symbol: sym, side: "LONG", status: "OPEN" } });
  if (!held) return { filled: false, rejectReason: `no ${sym} long to sell` };
  const price = await priceOf(sym);
  if (!price) return { filled: false, rejectReason: `no quote for ${sym}` };
  const qty = Math.min(call.qty ?? held.qty, held.qty);
  const realized = qty * (price - held.avgCostCents) - COMMISSION;
  if (qty >= held.qty) await prisma.shortDeskPosition.delete({ where: { id: held.id } });
  else await prisma.shortDeskPosition.update({ where: { id: held.id }, data: { qty: held.qty - qty } });
  await prisma.shortDeskArm.update({ where: { id: arm.id }, data: { cashCents: { increment: qty * price - COMMISSION } } });
  await prisma.shortDeskTrade.create({ data: { armId: arm.id, sessionAt, symbol: sym, side: "SELL", qty, priceCents: price, realizedPnlCents: realized } });
  return { filled: true, rejectReason: null };
}

async function applyShortOpen(arm: ArmLite, call: ShortDeskCall, sessionAt: Date): Promise<FillResult> {
  if (!call.symbol || !call.qty) return { filled: false, rejectReason: "no symbol/qty" };
  const sym = call.symbol.toUpperCase();
  const price = await priceOf(sym);
  if (!price) return { filled: false, rejectReason: `no quote for ${sym}` };
  const since = new Date(Date.now() - 7 * DAY_MS);
  if ((await prisma.shortDeskTrade.count({ where: { armId: arm.id, side: "SHORT_OPEN", at: { gte: since } } })) >= SHORTDESK.maxShortsPerWeek) return { filled: false, rejectReason: "weekly short cap" };
  const inputs = await armSnapshotInputs(arm.id, arm.cashCents);
  if (call.qty * price > (SHORTDESK.maxShortPctNav / 100) * inputs.equityCents) return { filled: false, rejectReason: `exceeds ${SHORTDESK.maxShortPctNav}% short cap` };
  const newCash = arm.cashCents + call.qty * price;
  const health = marginHealth(newCash + inputs.longValCents, [...inputs.shortLots, { qty: call.qty, markCents: price, accruedBorrowCents: 0 }], SHORTDESK.maintMarginPct);
  if (health.call) return { filled: false, rejectReason: "would breach maintenance margin" };
  await prisma.shortDeskPosition.create({ data: { armId: arm.id, symbol: sym, side: "SHORT", qty: call.qty, avgCostCents: price, borrowBps: modeledBorrowBps({ priceCents: price }), lastMarkCents: price } });
  await prisma.shortDeskArm.update({ where: { id: arm.id }, data: { cashCents: { increment: call.qty * price } } });
  await prisma.shortDeskTrade.create({ data: { armId: arm.id, sessionAt, symbol: sym, side: "SHORT_OPEN", qty: call.qty, priceCents: price } });
  return { filled: true, rejectReason: null };
}

async function applyCover(arm: ArmLite, call: ShortDeskCall, sessionAt: Date): Promise<FillResult> {
  if (!call.symbol) return { filled: false, rejectReason: "no symbol" };
  const sym = call.symbol.toUpperCase();
  const held = await prisma.shortDeskPosition.findFirst({ where: { armId: arm.id, symbol: sym, side: "SHORT", status: "OPEN" } });
  if (!held) return { filled: false, rejectReason: `no ${sym} short to cover` };
  const price = (await priceOf(sym)) ?? held.lastMarkCents ?? held.avgCostCents;
  const accrued = held.accruedBorrowCents + accrueBorrowCents(held.qty * price, held.borrowBps, Math.max(0, (Date.now() - held.lastAccruedAt.getTime()) / DAY_MS));
  const realized = coverRealizedCents(held.qty, held.avgCostCents, price, accrued);
  await prisma.shortDeskPosition.delete({ where: { id: held.id } });
  await prisma.shortDeskArm.update({ where: { id: arm.id }, data: { cashCents: { decrement: held.qty * price + accrued } } });
  await prisma.shortDeskTrade.create({ data: { armId: arm.id, sessionAt, symbol: sym, side: "COVER", qty: held.qty, priceCents: price, borrowCostCents: accrued, realizedPnlCents: realized } });
  return { filled: true, rejectReason: null };
}

async function applyShortDeskFill(arm: ArmLite, call: ShortDeskCall, sessionAt: Date): Promise<FillResult> {
  if (call.action === "BUY") return applyBuy(arm, call, sessionAt);
  if (call.action === "SELL") return applySell(arm, call, sessionAt);
  if (call.action === "COVER") return applyCover(arm, call, sessionAt);
  if (call.action === "SHORT") {
    if (arm.arm !== "treatment") return { filled: false, rejectReason: "control arm is long-only" };
    return applyShortOpen(arm, call, sessionAt);
  }
  return { filled: false, rejectReason: null }; // HOLD / NONE
}

// ── mark + margin call + snapshot ────────────────────────────────────────────
/** Mark OPEN positions to live, accrue borrow on shorts, and force-cover on a margin call. No nav write. */
export async function markArm(armId: number): Promise<void> {
  const positions = await prisma.shortDeskPosition.findMany({ where: { armId, status: "OPEN" } });
  if (positions.length === 0) return;
  const quotes = await getQuotes(positions.map((p) => p.symbol));
  const now = new Date();
  for (const p of positions) {
    const mark = quotes.get(p.symbol.toUpperCase())?.midCents || p.lastMarkCents || p.avgCostCents;
    if (p.side === "SHORT") {
      const accrued = p.accruedBorrowCents + accrueBorrowCents(p.qty * mark, p.borrowBps, Math.max(0, (now.getTime() - p.lastAccruedAt.getTime()) / DAY_MS));
      await prisma.shortDeskPosition.update({ where: { id: p.id }, data: { lastMarkCents: mark, accruedBorrowCents: accrued, lastAccruedAt: now } });
    } else await prisma.shortDeskPosition.update({ where: { id: p.id }, data: { lastMarkCents: mark } });
  }
  // margin check → force-cover worst shorts
  const arm = await prisma.shortDeskArm.findUnique({ where: { id: armId } });
  if (!arm) return;
  let cash = arm.cashCents;
  let inputs = await armSnapshotInputs(armId, cash);
  let health = marginHealth(cash + inputs.longValCents, inputs.shortLots, SHORTDESK.maintMarginPct);
  while (health.call && inputs.shortLots.length > 0) {
    const worst = inputs.shortLots.reduce((a, b) => (shortUnrealizedCents(a.qty, a.avgCostCents, a.markCents, a.accruedBorrowCents) < shortUnrealizedCents(b.qty, b.avgCostCents, b.markCents, b.accruedBorrowCents) ? a : b));
    const realized = coverRealizedCents(worst.qty, worst.avgCostCents, worst.markCents, worst.accruedBorrowCents ?? 0);
    cash -= worst.qty * worst.markCents + (worst.accruedBorrowCents ?? 0);
    await prisma.shortDeskPosition.delete({ where: { id: worst.id } });
    await prisma.shortDeskTrade.create({ data: { armId, sessionAt: now, symbol: worst.symbol, side: "MARGIN_CALL", qty: worst.qty, priceCents: worst.markCents, borrowCostCents: worst.accruedBorrowCents ?? 0, realizedPnlCents: realized } });
    inputs = { ...inputs, shortLots: inputs.shortLots.filter((l) => l.id !== worst.id) };
    health = marginHealth(cash + inputs.longValCents, inputs.shortLots, SHORTDESK.maintMarginPct);
  }
  if (cash !== arm.cashCents) await prisma.shortDeskArm.update({ where: { id: armId }, data: { cashCents: cash } });
}

/** Write one nav point for an arm (call after markArm). */
export async function snapshotArm(armId: number): Promise<void> {
  const arm = await prisma.shortDeskArm.findUnique({ where: { id: armId } });
  if (!arm) return;
  const inputs = await armSnapshotInputs(armId, arm.cashCents);
  const shortMktVal = inputs.shortLots.reduce((s, l) => s + l.qty * l.markCents, 0);
  await prisma.shortDeskNav.create({ data: { armId, equityCents: inputs.equityCents, cashCents: arm.cashCents, longValCents: inputs.longValCents, shortMktValCents: shortMktVal } });
}

// ── one arm's session ────────────────────────────────────────────────────────
async function runShortDeskSession(arm: { id: number; model: string; arm: string; dial: string; label: string; cashCents: number }, desk: { startingStakeCents: number; maintMarginPct: number }, sessionAt: Date): Promise<void> {
  try {
    await markArm(arm.id);
    const fresh = await prisma.shortDeskArm.findUnique({ where: { id: arm.id } });
    const cashCents = fresh?.cashCents ?? arm.cashCents;
    const lite: ShortArmLite = { id: arm.id, model: arm.model, arm: arm.arm, dial: arm.dial, label: arm.label, cashCents };
    const prompt = await buildShortDeskContext(lite, desk.startingStakeCents, desk.maintMarginPct);
    const text = await runSession({ label: `shortdesk:${arm.arm}`, prompt, model: arm.model, withTools: false, maxTurns: 3 });
    if (text == null) return;
    const call = parseShortDeskCall(text);
    let res: FillResult = { filled: false, rejectReason: null };
    if (call && call.action !== "HOLD" && call.action !== "NONE") {
      res = await applyShortDeskFill({ id: arm.id, arm: arm.arm, dial: arm.dial, cashCents }, call, sessionAt);
    }
    await prisma.shortDeskCall.create({
      data: { armId: arm.id, sessionAt, action: call?.action ?? null, symbol: call?.symbol ?? null, positionSide: call?.action === "SHORT" || call?.action === "COVER" ? "SHORT" : call?.action === "BUY" || call?.action === "SELL" ? "LONG" : null, qty: call?.qty ?? null, confidence: call?.confidence ?? null, thesis: call?.thesis ?? null, text, filled: res.filled, rejectReason: res.rejectReason },
    });
    console.log(`[shortdesk] ${arm.label}: ${call?.action ?? "?"} ${call?.symbol ?? ""} ${res.filled ? "FILLED" : res.rejectReason ?? "(no trade)"}`);
  } catch (e) {
    console.error(`[shortdesk] ${arm.label} failed`, e instanceof Error ? e.message : e);
  }
}

let running = false;

/** Fire any RUNNING Short-Desk that's due this tick. OFF unless GRQ_SHORTLAB_AGENT; market-hours only;
 *  daily = once/ET day, hourly = once/~hour. Background — must not block the tick. Spends Opus tokens. */
export async function runShortDeskTick(): Promise<void> {
  if (running || !SHORTDESK.enabled || !isMarketOpen()) return;
  const desks = await prisma.shortDesk.findMany({ where: { status: "RUNNING" }, include: { arms: { where: { status: "ACTIVE" } } } });
  if (desks.length === 0) return;
  const now = new Date();
  const dayStart = startOfEtDay(now);
  running = true;
  try {
    for (const desk of desks) {
      if (desk.arms.length === 0) continue;
      const gate = desk.cadence === "hourly" ? new Date(now.getTime() - 55 * 60 * 1000) : dayStart;
      const due = (await prisma.shortDeskCall.count({ where: { sessionAt: { gte: gate }, arm: { deskId: desk.id } } })) === 0;
      if (!due) continue;
      console.log(`[shortdesk] running "${desk.name}" — ${desk.arms.length} arms`);
      await Promise.allSettled(desk.arms.map((a) => runShortDeskSession(a, desk, now)));
      for (const a of desk.arms) {
        await markArm(a.id);
        await snapshotArm(a.id);
      }
    }
  } finally {
    running = false;
  }
}
