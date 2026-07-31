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

// ── Mirror lag, for VALUING the fund (D120) ────────────────────────────────────────────────────
//
// The same lag that let a stop oversell also lets NAV lie, in both directions:
//
//   a SELL not yet absorbed → the proceeds are already in cash (settleFill writes cash synchronously)
//                             while the sold shares are STILL marked → NAV DOUBLE-COUNTS them
//   a BUY  not yet absorbed → the cash is already gone and no position exists yet → NAV UNDERSTATED
//
// On 2026-07-29 two legal stops (TSM, ETN) produced a snapshot with $18,970 of proceeds counted
// twice: a phantom $86,795 NAV against a real $67,800. `checkDrawdown` reads the max NAV of all
// history, so that transient became a permanent high-water mark and halted the fund — the second
// time the same shape did it (D118 was the first, via oversells). Netting the lag off here means a
// double-counted NAV can no longer be WRITTEN; the `settled` flag means that even if one were, it
// could never become a mark.
//
// NOTE the deliberate difference from effectiveHeldQty() above: that gate is unbounded in time —
// it refuses to sell shares it cannot prove we hold, and waiting forever errs toward not-selling.
// Valuation errs the other way: a fill the mirror has ignored for longer than SETTLE_WINDOW_MS is a
// broken mirror, not a lagging one, and netting it off forever would itself become a standing lie.
const SETTLE_WINDOW_MS = 15 * 60_000;

export type MirrorLag = {
  /** symbol → FILLED sell qty the mirror hasn't absorbed. Subtract before valuing the position. */
  unabsorbedSells: Map<string, number>;
  /** symbols with a FILLED buy the mirror hasn't absorbed. Their value is missing from NAV. */
  unabsorbedBuys: Set<string>;
};

type LagPosition = { symbol: string; updatedAt: Date };
type LagFill = { symbol: string; side: string; filledQty: number; createdAt: Date };

/** Pure classification of fills against the mirror's watermarks. Split out from the query so the
 *  rule is testable without a database (test/nav-integrity.test.ts).
 *
 *  `Position.updatedAt` is the watermark of what the mirror has seen — the same reasoning as
 *  effectiveHeldQty: reconcile only writes on drift, so a read that repeats the current value leaves
 *  the watermark alone and the unabsorbed fills below it still count.
 *
 *  A SELL with NO position row is already absorbed: reconcile DELETES a position the broker stopped
 *  reporting, so a missing row means the close was mirrored — and a symbol we hold nothing of
 *  contributes nothing to NAV either way. A BUY with no row is the opposite: the position is missing
 *  from NAV precisely because the mirror hasn't caught up. */
export function classifyMirrorLag(positions: LagPosition[], fills: LagFill[]): MirrorLag {
  const watermark = new Map(positions.map((p) => [p.symbol, p.updatedAt]));
  const unabsorbedSells = new Map<string, number>();
  const unabsorbedBuys = new Set<string>();
  for (const f of fills) {
    const wm = watermark.get(f.symbol);
    if (f.side === "SELL") {
      if (wm && f.createdAt > wm) unabsorbedSells.set(f.symbol, (unabsorbedSells.get(f.symbol) ?? 0) + f.filledQty);
    } else if (!wm || f.createdAt > wm) {
      unabsorbedBuys.add(f.symbol);
    }
  }
  return { unabsorbedSells, unabsorbedBuys };
}

/** What the position mirror has not yet absorbed, across the whole fund. */
export async function mirrorLag(now = new Date()): Promise<MirrorLag> {
  const [positions, fills] = await Promise.all([
    prisma.position.findMany({ select: { symbol: true, updatedAt: true } }),
    prisma.order.findMany({
      where: { status: "FILLED", secType: "STK", createdAt: { gte: new Date(now.getTime() - SETTLE_WINDOW_MS) } },
      select: { symbol: true, side: true, filledQty: true, createdAt: true },
    }),
  ]);
  return classifyMirrorLag(positions, fills);
}

/** True when the mirror reflects every recent fill — i.e. a NAV taken now is a real mark, not a
 *  mid-settlement transient. `symbol` narrows it to one name (the post-fill wait in ibkr.ts). */
export function isSettled(lag: MirrorLag, symbol?: string): boolean {
  if (symbol) {
    const sym = symbol.toUpperCase();
    return !lag.unabsorbedSells.has(sym) && !lag.unabsorbedBuys.has(sym);
  }
  return lag.unabsorbedSells.size === 0 && lag.unabsorbedBuys.size === 0;
}
