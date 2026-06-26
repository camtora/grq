import { prisma } from "../../lib/db";
import { getQuote, getQuotes } from "../../lib/broker/quotes";
import { currencyForSymbol } from "../../lib/universe";
import { usdCadRate, toCadCents } from "../../lib/fx";
import { ibkrFixedCommissionCents } from "../../lib/broker/sim";
import { DIALS, RACE, AGENT_VERSION } from "../policy";
import { runSession } from "../sessions";
import { chatComplete, isOpenRouterModel } from "../openrouter";
import { PERSONA } from "../persona";
import { startOfEtDay, isMarketOpen } from "../calendar";
import { parseProposal } from "./shadow";
import { buildBullContext, type EntrantLite } from "./context";

// The Bull-Race engine — each session, every bull builds a prompt from ITS OWN book, decides one
// action, and that action fills into ITS OWN paper account. FULLY ISOLATED: only ever touches the
// Race* tables, never the real Account/Position/Trade or the §6 gate. Reuses the sim FILL MATH
// (commission + ACB) but not its singleton plumbing.

type EntrantRow = { id: number; model: string; dial: string; persona: string | null; label: string; cashCents: number };
type Call = { action: string; symbol: string | null; qty: number | null; confidence: number | null; thesis: string | null };

/** Mark a bull's positions to live quotes and return its CAD book value. */
async function valueBook(
  entrantId: number,
  cashCents: number,
  fx: number | null,
): Promise<{ positionsCadCents: number; navCadCents: number }> {
  const positions = await prisma.racePosition.findMany({ where: { entrantId } });
  if (positions.length === 0) return { positionsCadCents: 0, navCadCents: cashCents };
  const quotes = await getQuotes(positions.map((p) => p.symbol));
  let positionsCadCents = 0;
  for (const p of positions) {
    const q = quotes.get(p.symbol.toUpperCase());
    const lastNative = q && q.midCents > 0 ? q.midCents : p.avgCostCents;
    positionsCadCents += toCadCents(p.qty * lastNative, p.currency, fx);
  }
  return { positionsCadCents, navCadCents: cashCents + positionsCadCents };
}

/** The light race gate + the fill. Returns whether it filled and, if not, why. Mirrors sim.ts's
 *  fill math (commission in ACB, native ACB) but writes ONLY to the Race* tables. */
export async function applyRaceFill(
  entrant: { id: number; dial: string; cashCents: number },
  call: Call,
  sessionAt: Date,
  fx: number | null,
): Promise<{ filled: boolean; rejectReason: string | null }> {
  if (call.action !== "BUY" && call.action !== "SELL") return { filled: false, rejectReason: null };
  if (!call.symbol || !call.qty || call.qty <= 0) return { filled: false, rejectReason: "no symbol/qty in call" };

  const dial = DIALS[entrant.dial as keyof typeof DIALS] ?? DIALS.BALANCED;
  const symbol = call.symbol.toUpperCase();
  const qty = call.qty;

  const q = await getQuote(symbol).catch(() => null);
  if (!q || q.midCents <= 0) return { filled: false, rejectReason: `no quote for ${symbol}` };
  const priceNative = q.midCents;
  const ccy = await currencyForSymbol(symbol).catch(() => "CAD");
  const commissionNative = ibkrFixedCommissionCents(qty, priceNative);
  const key = { entrantId_symbol: { entrantId: entrant.id, symbol } };

  if (call.action === "BUY") {
    const weekAgo = new Date(sessionAt.getTime() - 7 * 24 * 60 * 60 * 1000);
    const buysWeek = await prisma.raceTrade.count({ where: { entrantId: entrant.id, side: "BUY", at: { gte: weekAgo } } });
    if (buysWeek >= dial.maxNewTradesPerWeek) return { filled: false, rejectReason: `weekly buy cap (${dial.maxNewTradesPerWeek}) reached` };

    const grossNative = qty * priceNative + commissionNative; // ACB includes commission (sim.ts parity)
    const costCad = toCadCents(grossNative, ccy, fx);
    if (costCad > entrant.cashCents)
      return { filled: false, rejectReason: `insufficient cash: need ${(costCad / 100).toFixed(2)}, have ${(entrant.cashCents / 100).toFixed(2)} CAD` };

    const book = await valueBook(entrant.id, entrant.cashCents, fx);
    const existing = await prisma.racePosition.findUnique({ where: key });
    const newPosValueCad = toCadCents(((existing?.qty ?? 0) + qty) * priceNative, ccy, fx);
    if (newPosValueCad > (book.navCadCents * dial.maxPositionPct) / 100)
      return { filled: false, rejectReason: `exceeds ${dial.maxPositionPct}% position cap` };
    if (entrant.cashCents - costCad < (book.navCadCents * dial.cashFloorPct) / 100)
      return { filled: false, rejectReason: `would breach ${dial.cashFloorPct}% cash floor` };

    await prisma.$transaction(async (tx) => {
      const pos = await tx.racePosition.findUnique({ where: key });
      if (pos) {
        const nq = pos.qty + qty;
        const newAvg = Math.round((pos.qty * pos.avgCostCents + grossNative) / nq);
        await tx.racePosition.update({ where: key, data: { qty: nq, avgCostCents: newAvg } });
      } else {
        await tx.racePosition.create({ data: { entrantId: entrant.id, symbol, qty, avgCostCents: Math.round(grossNative / qty), currency: ccy } });
      }
      await tx.raceEntrant.update({ where: { id: entrant.id }, data: { cashCents: { decrement: costCad } } });
      await tx.raceTrade.create({ data: { entrantId: entrant.id, sessionAt, symbol, side: "BUY", qty, priceCents: priceNative, currency: ccy, commissionCents: commissionNative } });
    });
    return { filled: true, rejectReason: null };
  }

  // SELL — trim/exit a held name (no shorting).
  const pos = await prisma.racePosition.findUnique({ where: key });
  if (!pos || pos.qty < qty) return { filled: false, rejectReason: `insufficient shares: hold ${pos?.qty ?? 0} ${symbol} (no shorting)` };
  const proceedsCad = toCadCents(qty * priceNative - commissionNative, ccy, fx);
  const realizedCad = toCadCents(qty * (priceNative - pos.avgCostCents) - commissionNative, ccy, fx);
  await prisma.$transaction(async (tx) => {
    const remaining = pos.qty - qty;
    if (remaining === 0) await tx.racePosition.delete({ where: key });
    else await tx.racePosition.update({ where: key, data: { qty: remaining } });
    await tx.raceEntrant.update({ where: { id: entrant.id }, data: { cashCents: { increment: proceedsCad } } });
    await tx.raceTrade.create({
      data: { entrantId: entrant.id, sessionAt, symbol, side: "SELL", qty, priceCents: priceNative, currency: ccy, commissionCents: commissionNative, realizedPnlCents: realizedCad },
    });
  });
  return { filled: true, rejectReason: null };
}

/** Mark the bull to live prices and append a NAV point (every session — even on HOLD — so the
 *  P&L line captures mark-to-market drift). */
export async function snapshotBullNav(entrantId: number, fx: number | null): Promise<void> {
  const e = await prisma.raceEntrant.findUnique({ where: { id: entrantId } });
  if (!e) return;
  const book = await valueBook(entrantId, e.cashCents, fx);
  await prisma.raceNavSnapshot.create({
    data: { entrantId, navCadCents: book.navCadCents, cashCents: e.cashCents, positionsCadCents: book.positionsCadCents },
  });
}

/** Run a model one-shot, no tools. Claude rides the Max token (free); OpenRouter is metered and
 *  logged to AgentUsage under a `race:bull:` label so it folds into the daily race cost cap. */
async function runBullModel(model: string, prompt: string, label: string): Promise<string | null> {
  if (isOpenRouterModel(model)) {
    const r = await chatComplete({ model, system: PERSONA, user: prompt });
    if (r) {
      await prisma.agentUsage
        .create({ data: { label, model, status: "success", inputTokens: r.inTokens, outputTokens: r.outTokens, costMicroUsd: Math.round((r.costUsd || 0) * 1e6), agentVersion: AGENT_VERSION } })
        .catch(() => {});
    }
    return r?.text ?? null;
  }
  return runSession({ label, prompt, model, withTools: false, maxTurns: 3 });
}

/** One bull's race session: decide → record → fill → snapshot. Never throws into the tick. */
async function runBullSession(entrant: EntrantRow, startingStakeCents: number, sessionAt: Date, fx: number | null): Promise<void> {
  try {
    const lite: EntrantLite = { id: entrant.id, model: entrant.model, dial: entrant.dial, persona: entrant.persona, label: entrant.label, cashCents: entrant.cashCents };
    const prompt = await buildBullContext(lite, startingStakeCents);
    const text = await runBullModel(entrant.model, prompt, `race:bull:${entrant.model}`);
    if (text == null) {
      console.error(`[bullrace] ${entrant.label} produced no output`);
      return;
    }
    const call = parseProposal(text);
    let filled = false;
    let rejectReason: string | null = null;
    if (call && (call.action === "BUY" || call.action === "SELL")) {
      const res = await applyRaceFill({ id: entrant.id, dial: entrant.dial, cashCents: entrant.cashCents }, call, sessionAt, fx);
      filled = res.filled;
      rejectReason = res.rejectReason;
    }
    await prisma.raceCall.create({
      data: {
        entrantId: entrant.id,
        sessionAt,
        action: call?.action ?? null,
        symbol: call?.symbol ?? null,
        qty: call?.qty ?? null,
        confidence: call?.confidence ?? null,
        thesis: call?.thesis ?? null,
        text,
        filled,
        rejectReason,
      },
    });
    await snapshotBullNav(entrant.id, fx);
    console.log(`[bullrace] ${entrant.label}: ${call?.action ?? "?"} ${call?.symbol ?? ""} ${filled ? "FILLED" : rejectReason ?? "(no trade)"}`);
  } catch (e) {
    console.error(`[bullrace] ${entrant.label} failed`, e instanceof Error ? e.message : e);
  }
}

/** Today's (ET) metered race spend in USD — folds shadow + bull OpenRouter cost into one cap. */
async function meteredRaceSpentTodayUsd(): Promise<number> {
  const since = startOfEtDay(new Date());
  const rows = await prisma.agentUsage
    .findMany({ where: { at: { gte: since }, label: { startsWith: "race" }, model: { contains: "/" } }, select: { costMicroUsd: true } })
    .catch(() => [] as { costMicroUsd: number }[]);
  return rows.reduce((s, r) => s + (r.costMicroUsd || 0), 0) / 1e6;
}

// Re-entrancy guard: the runner fires this in the BACKGROUND (a race session is ~8 model calls and
// must not block the 60s tick / heartbeat), so we must not let two overlap.
let raceRunning = false;

/** Fire any RUNNING race that's due this tick (one race per tick). Each bull runs its own session
 *  concurrently. Market-hours only; daily cadence = once per ET day, hourly = once per ~hour. */
export async function runRaceTick(): Promise<void> {
  if (raceRunning || !RACE.enabled || !isMarketOpen()) return;
  const races = await prisma.race.findMany({ where: { status: "RUNNING" }, include: { entrants: { where: { status: "ACTIVE" } } } });
  if (races.length === 0) return;

  const now = new Date();
  const dayStart = startOfEtDay(now);
  raceRunning = true;
  try {
  for (const race of races) {
    if (race.entrants.length === 0) continue;
    let due: boolean;
    if (race.cadence === "hourly") {
      const hourAgo = new Date(now.getTime() - 55 * 60 * 1000);
      due = (await prisma.raceCall.count({ where: { sessionAt: { gte: hourAgo }, entrant: { raceId: race.id } } })) === 0;
    } else {
      due = (await prisma.raceCall.count({ where: { sessionAt: { gte: dayStart }, entrant: { raceId: race.id } } })) === 0;
    }
    if (!due) continue;

    const fx = await usdCadRate().catch(() => null);
    const allowMetered = (await meteredRaceSpentTodayUsd()) < RACE.maxUsdPerDay;
    console.log(`[bullrace] running "${race.name}" — ${race.entrants.length} bulls (metered ${allowMetered ? "on" : "OVER CAP → claude only"})`);
    await Promise.allSettled(
      race.entrants.map((e) => {
        if (isOpenRouterModel(e.model) && !allowMetered) {
          console.log(`[bullrace] skip metered ${e.label} (daily cap)`);
          return Promise.resolve();
        }
        return runBullSession(e, race.startingStakeCents, now, fx);
      }),
    );
    return; // one race per tick — the next due race runs next tick
  }
  } finally {
    raceRunning = false;
  }
}
