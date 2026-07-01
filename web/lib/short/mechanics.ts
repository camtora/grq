// Short-selling mechanics for the Short Lab (docs/SHORT-LAB.md). Pure (no I/O), integer cents, whole
// shares (rule #4) — so it's trivially testable and the lessons are locked. This is MODELED and
// educational; the fund NEVER shorts (rule #3, unchanged). Shorting is the one bet with UNBOUNDED loss:
// you borrow shares, sell them (cash in + a liability to buy them back), and lose without limit if the
// price rises. Opening a short credits proceeds to cash and creates a buy-back liability; equity is the
// collateral that a rising price can erase, triggering a forced-cover MARGIN CALL — the core lesson.

/** Cash received when you open a short: qty shares sold at the short price. */
export function proceedsCents(qty: number, avgShortCents: number): number {
  return qty * avgShortCents;
}

/** What it costs to buy the shares back RIGHT NOW — the standing liability of an open short. */
export function liabilityCents(qty: number, markCents: number): number {
  return qty * markCents;
}

/** Unrealized P&L of an open short (cents): profit as the price falls, loss (unbounded) as it rises,
 *  minus the borrow carry accrued so far. */
export function shortUnrealizedCents(qty: number, avgShortCents: number, markCents: number, accruedBorrowCents = 0): number {
  return qty * (avgShortCents - markCents) - accruedBorrowCents;
}

/** Realized P&L when you COVER (buy back to close), net of the borrow you paid + any commission. */
export function coverRealizedCents(qty: number, avgShortCents: number, coverMarkCents: number, borrowPaidCents = 0, commissionCents = 0): number {
  return qty * (avgShortCents - coverMarkCents) - borrowPaidCents - commissionCents;
}

/** Borrow carry accrued over `days` (may be fractional) on a position of `notionalCents`, at an
 *  annualized `borrowBps` (100 bps = 1%/yr). The rent you pay to stay short — time works against you. */
export function accrueBorrowCents(notionalCents: number, borrowBps: number, days: number): number {
  if (notionalCents <= 0 || borrowBps <= 0 || days <= 0) return 0;
  return Math.round((notionalCents * borrowBps * days) / (10_000 * 365));
}

/** A MODELED cost-to-borrow (annualized bps) — a proxy, not a real feed (honest label in the UI).
 *  Hard-to-borrow (high short interest, or thin/low-priced names) costs far more than a liquid large cap. */
export function modeledBorrowBps(opts: { priceCents: number; shortInterestPct?: number | null }): number {
  const si = opts.shortInterestPct ?? null;
  if (si != null) {
    if (si >= 30) return 3000; // 30%/yr — brutal to borrow
    if (si >= 15) return 800;
    if (si >= 8) return 300;
    return 50;
  }
  if (opts.priceCents < 300) return 2000; // sub-$3 names: hard/expensive to borrow
  if (opts.priceCents < 1000) return 500; // sub-$10
  return 50; // liquid default — 0.5%/yr
}

export type ShortLot = { qty: number; markCents: number; accruedBorrowCents?: number };

/** Total market value of the shorts (Σ buy-back liability) — the base for margin. */
export function shortMarketValueCents(lots: ShortLot[]): number {
  return lots.reduce((s, l) => s + liabilityCents(l.qty, l.markCents), 0);
}

/** Book equity: cash (incl. short proceeds) minus what you owe to buy the shorts back and the borrow
 *  accrued. This is the collateral a rising price eats away. */
export function bookEquityCents(cashCents: number, lots: ShortLot[]): number {
  return cashCents - lots.reduce((s, l) => s + liabilityCents(l.qty, l.markCents) + (l.accruedBorrowCents ?? 0), 0);
}

/** Maintenance margin required to hold the shorts (default 30% of short market value). */
export function maintenanceReqCents(lots: ShortLot[], maintPct: number): number {
  return Math.round((maintPct / 100) * shortMarketValueCents(lots));
}

export type MarginHealth = { equityCents: number; requiredCents: number; cushionCents: number; usedPct: number; call: boolean };

/** The margin picture. `call` fires when equity drops below the maintenance requirement — the broker
 *  would force-cover. `usedPct` (0–100+, clamped for display) drives the health bar. */
export function marginHealth(cashCents: number, lots: ShortLot[], maintPct: number): MarginHealth {
  const equityCents = bookEquityCents(cashCents, lots);
  const requiredCents = maintenanceReqCents(lots, maintPct);
  const cushionCents = equityCents - requiredCents;
  const usedPct = equityCents > 0 ? Math.round((requiredCents / equityCents) * 100) : 999;
  return { equityCents, requiredCents, cushionCents, usedPct, call: lots.length > 0 && equityCents < requiredCents };
}
