"use client";

import { useLiveQuote, useLiveQuotes } from "@/components/LiveQuotes";
import { money, pnlClass, pct } from "@/lib/money";
import RollingNumber from "@/components/RollingNumber";

// Live holding cells for the /accounts page — the same quote engine the portfolio uses, applied
// to a member's external (read-only) holdings (Cam 2026-06-30). Each cell reads its price out of
// the page's <LiveQuotesProvider> by the holding's `quoteSymbol` (.TO for CA, bare for US) and
// rolls on a move, falling back to the last-synced SSR value until the first poll lands.

/** One holding's live last price. */
export function LiveHoldingPrice({ symbol, priceCents, currency }: { symbol: string; priceCents: number; currency: string }) {
  const q = useLiveQuote(symbol);
  return <RollingNumber value={money(q?.priceCents ?? priceCents, currency)} />;
}

/** One holding's live market value = qty × live price. */
export function LiveHoldingValue({
  symbol,
  qty,
  priceCents,
  marketValueCents,
  currency,
}: {
  symbol: string;
  qty: number;
  priceCents: number;
  marketValueCents: number;
  currency: string;
}) {
  const q = useLiveQuote(symbol);
  const mv = q && Number.isFinite(qty) ? Math.round(qty * q.priceCents) : marketValueCents;
  return <RollingNumber value={money(mv, currency)} />;
}

/** Today's change on the position = qty × (live price − prior close), with the prior close
 *  derived from the day's % move (`changePct`). Shows the $ amount + the %, coloured. "—" until
 *  the first live quote lands (the SSR sync carries no intraday % so there's no static fallback). */
export function LiveHoldingToday({
  symbol,
  qty,
  currency,
}: {
  symbol: string;
  qty: number;
  currency: string;
}) {
  const q = useLiveQuote(symbol);
  if (!q || !Number.isFinite(qty)) return <span className="text-teal-200/30">—</span>;
  const p = q.changePct; // today's percentage move, e.g. +1.23
  // prevClose = price·100/(100+p) ⇒ change/share = price·p/(100+p).
  const dayPerShare = 100 + p !== 0 ? (q.priceCents * p) / (100 + p) : 0;
  const day = Math.round(qty * dayPerShare);
  return (
    <span className={pnlClass(day)}>
      {day >= 0 ? "+" : "−"}
      <RollingNumber value={money(Math.abs(day), currency)} />
      <span className="ml-1 text-[11px] opacity-70">
        ({p >= 0 ? "+" : ""}
        {pct(p / 100, 2)})
      </span>
    </span>
  );
}

/** One holding's live unrealized P&L = live value − cost basis, with the return-on-cost %.
 *  "—" when the brokerage reports no cost basis. */
export function LiveHoldingUnrealized({
  symbol,
  qty,
  priceCents,
  bookCostCents,
  currency,
}: {
  symbol: string;
  qty: number;
  priceCents: number;
  bookCostCents: number | null;
  currency: string;
}) {
  const q = useLiveQuote(symbol);
  if (bookCostCents == null || !Number.isFinite(qty)) return <span className="text-teal-200/30">—</span>;
  const price = q?.priceCents ?? priceCents;
  const pnl = Math.round(qty * price) - bookCostCents;
  const frac = bookCostCents > 0 ? pnl / bookCostCents : null;
  return (
    <span className={pnlClass(pnl)}>
      {pnl >= 0 ? "+" : "−"}
      <RollingNumber value={money(Math.abs(pnl), currency)} />
      {frac !== null && (
        <span className="ml-1 text-[11px] opacity-70">
          ({frac >= 0 ? "+" : ""}
          {pct(frac, 1)})
        </span>
      )}
    </span>
  );
}

/** An account's live total = cash + Σ live holding value (native, summed like the SSR total). */
export function LiveAccountTotal({
  cashCents,
  holdings,
  currency,
}: {
  cashCents: number;
  holdings: { quoteSymbol: string; qty: number; priceCents: number }[];
  currency: string;
}) {
  const quotes = useLiveQuotes();
  let total = cashCents;
  for (const h of holdings) {
    const price = quotes[h.quoteSymbol.toUpperCase()]?.priceCents ?? h.priceCents;
    total += Number.isFinite(h.qty) ? Math.round(h.qty * price) : 0;
  }
  return <RollingNumber value={money(total, currency)} />;
}
