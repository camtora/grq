"use client";

import { useLiveQuote, useLiveQuotes } from "@/components/LiveQuotes";
import { money, pnlClass, pct } from "@/lib/money";
import { StatCard } from "@/components/ui";
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

/** One position's live unrealized P&L = (live price − avg cost) × qty (native ccy), with the
 *  small return-on-cost % beside it (same treatment as the personal lanes). Rolls + colour. */
export function LivePosUnrealized({ symbol, qty, avgCostCents, lastCents, currency }: { symbol: string; qty: number; avgCostCents: number; lastCents: number; currency: string }) {
  const q = useLiveQuote(symbol);
  const price = q?.priceCents ?? lastCents;
  const pnl = (price - avgCostCents) * qty;
  const cost = avgCostCents * qty;
  const frac = cost > 0 ? pnl / cost : null;
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

// ── Personal (external) accounts — the same live engine, in CAD ────────────────────
// The viewer's external holdings tick live off the SAME quote map. We mirror the way the
// nightly baseline is stored (lib/external/store.ts snapshotExternalValues): each account's
// LIVE total = its cash + Σ holdings' native market value, then converted by the ACCOUNT
// currency — so the day-change tile stays in lockstep with its stored anchor.
export type ExtHolding = { quoteSymbol: string; qty: string; mvCents: number; currency: string; bookCostCents: number | null };
export type ExtAccount = { currency: string; cashCents: number; holdings: ExtHolding[] };

const toCadCents = (nativeCents: number, currency: string, fx: number) =>
  currency.toUpperCase() === "USD" ? Math.round(nativeCents * fx) : nativeCents;

function liveMvNative(h: ExtHolding, quotes: Record<string, { priceCents: number }>): number {
  const q = quotes[h.quoteSymbol.toUpperCase()];
  const qtyNum = Number(h.qty);
  return q && Number.isFinite(qtyNum) && qtyNum !== 0 ? Math.round(qtyNum * q.priceCents) : h.mvCents;
}

function extTotalCad(accounts: ExtAccount[], quotes: Record<string, { priceCents: number }>, fx: number): number {
  let sum = 0;
  for (const a of accounts) {
    let acct = a.cashCents;
    for (const h of a.holdings) acct += liveMvNative(h, quotes);
    sum += toCadCents(acct, a.currency, fx);
  }
  return sum;
}

/** The viewer's total external value (CAD), live + rolling — the header pill beside a member's
 *  name and the "Outside GRQ" value tile. */
export function LiveExternalValue({ accounts, fx, className = "" }: { accounts: ExtAccount[]; fx: number; className?: string }) {
  const quotes = useLiveQuotes();
  return <RollingNumber value={money(extTotalCad(accounts, quotes, fx))} className={className} />;
}

/** The "Outside GRQ" stat tiles (value + change), live. The change prefers a TRUE day change
 *  (live total − this morning's snapshot baseline) and falls back to unrealized-vs-cost until
 *  the first nightly snapshot exists — same logic the server used, now recomputed off live quotes. */
export function LiveExternalTiles({
  accounts,
  fx,
  baselineCad,
  valueLabel,
  changeLabel,
  showChange,
}: {
  accounts: ExtAccount[];
  fx: number;
  baselineCad: number | null;
  valueLabel: string; // kept short ("Cam's value") so the tile label never wraps a 7-col row
  changeLabel: string; // ditto ("Cam's change")
  showChange: boolean;
}) {
  const quotes = useLiveQuotes();
  const totalCad = extTotalCad(accounts, quotes, fx);

  let changeCents: number | null = null;
  let note = "";
  if (baselineCad !== null) {
    changeCents = totalCad - baselineCad;
    const frac = baselineCad > 0 ? changeCents / baselineCad : 0;
    note = `${pct(frac, 2)} · today`;
  } else {
    let chg = 0;
    let cost = 0;
    let haveCost = false;
    for (const a of accounts)
      for (const h of a.holdings) {
        if (h.bookCostCents != null) {
          const mv = liveMvNative(h, quotes);
          chg += toCadCents(mv - h.bookCostCents, h.currency, fx);
          cost += toCadCents(h.bookCostCents, h.currency, fx);
          haveCost = true;
        }
      }
    if (haveCost) {
      changeCents = chg;
      note = `${pct(cost > 0 ? chg / cost : 0, 2)} · unrealized vs cost`;
    }
  }

  return (
    <>
      <StatCard
        label={`${valueLabel} (CAD)`}
        value={<RollingNumber value={money(totalCad)} />}
        note="your external accounts"
      />
      {showChange && changeCents !== null && (
        <StatCard
          label={`${changeLabel} (CAD)`}
          value={
            <span className={pnlClass(changeCents)}>
              {changeCents >= 0 ? "+" : "−"}
              <RollingNumber value={money(Math.abs(changeCents))} />
            </span>
          }
          note={note}
        />
      )}
    </>
  );
}
