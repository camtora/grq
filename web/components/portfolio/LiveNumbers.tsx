"use client";

import { useLiveQuote, useLiveQuotes } from "@/components/LiveQuotes";
import { money, pnlClass } from "@/lib/money";
import RollingNumber from "@/components/RollingNumber";

// Live, rolling portfolio numbers (Cam 2026-06-29 — "full live + roll"). These read live
// quotes out of the page's <LiveQuotesProvider> and recompute the same way the server does:
//   • a position's value = qty × live price (native), valued in CAD (USD × fx)
//   • NAV (CAD) = static cash + Σ position CAD values
//   • total P&L = NAV − contributions
// They roll via <RollingNumber> on every move. Cash/contributions are static intraday, so the
// only live input is the quote map — keeping the live NAV in lockstep with the server formula
// (lib/portfolio.ts). Each falls back to the SSR `lastCents` until the first poll lands.

export type LivePos = { symbol: string; qty: number; currency: string; lastCents: number; avgCostCents: number };

const toCad = (nativeCents: number, currency: string, fx: number) =>
  currency === "USD" ? Math.round(nativeCents * fx) : nativeCents;

function positionsCadCents(positions: LivePos[], quotes: Record<string, { priceCents: number }>, fx: number): number {
  let sum = 0;
  for (const p of positions) {
    const price = quotes[p.symbol.toUpperCase()]?.priceCents ?? p.lastCents;
    sum += toCad(p.qty * price, p.currency, fx);
  }
  return sum;
}

/** A live portfolio total — NAV (cash + holdings) or HOLDINGS only, shown in CAD or USD.
 *  Rolls on every move. USD = the CAD amount ÷ fx (1 USD = fx CAD). */
export function LiveTotal({
  positions,
  cashCents,
  fx,
  base = "nav",
  currency = "CAD",
  className = "",
}: {
  positions: LivePos[];
  cashCents: number;
  fx: number;
  base?: "nav" | "holdings";
  currency?: "CAD" | "USD";
  className?: string;
}) {
  const quotes = useLiveQuotes();
  const holdingsCad = positionsCadCents(positions, quotes, fx);
  const cadCents = base === "nav" ? cashCents + holdingsCad : holdingsCad;
  const out = currency === "USD" ? Math.round(cadCents / (fx || 1)) : cadCents;
  return <RollingNumber value={money(out, currency)} className={className} />;
}

/** NAV (CAD) = static cash + live positions in CAD. Rolls. */
export function LiveNavValue({ positions, cashCents, fx, className = "" }: { positions: LivePos[]; cashCents: number; fx: number; className?: string }) {
  return <LiveTotal positions={positions} cashCents={cashCents} fx={fx} base="nav" currency="CAD" className={className} />;
}

/** Total P&L (CAD) = live NAV − contributions. Rolls + colour-coded (value only; the note
 *  with %/vs-XIC stays the server snapshot). */
export function LivePnlValue({ positions, cashCents, contributionsCents, fx }: { positions: LivePos[]; cashCents: number; contributionsCents: number; fx: number }) {
  const quotes = useLiveQuotes();
  const pnl = cashCents + positionsCadCents(positions, quotes, fx) - contributionsCents;
  return (
    <span className={pnlClass(pnl)}>
      {pnl >= 0 ? "+" : "−"}
      <RollingNumber value={money(Math.abs(pnl))} />
    </span>
  );
}

/** One position's live last price. Rolls. */
export function LivePosLast({ symbol, lastCents, currency }: { symbol: string; lastCents: number; currency: string }) {
  const q = useLiveQuote(symbol);
  return <RollingNumber value={money(q?.priceCents ?? lastCents, currency)} />;
}

/** One position's live market value (qty × live price, native ccy). Rolls. */
export function LivePosValue({ symbol, qty, lastCents, currency }: { symbol: string; qty: number; lastCents: number; currency: string }) {
  const q = useLiveQuote(symbol);
  return <RollingNumber value={money(qty * (q?.priceCents ?? lastCents), currency)} />;
}

/** One position's live unrealized P&L = (live price − avg cost) × qty (native ccy). Rolls + colour. */
export function LivePosUnrealized({ symbol, qty, avgCostCents, lastCents, currency }: { symbol: string; qty: number; avgCostCents: number; lastCents: number; currency: string }) {
  const q = useLiveQuote(symbol);
  const price = q?.priceCents ?? lastCents;
  const pnl = (price - avgCostCents) * qty;
  return (
    <span className={pnlClass(pnl)}>
      {pnl >= 0 ? "+" : "−"}
      <RollingNumber value={money(Math.abs(pnl), currency)} />
    </span>
  );
}
