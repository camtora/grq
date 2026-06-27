import { prisma } from "../../lib/db";
import { getQuote, getQuotes } from "../../lib/broker/quotes";
import { currencyForSymbol } from "../../lib/universe";
import { usdCadRate, toCadCents } from "../../lib/fx";
import { ibkrFixedCommissionCents } from "../../lib/broker/sim";
import { fetchOptionChain, type OptChain } from "../../lib/options/cboe";
import { pickContract, markContractCents, findContract, intrinsicCents, daysToExpiry } from "../../lib/options/price";
import { DESK, DIALS, RACE, AGENT_VERSION } from "../policy";
import { runSession } from "../sessions";
import { chatComplete, isOpenRouterModel } from "../openrouter";
import { PERSONA } from "../persona";
import { startOfEtDay, isMarketOpen, etParts } from "../calendar";
import { buildDeskContext, type DeskEntrantLite } from "./context";
import { parseDeskCall, type DeskCall } from "./parse";

// The Options Desk engine — a Bulls-style SANDBOX (docs/THE-OPTIONS-DESK.md). Each session, each arm
// (control = stock-only, treatment = stock + buy-to-open options) decides one action that fills into
// ITS OWN DeskEntrant book. FULLY ISOLATED: only ever touches the OptionsDesk/Desk* tables, never the
// real Account/Position/Trade, the §6 gate, or the broker — and never trades REAL options. Reuses the
// sim fill MATH for stocks; options are MODELED (CBOE delayed mid / Black-Scholes), defined-risk,
// buy-to-open only.

type Lite = { id: number; arm: string; dial: string; cashCents: number };
type FillResult = { filled: boolean; rejectReason: string | null; strikeCents?: number; expiry?: string };

const bareUsTicker = (sym: string) => sym.toUpperCase().replace(/\.(US|USD|USA)$/i, "");
/** IBKR options: $0.65/contract, $1.00 min. USD cents. */
const optionCommissionCents = (contracts: number) => Math.max(100, contracts * 65);

/** Mark a book to CAD: stocks to live quotes, options to the engine's stored per-share mark. */
async function valueDeskBook(entrantId: number, cashCents: number, fx: number | null): Promise<{ positionsCadCents: number; optionsCadCents: number; navCadCents: number }> {
  const positions = await prisma.deskPosition.findMany({ where: { entrantId } });
  const stockSyms = positions.filter((p) => p.kind === "STOCK").map((p) => p.underlying);
  const quotes = stockSyms.length ? await getQuotes(stockSyms) : new Map();
  let positionsCad = 0;
  let optionsCad = 0;
  for (const p of positions) {
    if (p.kind === "STOCK") {
      const q = quotes.get(p.underlying.toUpperCase());
      const last = q && q.midCents > 0 ? q.midCents : p.avgCostCents;
      positionsCad += toCadCents(p.qty * last, p.currency, fx);
    } else {
      const mark = p.lastMarkCents != null && p.lastMarkCents > 0 ? p.lastMarkCents : p.avgCostCents;
      const v = toCadCents(p.qty * 100 * mark, p.currency, fx);
      positionsCad += v;
      optionsCad += v;
    }
  }
  return { positionsCadCents: positionsCad, optionsCadCents: optionsCad, navCadCents: cashCents + positionsCad };
}

// ── Stock fill (mirrors agent/race/engine.ts applyRaceFill, on Desk* tables) ──────────────────────
async function applyStockFill(entrant: Lite, call: DeskCall, sessionAt: Date, fx: number | null): Promise<FillResult> {
  if (!call.symbol || !call.qty || call.qty <= 0) return { filled: false, rejectReason: "no symbol/qty in call" };
  const dial = DIALS[entrant.dial as keyof typeof DIALS] ?? DIALS.BALANCED;
  const symbol = call.symbol.toUpperCase();
  const qty = call.qty;
  const q = await getQuote(symbol).catch(() => null);
  if (!q || q.midCents <= 0) return { filled: false, rejectReason: `no quote for ${symbol}` };
  const priceNative = q.midCents;
  const ccy = await currencyForSymbol(symbol).catch(() => "CAD");
  const commission = ibkrFixedCommissionCents(qty, priceNative);

  if (call.action === "BUY") {
    const weekAgo = new Date(sessionAt.getTime() - 7 * 24 * 60 * 60 * 1000);
    const buysWeek = await prisma.deskTrade.count({ where: { entrantId: entrant.id, side: "BUY", kind: "STOCK", at: { gte: weekAgo } } });
    if (buysWeek >= dial.maxNewTradesPerWeek) return { filled: false, rejectReason: `weekly stock-buy cap (${dial.maxNewTradesPerWeek}) reached` };

    const grossNative = qty * priceNative + commission;
    const costCad = toCadCents(grossNative, ccy, fx);
    if (costCad > entrant.cashCents) return { filled: false, rejectReason: `insufficient cash: need ${(costCad / 100).toFixed(2)}, have ${(entrant.cashCents / 100).toFixed(2)} CAD` };

    const book = await valueDeskBook(entrant.id, entrant.cashCents, fx);
    const existing = await prisma.deskPosition.findFirst({ where: { entrantId: entrant.id, kind: "STOCK", underlying: symbol } });
    const newPosValueCad = toCadCents(((existing?.qty ?? 0) + qty) * priceNative, ccy, fx);
    if (newPosValueCad > (book.navCadCents * dial.maxPositionPct) / 100) return { filled: false, rejectReason: `exceeds ${dial.maxPositionPct}% position cap` };
    if (entrant.cashCents - costCad < (book.navCadCents * dial.cashFloorPct) / 100) return { filled: false, rejectReason: `would breach ${dial.cashFloorPct}% cash floor` };

    await prisma.$transaction(async (tx) => {
      const pos = await tx.deskPosition.findFirst({ where: { entrantId: entrant.id, kind: "STOCK", underlying: symbol } });
      if (pos) {
        const nq = pos.qty + qty;
        const newAvg = Math.round((pos.qty * pos.avgCostCents + grossNative) / nq);
        await tx.deskPosition.update({ where: { id: pos.id }, data: { qty: nq, avgCostCents: newAvg } });
      } else {
        await tx.deskPosition.create({ data: { entrantId: entrant.id, kind: "STOCK", underlying: symbol, qty, avgCostCents: Math.round(grossNative / qty), currency: ccy } });
      }
      await tx.deskEntrant.update({ where: { id: entrant.id }, data: { cashCents: { decrement: costCad } } });
      await tx.deskTrade.create({ data: { entrantId: entrant.id, sessionAt, kind: "STOCK", underlying: symbol, side: "BUY", qty, priceCents: priceNative, currency: ccy, commissionCents: commission } });
    });
    return { filled: true, rejectReason: null };
  }

  // SELL — trim/exit a held name (no shorting).
  const pos = await prisma.deskPosition.findFirst({ where: { entrantId: entrant.id, kind: "STOCK", underlying: symbol } });
  if (!pos || pos.qty < qty) return { filled: false, rejectReason: `insufficient shares: hold ${pos?.qty ?? 0} ${symbol} (no shorting)` };
  const proceedsCad = toCadCents(qty * priceNative - commission, ccy, fx);
  const realizedCad = toCadCents(qty * (priceNative - pos.avgCostCents) - commission, ccy, fx);
  await prisma.$transaction(async (tx) => {
    const remaining = pos.qty - qty;
    if (remaining === 0) await tx.deskPosition.delete({ where: { id: pos.id } });
    else await tx.deskPosition.update({ where: { id: pos.id }, data: { qty: remaining } });
    await tx.deskEntrant.update({ where: { id: entrant.id }, data: { cashCents: { increment: proceedsCad } } });
    await tx.deskTrade.create({ data: { entrantId: entrant.id, sessionAt, kind: "STOCK", underlying: symbol, side: "SELL", qty, priceCents: priceNative, currency: ccy, commissionCents: commission, realizedPnlCents: realizedCad } });
  });
  return { filled: true, rejectReason: null };
}

// ── Option open: BUY-TO-OPEN a call/put (defined risk; treatment only) ────────────────────────────
async function applyOptionOpen(entrant: Lite, call: DeskCall, sessionAt: Date, fx: number | null, now: Date): Promise<FillResult> {
  if (!call.symbol || !call.right || !call.qty || call.qty <= 0) return { filled: false, rejectReason: "option call needs symbol + right + qty" };
  const contracts = call.qty;
  const bias = call.bias ?? "ATM";
  const bare = bareUsTicker(call.symbol);
  const chain = await fetchOptionChain(bare).catch(() => null);
  if (!chain) return { filled: false, rejectReason: `no listed US options for ${bare}` };
  const c = pickContract(chain, call.right, bias, now, DESK.minDte, DESK.maxDte);
  if (!c) return { filled: false, rejectReason: `no ${DESK.minDte}-${DESK.maxDte}d contract for ${bare}` };
  const premium = markContractCents(c, chain.spotCents, now);
  if (premium <= 0) return { filled: false, rejectReason: `no priceable premium for ${bare} ${c.strikeCents / 100} ${call.right}` };

  const commission = optionCommissionCents(contracts);
  const premiumNativeUsd = contracts * 100 * premium;
  const costCad = toCadCents(premiumNativeUsd + commission, "USD", fx);
  if (costCad > entrant.cashCents) return { filled: false, rejectReason: `insufficient cash: premium ${(costCad / 100).toFixed(2)} CAD > cash ${(entrant.cashCents / 100).toFixed(2)}` };

  const book = await valueDeskBook(entrant.id, entrant.cashCents, fx);
  const premiumCad = toCadCents(premiumNativeUsd, "USD", fx);
  const cap = (book.navCadCents * DESK.optionMaxPremiumPctNav) / 100;
  if (premiumCad > cap) return { filled: false, rejectReason: `premium ${(premiumCad / 100).toFixed(2)} CAD exceeds ${DESK.optionMaxPremiumPctNav}% NAV cap (${(cap / 100).toFixed(2)})` };

  const weekAgo = new Date(sessionAt.getTime() - 7 * 24 * 60 * 60 * 1000);
  const opensWeek = await prisma.deskTrade.count({ where: { entrantId: entrant.id, side: "BUY_TO_OPEN", at: { gte: weekAgo } } });
  if (opensWeek >= DESK.optionMaxOpenPerWeek) return { filled: false, rejectReason: `weekly option-open cap (${DESK.optionMaxOpenPerWeek}) reached` };

  await prisma.$transaction(async (tx) => {
    const pos = await tx.deskPosition.findFirst({ where: { entrantId: entrant.id, kind: call.right!, underlying: bare, strikeCents: c.strikeCents, expiry: c.expiry } });
    if (pos) {
      const nq = pos.qty + contracts;
      const newAvg = Math.round((pos.qty * pos.avgCostCents + contracts * premium) / nq);
      await tx.deskPosition.update({ where: { id: pos.id }, data: { qty: nq, avgCostCents: newAvg, lastMarkCents: premium } });
    } else {
      await tx.deskPosition.create({ data: { entrantId: entrant.id, kind: call.right!, underlying: bare, strikeCents: c.strikeCents, expiry: c.expiry, qty: contracts, avgCostCents: premium, currency: "USD", lastMarkCents: premium } });
    }
    await tx.deskEntrant.update({ where: { id: entrant.id }, data: { cashCents: { decrement: costCad } } });
    await tx.deskTrade.create({ data: { entrantId: entrant.id, sessionAt, kind: call.right!, underlying: bare, strikeCents: c.strikeCents, expiry: c.expiry, side: "BUY_TO_OPEN", qty: contracts, priceCents: premium, currency: "USD", commissionCents: commission } });
  });
  return { filled: true, rejectReason: null, strikeCents: c.strikeCents, expiry: c.expiry };
}

// ── Option close: SELL-TO-CLOSE a held call/put ───────────────────────────────────────────────────
async function applyOptionClose(entrant: Lite, call: DeskCall, sessionAt: Date, fx: number | null, now: Date): Promise<FillResult> {
  if (!call.symbol || !call.right) return { filled: false, rejectReason: "close needs symbol + right" };
  const bare = bareUsTicker(call.symbol);
  const pos = await prisma.deskPosition.findFirst({ where: { entrantId: entrant.id, kind: call.right, underlying: bare }, orderBy: { openedAt: "asc" } });
  if (!pos) return { filled: false, rejectReason: `no open ${bare} ${call.right} to close` };
  const contracts = Math.min(call.qty && call.qty > 0 ? call.qty : pos.qty, pos.qty);

  const chain = await fetchOptionChain(bare).catch(() => null);
  let mark = pos.lastMarkCents ?? pos.avgCostCents;
  if (chain) {
    const c = pos.strikeCents != null && pos.expiry ? findContract(chain, call.right, pos.strikeCents, pos.expiry) : null;
    mark = c ? markContractCents(c, chain.spotCents, now) : intrinsicCents(call.right, chain.spotCents, pos.strikeCents ?? 0);
  }
  const commission = optionCommissionCents(contracts);
  const proceedsCad = toCadCents(contracts * 100 * mark - commission, "USD", fx);
  const realizedCad = toCadCents(contracts * 100 * (mark - pos.avgCostCents) - commission, "USD", fx);
  await prisma.$transaction(async (tx) => {
    const remaining = pos.qty - contracts;
    if (remaining === 0) await tx.deskPosition.delete({ where: { id: pos.id } });
    else await tx.deskPosition.update({ where: { id: pos.id }, data: { qty: remaining } });
    await tx.deskEntrant.update({ where: { id: entrant.id }, data: { cashCents: { increment: proceedsCad } } });
    await tx.deskTrade.create({ data: { entrantId: entrant.id, sessionAt, kind: call.right!, underlying: bare, strikeCents: pos.strikeCents, expiry: pos.expiry, side: "SELL_TO_CLOSE", qty: contracts, priceCents: mark, currency: "USD", commissionCents: commission, realizedPnlCents: realizedCad } });
  });
  return { filled: true, rejectReason: null, strikeCents: pos.strikeCents ?? undefined, expiry: pos.expiry ?? undefined };
}

/** Settle any EXPIRED option legs to intrinsic value — credit cash, close the position, log EXPIRE.
 *  Run at the start of each session so freed cash is available and the book is clean. */
export async function settleExpiries(entrantId: number, fx: number | null, now: Date): Promise<number> {
  const opts = await prisma.deskPosition.findMany({ where: { entrantId, kind: { in: ["CALL", "PUT"] } } });
  let settled = 0;
  for (const p of opts) {
    if (!p.expiry || daysToExpiry(p.expiry, now) >= 0) continue; // not yet expired
    const right = p.kind as "CALL" | "PUT";
    const q = await getQuote(p.underlying).catch(() => null);
    const spot = q && q.midCents > 0 ? q.midCents : p.strikeCents ?? 0;
    const intrinsic = intrinsicCents(right, spot, p.strikeCents ?? 0);
    const proceedsCad = toCadCents(p.qty * 100 * intrinsic, "USD", fx);
    const realizedCad = toCadCents(p.qty * 100 * (intrinsic - p.avgCostCents), "USD", fx);
    await prisma.$transaction(async (tx) => {
      await tx.deskPosition.delete({ where: { id: p.id } });
      if (proceedsCad > 0) await tx.deskEntrant.update({ where: { id: entrantId }, data: { cashCents: { increment: proceedsCad } } });
      await tx.deskTrade.create({ data: { entrantId, sessionAt: now, kind: right, underlying: p.underlying, strikeCents: p.strikeCents, expiry: p.expiry, side: "EXPIRE", qty: p.qty, priceCents: intrinsic, currency: "USD", commissionCents: 0, realizedPnlCents: realizedCad } });
    });
    settled++;
  }
  return settled;
}

/** Re-fetch chains and update every held option's per-share mark (mid / Black-Scholes / intrinsic). */
async function refreshOptionMarks(entrantId: number, now: Date): Promise<void> {
  const opts = await prisma.deskPosition.findMany({ where: { entrantId, kind: { in: ["CALL", "PUT"] } } });
  const chains = new Map<string, OptChain | null>();
  for (const p of opts) {
    if (!chains.has(p.underlying)) chains.set(p.underlying, await fetchOptionChain(p.underlying).catch(() => null));
    const chain = chains.get(p.underlying);
    if (!chain) continue;
    const right = p.kind as "CALL" | "PUT";
    const c = p.strikeCents != null && p.expiry ? findContract(chain, right, p.strikeCents, p.expiry) : null;
    const mark = c ? markContractCents(c, chain.spotCents, now) : intrinsicCents(right, chain.spotCents, p.strikeCents ?? 0);
    await prisma.deskPosition.update({ where: { id: p.id }, data: { lastMarkCents: mark } });
  }
}

/** Mark the arm to live and append a NAV point (every session — even on HOLD — so the line shows decay). */
export async function snapshotDeskNav(entrantId: number, fx: number | null, now: Date): Promise<void> {
  const e = await prisma.deskEntrant.findUnique({ where: { id: entrantId } });
  if (!e) return;
  await refreshOptionMarks(entrantId, now);
  const book = await valueDeskBook(entrantId, e.cashCents, fx);
  await prisma.deskNavSnapshot.create({ data: { entrantId, navCadCents: book.navCadCents, cashCents: e.cashCents, positionsCadCents: book.positionsCadCents, optionsCadCents: book.optionsCadCents } });
}

/** Route a parsed call to the right fill path. Control arm can never trade options. */
export async function applyDeskFill(entrant: Lite, call: DeskCall, sessionAt: Date, fx: number | null, now: Date): Promise<FillResult> {
  if (call.action === "BUY" || call.action === "SELL") return applyStockFill(entrant, call, sessionAt, fx);
  if (call.action === "BUY_OPTION" || call.action === "SELL_OPTION") {
    if (entrant.arm !== "treatment") return { filled: false, rejectReason: "control arm is stock-only" };
    return call.action === "BUY_OPTION" ? applyOptionOpen(entrant, call, sessionAt, fx, now) : applyOptionClose(entrant, call, sessionAt, fx, now);
  }
  return { filled: false, rejectReason: null }; // HOLD / NONE
}

/** Run an arm one-shot, no tools. Claude rides the Max token (free); OpenRouter is metered + logged. */
async function runDeskModel(model: string, prompt: string, label: string): Promise<string | null> {
  if (isOpenRouterModel(model)) {
    const r = await chatComplete({ model, system: PERSONA, user: prompt });
    if (r) await prisma.agentUsage.create({ data: { label, model, status: "success", inputTokens: r.inTokens, outputTokens: r.outTokens, costMicroUsd: Math.round((r.costUsd || 0) * 1e6), agentVersion: AGENT_VERSION } }).catch(() => {});
    return r?.text ?? null;
  }
  return runSession({ label, prompt, model, withTools: false, maxTurns: 3 });
}

type EntrantRow = { id: number; model: string; arm: string; dial: string; label: string; cashCents: number };

/** One arm's desk session: settle → decide → fill → snapshot. Never throws into the tick. */
async function runDeskSession(entrant: EntrantRow, desk: { startingStakeCents: number }, sessionAt: Date, fx: number | null): Promise<void> {
  try {
    await settleExpiries(entrant.id, fx, sessionAt);
    const fresh = await prisma.deskEntrant.findUnique({ where: { id: entrant.id } });
    const cashCents = fresh?.cashCents ?? entrant.cashCents;
    const lite: DeskEntrantLite = { id: entrant.id, model: entrant.model, arm: entrant.arm, dial: entrant.dial, label: entrant.label, cashCents };
    const prompt = await buildDeskContext(lite, desk.startingStakeCents);
    const text = await runDeskModel(entrant.model, prompt, `desk:${entrant.arm}:${entrant.model}`);
    if (text == null) {
      console.error(`[optionsdesk] ${entrant.label} produced no output`);
      await snapshotDeskNav(entrant.id, fx, sessionAt);
      return;
    }
    const call = parseDeskCall(text);
    let res: FillResult = { filled: false, rejectReason: null };
    if (call && call.action !== "HOLD" && call.action !== "NONE") {
      res = await applyDeskFill({ id: entrant.id, arm: entrant.arm, dial: entrant.dial, cashCents }, call, sessionAt, fx, sessionAt);
    }
    await prisma.deskCall.create({
      data: {
        entrantId: entrant.id,
        sessionAt,
        action: call?.action ?? null,
        underlying: call?.symbol ?? null,
        right: call?.right ?? null,
        bias: call?.bias ?? null,
        strikeCents: res.strikeCents ?? null,
        expiry: res.expiry ?? null,
        qty: call?.qty ?? null,
        confidence: call?.confidence ?? null,
        thesis: call?.thesis ?? null,
        text,
        filled: res.filled,
        rejectReason: res.rejectReason,
      },
    });
    await snapshotDeskNav(entrant.id, fx, sessionAt);
    console.log(`[optionsdesk] ${entrant.label}: ${call?.action ?? "?"} ${call?.symbol ?? ""} ${res.filled ? "FILLED" : res.rejectReason ?? "(no trade)"}`);
  } catch (e) {
    console.error(`[optionsdesk] ${entrant.label} failed`, e instanceof Error ? e.message : e);
  }
}

/** Today's (ET) metered desk spend in USD (only non-Claude arms cost money; v1 is all-Opus = $0). */
async function meteredDeskSpentTodayUsd(): Promise<number> {
  const since = startOfEtDay(new Date());
  const rows = await prisma.agentUsage.findMany({ where: { at: { gte: since }, label: { startsWith: "desk" }, model: { contains: "/" } }, select: { costMicroUsd: true } }).catch(() => [] as { costMicroUsd: number }[]);
  return rows.reduce((s, r) => s + (r.costMicroUsd || 0), 0) / 1e6;
}

let deskRunning = false;

/** Fire any RUNNING Options Desk that's due this tick (one desk per tick). Market-hours only; daily
 *  cadence = once per ET day, hourly = once per ~hour. Background — must NOT block the 60s tick. */
export async function runDeskTick(): Promise<void> {
  if (deskRunning || !DESK.enabled || !RACE.enabled || !isMarketOpen()) return;
  const desks = await prisma.optionsDesk.findMany({ where: { status: "RUNNING" }, include: { entrants: { where: { status: "ACTIVE" } } } });
  if (desks.length === 0) return;

  const now = new Date();
  const dayStart = startOfEtDay(now);
  deskRunning = true;
  try {
    for (const desk of desks) {
      if (desk.entrants.length === 0) continue;
      let due: boolean;
      if (desk.cadence === "hourly") {
        const hourAgo = new Date(now.getTime() - 55 * 60 * 1000);
        due = (await prisma.deskCall.count({ where: { sessionAt: { gte: hourAgo }, entrant: { deskId: desk.id } } })) === 0;
      } else {
        due = (await prisma.deskCall.count({ where: { sessionAt: { gte: dayStart }, entrant: { deskId: desk.id } } })) === 0;
      }
      if (!due) continue;

      const fx = await usdCadRate().catch(() => null);
      const allowMetered = (await meteredDeskSpentTodayUsd()) < RACE.maxUsdPerDay;
      console.log(`[optionsdesk] running "${desk.name}" — ${desk.entrants.length} arms (${etParts(now).dateStr})`);
      await Promise.allSettled(
        desk.entrants.map((e) => {
          if (isOpenRouterModel(e.model) && !allowMetered) return Promise.resolve();
          return runDeskSession(e, desk, now, fx);
        }),
      );
      return; // one desk per tick
    }
  } finally {
    deskRunning = false;
  }
}
