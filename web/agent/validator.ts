import { prisma } from "../lib/db";
import { ibkrFixedCommissionCents } from "../lib/broker/sim";
import { toCadCents } from "../lib/fx";
import { getBroker } from "../lib/broker";
import { getQuote } from "../lib/broker/quotes";
import { universeEntry } from "../lib/universe";
import { getPortfolio, PAPER_INCEPTION } from "../lib/portfolio";
import { isMarketOpen, minutesSinceOpen, minutesToClose, startOfEtDay, etDateStr } from "./calendar";
import { HARD, DIALS, AGENT_VERSION } from "./policy";
import { alert } from "./alerts";

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
    prisma.navSnapshot.findFirst({ where: { at: { lt: dayStart, gte: PAPER_INCEPTION } }, orderBy: { at: "desc" } }),
    getPortfolio(),
  ]);
  // base = yesterday's close (paper-era only — never a pre-inception sim snapshot);
  // falls back to contributions on the first paper day.
  const base = openSnap?.navCents ?? pf.contributionsCents;
  if (base <= 0) return 0;
  return Math.round(((pf.navCents - base) / base) * 10_000);
}

// The daily-loss pause is a CONFIRMED, sticky-for-the-day flag the runner sets only
// after the loss persists across TWO consecutive ticks (mirrors the drawdown kill's
// 2-tick confirm — runner.ts). The BUY gate reads THIS flag, never a live recompute —
// so a transient NAV misread (a just-filled position not yet mirrored, which understates
// NAV for a tick) can no longer block trading on one bad reading. "No new buys today":
// once confirmed it holds for the rest of the ET day even if NAV bounces. In-memory —
// resets on restart toward not-halting, same as the drawdown breach counter.
let dailyLossPauseConfirmedDate: string | null = null;
export function setDailyLossPauseConfirmed(etDate: string | null): void {
  dailyLossPauseConfirmedDate = etDate;
}
export async function isDailyLossPaused(): Promise<boolean> {
  return dailyLossPauseConfirmedDate === etDateStr();
}

const SUPERFICIAL_LOSS_DAYS = 30;

/** Open superficial-loss windows: symbols sold at a realized loss within the
 *  last 30 days. Rebuying inside the window gets the loss denied by CRA. */
export async function superficialLossWindows(): Promise<{ symbol: string; until: Date }[]> {
  const since = new Date(Date.now() - SUPERFICIAL_LOSS_DAYS * 24 * 60 * 60_000);
  const losses = await prisma.trade.groupBy({
    by: ["symbol"],
    where: { side: "SELL", realizedPnlCents: { lt: 0 }, at: { gte: since } },
    _max: { at: true },
  });
  return losses
    .filter((l) => l._max.at !== null)
    .map((l) => ({
      symbol: l.symbol,
      until: new Date((l._max.at as Date).getTime() + SUPERFICIAL_LOSS_DAYS * 24 * 60 * 60_000),
    }));
}

/**
 * The agent's full §6 gate. Checks policy, then hands off to the engine
 * (which independently re-checks its own layer). Every rejection is recorded
 * by the engine path or returned plainly so the model learns the rails.
 */
export async function validateAndPlace(order: AgentOrder, thesis: Thesis): Promise<Verdict> {
  const broker = getBroker();
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

  // -- conviction gate (Graham, 2026-06-14): only act on high-conviction BUYs --
  if (order.side === "BUY" && (typeof thesis.confidence !== "number" || thesis.confidence < HARD.minBuyConfidence)) {
    return refuse(
      `Conviction gate: BUYs require ≥${HARD.minBuyConfidence}% thesis confidence — this one is ${typeof thesis.confidence === "number" ? `${thesis.confidence}%` : "unstated"}. The fund only acts on its strongest calls.`,
    );
  }

  // -- universe & dial (BUYs only — exits must never be trapped by membership) --
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  const dial = DIALS[settings?.riskLevel ?? "BALANCED"];
  if (order.side === "BUY") {
    const entry = await universeEntry(symbol);
    if (!entry || entry.status !== "ACTIVE") {
      return refuse(
        `${symbol} is not in the ACTIVE universe${entry ? ` (status: ${entry.status} — promotion needs both members)` : ""}.`,
      );
    }
    if (!entry.tier || !dial.tiers.includes(entry.tier)) {
      return refuse(`${symbol} (${entry.tier ?? "untiered"}) is outside the ${settings?.riskLevel ?? "BALANCED"} dial's universe.`);
    }
  }

  // -- member directives (2.6c): BLOCKED bars buys; sells always allowed --
  if (order.side === "BUY") {
    const directive = await prisma.symbolDirective.findUnique({ where: { symbol } });
    if (directive?.directive === "BLOCKED") {
      return refuse(
        `${symbol} is on the no-fly list (blocked by ${directive.by}${directive.note ? `: "${directive.note}"` : ""}). Members can unblock it on the stock page; you cannot.`,
      );
    }
  }

  // -- superficial-loss guard (2.6b): no rebuy within 30 days of a loss-sale --
  if (order.side === "BUY") {
    const windows = await superficialLossWindows();
    const w = windows.find((x) => x.symbol === symbol);
    if (w) {
      return refuse(
        `Superficial-loss guard: ${symbol} was sold at a loss within the last 30 days — CRA denies the loss if rebought before ${w.until.toISOString().slice(0, 10)}. Pick a different name or wait.`,
      );
    }
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
  const estPrice = order.side === "BUY" ? quote.askCents : quote.bidCents; // native currency
  const pf = await getPortfolio();
  // This name's currency → value the order in CAD for the §6 sizing/floor checks,
  // which are all CAD-denominated (D34 multi-currency). CAD names are unchanged.
  const posCcy = pf.positions.find((p) => p.symbol === symbol)?.currency ?? (await universeEntry(symbol))?.currency ?? "CAD";
  const cad = (cents: number) => toCadCents(cents, posCcy, pf.fxUsdCad);

  if (order.side === "BUY") {
    const existing = pf.positions.find((p) => p.symbol === symbol);
    // No cap on the number of distinct holdings (D52) — breadth is the agent's call.
    // Position sizing (maxPositionPct), the cash floor, the weekly BUY cap, and the
    // fee-edge floor still bound how many names it can realistically open.
    const commIn = ibkrFixedCommissionCents(order.qty, estPrice);
    const costCad = cad(order.qty * estPrice + commIn);
    const newPosValueCad = (existing?.marketValueCadCents ?? 0) + cad(order.qty * estPrice);
    if (newPosValueCad > (pf.navCents * dial.maxPositionPct) / 100) {
      return refuse(`Position would exceed ${dial.maxPositionPct}% of NAV (${settings?.riskLevel} dial).`);
    }
    const cashAfter = pf.cashCents - costCad;
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

  // Warn when a SELL is about to realize a loss and open a 30-day window.
  let sellLossNote = "";
  if (order.side === "SELL") {
    const pos = await prisma.position.findUnique({ where: { symbol } });
    if (pos && estPrice < pos.avgCostCents) {
      const until = new Date(Date.now() + SUPERFICIAL_LOSS_DAYS * 24 * 60 * 60_000)
        .toISOString()
        .slice(0, 10);
      sellLossNote = ` ⚠️ Realizes a loss — superficial-loss window opens: no rebuy of ${symbol} until ${until}.`;
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
  const verdictText =
    (result.ok
      ? result.status === "FILLED"
        ? `FILLED @ $${((result.fillPriceCents ?? 0) / 100).toFixed(2)} (commission $${((result.commissionCents ?? 0) / 100).toFixed(2)})`
        : `PENDING (resting limit #${result.orderId})`
      : `REJECTED — ${result.rejectReason}`) + (result.ok ? sellLossNote : "");
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

  // Discord ping on a position change. Only on a confirmed FILL — a PENDING order
  // (slow IBKR fill / resting limit) is announced by the runner's finalizePending
  // loop when it actually fills, so every fill pings exactly once. System
  // stops/take-profits alert on their own path (runner), never here.
  if (result.status === "FILLED") {
    await alert(
      "info",
      `${order.side === "BUY" ? "Bought" : "Sold"} ${order.qty} ${symbol} @ $${((result.fillPriceCents ?? 0) / 100).toFixed(2)}`,
      `${thesis.thesis}${sellLossNote}`,
    );
  }

  return {
    ok: true,
    status: result.status,
    orderId: result.orderId,
    fillPriceCents: result.fillPriceCents,
    commissionCents: result.commissionCents,
  };
}
