import { prisma } from "../lib/db";
import { SimBroker, ibkrFixedCommissionCents } from "../lib/broker/sim";
import { getQuote } from "../lib/broker/quotes";
import { universeEntry } from "../lib/universe";
import { getPortfolio } from "../lib/portfolio";
import { isMarketOpen, minutesSinceOpen, minutesToClose, startOfEtDay } from "./calendar";
import { HARD, DIALS, AGENT_VERSION } from "./policy";

export type Thesis = {
  thesis: string;
  targetCents?: number;
  stopCents?: number;
  horizonDays?: number;
  invalidation?: string;
  confidence?: number;
  sources: string[];
};

export type AgentOrder = {
  symbol: string;
  side: "BUY" | "SELL";
  type: "MARKET" | "LIMIT";
  qty: number;
  limitPriceCents?: number;
};

export type Verdict = {
  ok: boolean;
  status?: "FILLED" | "PENDING";
  orderId?: number;
  fillPriceCents?: number;
  commissionCents?: number;
  rejectReason?: string;
};

let bootTime = Date.now();
export function markBoot(): void {
  bootTime = Date.now();
}

/** Day P&L in bps of day-open NAV. Used for the daily-loss pause. */
export async function dayPnlBps(): Promise<number> {
  const dayStart = startOfEtDay();
  const [openSnap, pf] = await Promise.all([
    prisma.navSnapshot.findFirst({ where: { at: { lt: dayStart } }, orderBy: { at: "desc" } }),
    getPortfolio(),
  ]);
  const base = openSnap?.navCents ?? pf.contributionsCents;
  if (base <= 0) return 0;
  return Math.round(((pf.navCents - base) / base) * 10_000);
}

export async function isDailyLossPaused(): Promise<boolean> {
  return (await dayPnlBps()) <= HARD.dailyLossPauseBps;
}

/**
 * The agent's full §6 gate. Checks policy, then hands off to the engine
 * (which independently re-checks its own layer). Every rejection is recorded
 * by the engine path or returned plainly so the model learns the rails.
 */
export async function validateAndPlace(order: AgentOrder, thesis: Thesis): Promise<Verdict> {
  const broker = new SimBroker();
  const symbol = order.symbol.toUpperCase();

  const refuse = (rejectReason: string): Verdict => ({ ok: false, rejectReason });

  // -- session/time rails --
  if (Date.now() - bootTime < HARD.warmupMs) return refuse("Agent warm-up: no trading within 5 minutes of a restart.");
  if (!isMarketOpen()) return refuse("Market is closed (9:30–16:00 ET trading window).");
  if (order.side === "BUY") {
    if (minutesSinceOpen() < HARD.noEntriesFirstMin) return refuse(`No new entries in the first ${HARD.noEntriesFirstMin} minutes (open is noisy).`);
    if (minutesToClose() < HARD.noEntriesLastMin) return refuse(`No new entries in the last ${HARD.noEntriesLastMin} minutes before close.`);
  }

  // -- thesis discipline --
  if (!thesis.thesis || thesis.sources.length === 0) return refuse("Every order needs a thesis with at least one source (attribution rule).");

  // -- universe & dial --
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  const dial = DIALS[settings?.riskLevel ?? "BALANCED"];
  const entry = universeEntry(symbol);
  if (!entry) return refuse(`${symbol} is not in the universe.`);
  if (order.side === "BUY" && !dial.tiers.includes(entry.tier)) {
    return refuse(`${symbol} (${entry.tier}) is outside the ${settings?.riskLevel ?? "BALANCED"} dial's universe.`);
  }

  // -- rate limits --
  const dayStart = startOfEtDay();
  const hourAgo = new Date(Date.now() - 60 * 60_000);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60_000);
  const [ordersToday, ordersHour, buysWeek, sameDayOpp] = await Promise.all([
    prisma.order.count({ where: { createdAt: { gte: dayStart }, placedBy: "agent", status: { not: "REJECTED" } } }),
    prisma.order.count({ where: { createdAt: { gte: hourAgo }, placedBy: "agent", status: { not: "REJECTED" } } }),
    prisma.order.count({ where: { createdAt: { gte: weekAgo }, placedBy: "agent", side: "BUY", status: "FILLED" } }),
    prisma.trade.count({ where: { at: { gte: dayStart }, symbol, side: order.side === "BUY" ? "SELL" : "BUY" } }),
  ]);
  if (ordersToday >= HARD.maxOrdersPerDay) return refuse(`Daily order limit reached (${HARD.maxOrdersPerDay}).`);
  if (ordersHour >= HARD.maxOrdersPerHour) return refuse(`Hourly order limit reached (${HARD.maxOrdersPerHour}).`);
  if (order.side === "BUY" && buysWeek >= dial.maxNewTradesPerWeek) {
    return refuse(`Weekly new-trade limit reached for the ${settings?.riskLevel} dial (${dial.maxNewTradesPerWeek}/wk).`);
  }
  if (sameDayOpp > 0) return refuse(`Same-day round trip in ${symbol} is prohibited (swing fund, not a day-trading bot).`);

  // -- pauses --
  if (order.side === "BUY" && (await isDailyLossPaused())) {
    return refuse("Daily-loss pause is active (day P&L ≤ −3% NAV): no new buys today. Risk-reducing sells are still allowed.");
  }

  // -- sizing, floors, fee edge (BUYs) --
  const quote = await getQuote(symbol);
  if (!quote) return refuse(`No quote for ${symbol}.`);
  const estPrice = order.side === "BUY" ? quote.askCents : quote.bidCents;
  const pf = await getPortfolio();

  if (order.side === "BUY") {
    const existing = pf.positions.find((p) => p.symbol === symbol);
    if (!existing && pf.positions.length >= HARD.maxPositions) {
      return refuse(`Max position count reached (${HARD.maxPositions}).`);
    }
    const commIn = ibkrFixedCommissionCents(order.qty, estPrice);
    const cost = order.qty * estPrice + commIn;
    const newPosValue = (existing?.marketValueCents ?? 0) + order.qty * estPrice;
    if (newPosValue > (pf.navCents * dial.maxPositionPct) / 100) {
      return refuse(`Position would exceed ${dial.maxPositionPct}% of NAV (${settings?.riskLevel} dial).`);
    }
    const cashAfter = pf.cashCents - cost;
    if (cashAfter < (pf.navCents * dial.cashFloorPct) / 100) {
      return refuse(`Buy would breach the ${dial.cashFloorPct}% cash floor (${settings?.riskLevel} dial).`);
    }
    if (thesis.targetCents && thesis.targetCents > estPrice) {
      const commOut = ibkrFixedCommissionCents(order.qty, thesis.targetCents);
      const edge = (thesis.targetCents - estPrice) * order.qty;
      if (edge < HARD.feeEdgeMultiple * (commIn + commOut)) {
        return refuse(
          `Fee-aware gate: expected edge $${(edge / 100).toFixed(2)} is under ${HARD.feeEdgeMultiple}× round-trip commissions $${((commIn + commOut) / 100).toFixed(2)}. Trade bigger conviction or skip.`,
        );
      }
    } else {
      return refuse("BUY orders need a price target above the current ask (fee-aware gate).");
    }
  }

  // -- engine (its own gate runs again: kill switch, staleness, cash/shares, fee budget) --
  const result = await broker.placeOrder({
    symbol,
    side: order.side,
    type: order.type,
    qty: order.qty,
    limitPriceCents: order.limitPriceCents,
    placedBy: "agent",
    reason: thesis.thesis,
  });

  // -- journal the DECISION with full thesis + attribution --
  const verdictText = result.ok
    ? result.status === "FILLED"
      ? `FILLED @ $${((result.fillPriceCents ?? 0) / 100).toFixed(2)} (commission $${((result.commissionCents ?? 0) / 100).toFixed(2)})`
      : `PENDING (resting limit #${result.orderId})`
    : `REJECTED — ${result.rejectReason}`;
  await prisma.journalEntry.create({
    data: {
      kind: "DECISION",
      symbol,
      orderId: result.ok ? result.orderId : undefined,
      title: `${order.side} ${order.qty} ${symbol} → ${result.ok ? (result.status ?? "") : "REJECTED"}`,
      body:
        `**Thesis:** ${thesis.thesis}\n\n` +
        (thesis.targetCents ? `**Target:** $${(thesis.targetCents / 100).toFixed(2)} · ` : "") +
        (thesis.stopCents ? `**Stop:** $${(thesis.stopCents / 100).toFixed(2)} · ` : "") +
        (thesis.horizonDays ? `**Horizon:** ${thesis.horizonDays}d · ` : "") +
        (typeof thesis.confidence === "number" ? `**Confidence:** ${thesis.confidence}%` : "") +
        (thesis.invalidation ? `\n\n**Invalidation:** ${thesis.invalidation}` : "") +
        `\n\n**Verdict:** ${verdictText}`,
      confidence: thesis.confidence,
      sourcesJson: JSON.stringify(thesis.sources),
      agentVersion: AGENT_VERSION,
    },
  });

  if (!result.ok) return { ok: false, orderId: result.orderId, rejectReason: result.rejectReason };
  return {
    ok: true,
    status: result.status,
    orderId: result.orderId,
    fillPriceCents: result.fillPriceCents,
    commissionCents: result.commissionCents,
  };
}
