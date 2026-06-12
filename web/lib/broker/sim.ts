import { prisma } from "../db";
import { getQuote, getQuotes, isHardStale } from "./quotes";
import { universeSymbols, BENCHMARK } from "../universe";
import type { BrokerAdapter, PlaceOrderInput, PlaceOrderResult, Quote } from "./types";

/** IBKR Fixed (CAD stocks): $0.01/share, min $1.00/order, capped at 0.5% of
 *  trade value (the cap may undercut the minimum on small orders — that's how
 *  IBKR's schedule works). All cents. */
export function ibkrFixedCommissionCents(qty: number, priceCents: number): number {
  const value = qty * priceCents;
  const perShare = Math.max(100, qty * 1);
  const cap = Math.round(value * 0.005);
  return Math.max(1, Math.min(perShare, cap));
}

async function feeSpendThisMonthCents(): Promise<number> {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const agg = await prisma.trade.aggregate({
    where: { at: { gte: start } },
    _sum: { commissionCents: true },
  });
  return agg._sum.commissionCents ?? 0;
}

/** What the same contributions would be worth had they bought XIC instead. */
export async function benchmarkValueCents(): Promise<number | null> {
  const [contribs, xic] = await Promise.all([
    prisma.contribution.findMany(),
    getQuote(BENCHMARK),
  ]);
  if (!xic || contribs.length === 0) return null;
  let total = 0;
  for (const c of contribs) {
    if (c.xicPriceCents && c.xicPriceCents > 0) {
      total += Math.round((c.amountCents * xic.midCents) / c.xicPriceCents);
    } else {
      total += c.amountCents; // unknowable anchor — count at par
    }
  }
  return total;
}

export async function writeNavSnapshot(
  note?: string,
): Promise<{ navCents: number; cashCents: number; positionsCents: number }> {
  const [account, positions] = await Promise.all([
    prisma.account.findUnique({ where: { id: 1 } }),
    prisma.position.findMany(),
  ]);
  const quotes = await getQuotes(positions.map((p) => p.symbol));
  let positionsCents = 0;
  for (const p of positions) {
    const q = quotes.get(p.symbol);
    positionsCents += p.qty * (q?.midCents ?? p.avgCostCents);
  }
  const cashCents = account?.cashCents ?? 0;
  const navCents = cashCents + positionsCents;
  const benchmarkCents = await benchmarkValueCents().catch(() => null);
  await prisma.navSnapshot.create({
    data: { navCents, cashCents, positionsCents, benchmarkCents, note },
  });
  return { navCents, cashCents, positionsCents };
}

export class SimBroker implements BrokerAdapter {
  readonly kind = "sim";

  async getQuote(symbol: string): Promise<Quote> {
    const q = await getQuote(symbol);
    if (!q) throw new Error(`No quote for symbol: ${symbol}`);
    return q;
  }

  async getQuotes(symbols: string[]): Promise<Quote[]> {
    const m = await getQuotes(symbols);
    return symbols.map((s) => m.get(s.toUpperCase())).filter((q): q is Quote => !!q);
  }

  async listSymbols(): Promise<string[]> {
    return universeSymbols();
  }

  async placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
    const reject = async (rejectReason: string): Promise<PlaceOrderResult> => {
      const order = await prisma.order.create({
        data: {
          symbol: input.symbol.toUpperCase(),
          side: input.side,
          type: input.type,
          qty: input.qty,
          limitPriceCents: input.limitPriceCents,
          status: "REJECTED",
          rejectReason,
          placedBy: input.placedBy,
          reason: input.reason,
        },
      });
      return { ok: false, orderId: order.id, rejectReason };
    };

    // ---- Pre-trade gate (the deterministic part the model can't override) ----
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    if (settings?.killSwitch) return reject("Kill switch is engaged — all trading halted.");
    if (!Number.isInteger(input.qty) || input.qty <= 0) return reject("Quantity must be a positive whole number of shares.");

    const quote = await getQuote(input.symbol);
    if (!quote) return reject(`No quote available for ${input.symbol.toUpperCase()}.`);
    if (isHardStale(quote)) {
      return reject(
        `Quote for ${input.symbol.toUpperCase()} is stale (as of ${quote.at.toISOString()}) — refusing to fill blind.`,
      );
    }

    // Marketable? MARKET always; LIMIT only if it crosses the spread now.
    let fillPriceCents: number | null = null;
    if (input.type === "MARKET") {
      fillPriceCents = input.side === "BUY" ? quote.askCents : quote.bidCents;
    } else {
      if (!input.limitPriceCents || input.limitPriceCents <= 0) return reject("Limit orders need a positive limit price.");
      if (input.side === "BUY" && input.limitPriceCents >= quote.askCents) fillPriceCents = quote.askCents;
      if (input.side === "SELL" && input.limitPriceCents <= quote.bidCents) fillPriceCents = quote.bidCents;
    }

    const symbol = input.symbol.toUpperCase();

    if (fillPriceCents === null) {
      // Resting limit order — the agent's tick loop sweeps these on fresh quotes.
      const order = await prisma.order.create({
        data: {
          symbol,
          side: input.side,
          type: input.type,
          qty: input.qty,
          limitPriceCents: input.limitPriceCents,
          status: "PENDING",
          placedBy: input.placedBy,
          reason: input.reason,
        },
      });
      return { ok: true, orderId: order.id, status: "PENDING" };
    }

    return this.fillNow(input, symbol, fillPriceCents, settings?.agentVersion);
  }

  /** Fill a marketable order (or a swept resting order) at a known price. */
  async fillNow(
    input: PlaceOrderInput,
    symbol: string,
    price: number,
    agentVersion?: string,
    existingOrderId?: number,
  ): Promise<PlaceOrderResult> {
    const reject = async (rejectReason: string): Promise<PlaceOrderResult> => {
      if (existingOrderId) {
        await prisma.order.update({
          where: { id: existingOrderId },
          data: { status: "REJECTED", rejectReason },
        });
        return { ok: false, orderId: existingOrderId, rejectReason };
      }
      const order = await prisma.order.create({
        data: {
          symbol,
          side: input.side,
          type: input.type,
          qty: input.qty,
          limitPriceCents: input.limitPriceCents,
          status: "REJECTED",
          rejectReason,
          placedBy: input.placedBy,
          reason: input.reason,
        },
      });
      return { ok: false, orderId: order.id, rejectReason };
    };

    const commissionCents = ibkrFixedCommissionCents(input.qty, price);

    const account = await prisma.account.findUnique({ where: { id: 1 } });
    const cash = account?.cashCents ?? 0;
    if (input.side === "BUY") {
      const cost = input.qty * price + commissionCents;
      if (cost > cash) return reject(`Insufficient cash: need ${(cost / 100).toFixed(2)}, have ${(cash / 100).toFixed(2)} (no margin borrowing — guardrail).`);
    } else {
      const pos = await prisma.position.findUnique({ where: { symbol } });
      if (!pos || pos.qty < input.qty) return reject(`Insufficient shares: selling ${input.qty} ${symbol}, hold ${pos?.qty ?? 0} (no shorting — guardrail).`);
    }
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    const budget = settings?.feeBudgetCentsMonth ?? 2000;
    const spent = await feeSpendThisMonthCents();
    if (spent + commissionCents > budget) {
      return reject(`Monthly fee budget exhausted: ${(spent / 100).toFixed(2)} spent of ${(budget / 100).toFixed(2)}, this order adds ${(commissionCents / 100).toFixed(2)}.`);
    }

    // ---- Execute atomically ----
    const result = await prisma.$transaction(async (tx) => {
      const order = existingOrderId
        ? await tx.order.update({
            where: { id: existingOrderId },
            data: { status: "FILLED", filledQty: input.qty, avgFillPriceCents: price, commissionCents },
          })
        : await tx.order.create({
            data: {
              symbol,
              side: input.side,
              type: input.type,
              qty: input.qty,
              limitPriceCents: input.limitPriceCents,
              status: "FILLED",
              filledQty: input.qty,
              avgFillPriceCents: price,
              commissionCents,
              placedBy: input.placedBy,
              reason: input.reason,
            },
          });

      let realizedPnlCents: number | null = null;
      const pos = await tx.position.findUnique({ where: { symbol } });

      if (input.side === "BUY") {
        const totalCost = input.qty * price + commissionCents; // ACB includes commission
        if (pos) {
          const newQty = pos.qty + input.qty;
          const newAvg = Math.round((pos.qty * pos.avgCostCents + totalCost) / newQty);
          await tx.position.update({ where: { symbol }, data: { qty: newQty, avgCostCents: newAvg } });
        } else {
          await tx.position.create({
            data: { symbol, qty: input.qty, avgCostCents: Math.round(totalCost / input.qty) },
          });
        }
        await tx.account.update({ where: { id: 1 }, data: { cashCents: { decrement: totalCost } } });
      } else {
        realizedPnlCents = input.qty * (price - pos!.avgCostCents) - commissionCents;
        const remaining = pos!.qty - input.qty;
        if (remaining === 0) {
          await tx.position.delete({ where: { symbol } });
        } else {
          await tx.position.update({ where: { symbol }, data: { qty: remaining } });
        }
        await tx.account.update({
          where: { id: 1 },
          data: { cashCents: { increment: input.qty * price - commissionCents } },
        });
      }

      await tx.trade.create({
        data: { orderId: order.id, symbol, side: input.side, qty: input.qty, priceCents: price, commissionCents, realizedPnlCents },
      });

      await tx.journalEntry.create({
        data: {
          kind: "TRADE",
          symbol,
          orderId: order.id,
          title: `${input.side} ${input.qty} ${symbol} @ ${(price / 100).toFixed(2)}`,
          body:
            (input.reason ?? "(no thesis recorded)") +
            (realizedPnlCents !== null
              ? `\n\n**Realized P&L:** ${(realizedPnlCents / 100).toFixed(2)} CAD (after ${(commissionCents / 100).toFixed(2)} commission)`
              : `\n\n**Commission:** ${(commissionCents / 100).toFixed(2)} CAD`),
          agentVersion: agentVersion ?? "v1.0-phase2",
        },
      });

      return { orderId: order.id };
    });

    await writeNavSnapshot(`post-fill order #${result.orderId}`);
    return { ok: true, orderId: result.orderId, status: "FILLED", fillPriceCents: price, commissionCents };
  }

  /** Sweep resting limit orders against fresh quotes. Called by the agent tick. */
  async sweepPendingOrders(): Promise<number> {
    const pending = await prisma.order.findMany({ where: { status: "PENDING" } });
    let filled = 0;
    for (const o of pending) {
      const q = await getQuote(o.symbol);
      if (!q || isHardStale(q)) continue;
      let price: number | null = null;
      if (o.side === "BUY" && o.limitPriceCents && o.limitPriceCents >= q.askCents) price = q.askCents;
      if (o.side === "SELL" && o.limitPriceCents && o.limitPriceCents <= q.bidCents) price = q.bidCents;
      if (price === null) continue;
      const res = await this.fillNow(
        {
          symbol: o.symbol,
          side: o.side,
          type: o.type,
          qty: o.qty,
          limitPriceCents: o.limitPriceCents ?? undefined,
          placedBy: o.placedBy,
          reason: o.reason ?? undefined,
        },
        o.symbol,
        price,
        undefined,
        o.id,
      );
      if (res.ok) filled++;
    }
    return filled;
  }
}
