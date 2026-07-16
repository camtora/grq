// Effective position sizing for the SELL-side gate (rule #3, no shorting).
//
// The sim engine owns its own ledger and decrements a position inside the same transaction as the
// fill, so `Position.qty` is never stale there. The IBKR adapter does NOT: it defers position truth
// to reconcile(), which mirrors the broker a beat later. IBKR's own positions ledger lags a fill by
// seconds, so between a fill and the mirror catching up, `Position.qty` still reads the PRE-sale
// quantity — and a gate that trusts it will happily authorise the same sale again.
//
// That is exactly the 2026-07-16 CCO incident: a stop fired at 09:34 ET and sold the full 24-share
// position, the mirror stayed at 24, and the stop re-fired every tick for five minutes — 24 → 0 →
// −24 → −48 → −72 → −96. Nothing rejected it; the fund ended the morning short 96 shares, which
// rule #3 forbids outright.
//
// So the gate asks for the EFFECTIVE holding: what the mirror says, MINUS the filled sells the
// mirror has not absorbed yet.

import { prisma } from "../db";

/** Shares of `symbol` we can still sell: the mirrored position minus any FILLED sells the mirror
 *  hasn't absorbed. Returns 0 for a name we hold no row for, and can return ≤ 0 when the fund is
 *  already flat or (wrongly) short — in both cases every SELL must be refused.
 *
 *  `Position.updatedAt` is the watermark of what the mirror has seen. It's trustworthy for this
 *  purpose because reconcile() only writes the row when the broker read DIFFERS from it: a stale
 *  read that merely repeats the current value writes nothing and leaves the watermark where it was,
 *  so the unabsorbed sells below it still count. A read that moves the row is, by definition, one
 *  that has seen the sale. */
export async function effectiveHeldQty(symbol: string): Promise<number> {
  const sym = symbol.toUpperCase();
  const pos = await prisma.position.findUnique({ where: { symbol: sym } });
  if (!pos) return 0;

  const unmirrored = await prisma.order.aggregate({
    _sum: { filledQty: true },
    where: { symbol: sym, side: "SELL", status: "FILLED", secType: "STK", createdAt: { gt: pos.updatedAt } },
  });
  return pos.qty - (unmirrored._sum.filledQty ?? 0);
}
