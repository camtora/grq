"use client";

import type { ReactNode } from "react";
import { money, pct } from "@/lib/money";
import { useLiveQuote, useFlash } from "@/components/LiveQuotes";

// The "Last" and "Day" cells for the stock tables, made live. They read the symbol's
// price out of <LiveQuotesProvider> context and fall back to the SSR snapshot
// (initialCents/initialBps) until the first poll lands — so the first paint matches
// the static render and the numbers then update in place. Markup is intentionally
// identical to the old static cells in StockTable so the look is unchanged.

export function LiveLastCell({
  symbol,
  initialCents,
  currency,
}: {
  symbol: string;
  initialCents: number | null;
  currency: string | null;
}) {
  const live = useLiveQuote(symbol);
  const cents = live?.priceCents ?? initialCents;
  const flash = useFlash(cents);
  return (
    <td
      className={`px-4 py-2.5 text-right tabular-nums transition-colors duration-500 ${
        flash === "up" ? "text-emerald-300" : flash === "down" ? "text-red-300" : "text-teal-100/80"
      }`}
    >
      {cents !== null ? money(cents, currency) : "—"}
    </td>
  );
}

export function LiveDayCell({
  symbol,
  initialBps,
  initialCents,
  currency,
}: {
  symbol: string;
  initialBps: number | null;
  initialCents: number | null;
  currency: string | null;
}) {
  const live = useLiveQuote(symbol);
  // Prefer the live day %; fall back to the SSR bps. f is a fraction (e.g. -0.044).
  const f = live ? live.changePct / 100 : initialBps !== null ? initialBps / 10_000 : null;
  const cents = live?.priceCents ?? initialCents;
  // Today's $ move, derived from price and the day %: prevClose = price/(1+f).
  const chgCents = cents !== null && f !== null && 1 + f !== 0 ? Math.round(cents - cents / (1 + f)) : null;
  return (
    <td
      className={`px-4 py-2.5 text-right tabular-nums ${
        (f ?? 0) > 0 ? "text-emerald-400" : (f ?? 0) < 0 ? "text-red-400" : "text-teal-200/50"
      }`}
    >
      {f !== null ? (
        <span className="flex flex-col items-end leading-tight">
          <span className="inline-flex items-center gap-1">
            {f > 0 ? <span aria-hidden>↗</span> : f < 0 ? <span aria-hidden>↘</span> : null}
            <span>{chgCents !== null ? money(Math.abs(chgCents), currency) : pct(f, 2)}</span>
          </span>
          {chgCents !== null && (
            <span>
              ({f > 0 ? "+" : ""}
              {pct(f, 2)})
            </span>
          )}
        </span>
      ) : (
        "—"
      )}
    </td>
  );
}

// The Hunt cards/rows show a spot PRICE (find.cur) beside a 30-day momentum figure.
// Only the price is intraday, so this makes just the price live and leaves the 30d
// number untouched. Renders the same element/classes the static markup used, so the
// card layout is unchanged; flashes on a move unless flash={false} (e.g. a secondary
// "now $X" echo). `fallback` renders the element with placeholder text when there's no
// price at all (the Scanner's "—"); omit it to render nothing (the guarded card cells).
export function LiveHuntPrice({
  symbol,
  initialCents,
  currency,
  className = "",
  as: As = "span",
  flash: doFlash = true,
  fallback = null,
}: {
  symbol: string;
  initialCents: number | null;
  currency: string | null;
  className?: string;
  as?: "span" | "div";
  flash?: boolean;
  fallback?: ReactNode;
}) {
  const live = useLiveQuote(symbol);
  const cents = live?.priceCents ?? initialCents;
  const flash = useFlash(cents);
  if (cents == null) return fallback === null ? null : <As className={className}>{fallback}</As>;
  const flashCls = doFlash && flash ? (flash === "up" ? "!text-emerald-300" : "!text-red-300") : "";
  return <As className={`${className} transition-colors duration-500 ${flashCls}`}>{money(cents, currency)}</As>;
}

// The Today-page "Market Movers" price block (stacked price over day %), made live.
// Mirrors the static markup in app/page.tsx's MoverRow; defaults to CAD like the
// original money(midCents) call.
export function LiveMoverPrice({
  symbol,
  initialCents,
  initialBps,
}: {
  symbol: string;
  initialCents: number;
  initialBps: number;
}) {
  const live = useLiveQuote(symbol);
  const cents = live?.priceCents ?? initialCents;
  const f = live ? live.changePct / 100 : initialBps / 10_000;
  const flash = useFlash(cents);
  const dayCls = f > 0 ? "text-emerald-400" : f < 0 ? "text-red-400" : "text-teal-200/50";
  return (
    <div className="ml-auto text-right">
      <div
        className={`text-sm tabular-nums transition-colors duration-500 ${
          flash === "up" ? "text-emerald-300" : flash === "down" ? "text-red-300" : "text-teal-100/80"
        }`}
      >
        {money(cents)}
      </div>
      <div className={`text-xs tabular-nums ${dayCls}`}>
        {f > 0 ? "+" : ""}
        {pct(f, 2)}
      </div>
    </div>
  );
}
