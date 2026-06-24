"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

// Shared live-price engine for the stock TABLES (the single hero quote on a stock
// page stays <LiveQuote>). One provider per page collects every symbol its rows
// render, dedupes them, and polls /api/quotes ONCE per tick — not one request per
// row. Cells read their price out of context via useLiveQuote(symbol), falling back
// to the SSR snapshot until the first poll lands. This is why a 200-row table costs
// the same network as a 10-row one: a single (server-chunked) batch request.
//
// Cadence is calmer than the hero ticker (the table is ambient, not the focus), and
// polling pauses while the tab is hidden so background tabs don't burn FMP calls.
export type LiveQuote = { priceCents: number; changePct: number };
const POLL_MS = 10_000;

type Ctx = { quotes: Record<string, LiveQuote>; updatedAt: number | null };
const LiveQuotesContext = createContext<Ctx>({ quotes: {}, updatedAt: null });

export function LiveQuotesProvider({
  symbols,
  children,
  pollMs = POLL_MS,
}: {
  symbols: string[];
  children: ReactNode;
  pollMs?: number;
}) {
  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({});
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  // Stable, deduped, upper-cased symbol list. The join is the effect dep so we only
  // re-arm the poller when the actual set changes (not on every render).
  const key = useMemo(
    () => [...new Set(symbols.map((s) => s.toUpperCase()).filter(Boolean))].sort().join(","),
    [symbols],
  );

  useEffect(() => {
    if (!key) return;
    let active = true;
    const poll = async () => {
      if (typeof document !== "undefined" && document.hidden) return; // don't poll hidden tabs
      try {
        const r = await fetch(`/api/quotes?symbols=${encodeURIComponent(key)}`, { cache: "no-store" });
        const d = await r.json();
        if (!active || !d.quotes) return;
        setQuotes(d.quotes as Record<string, LiveQuote>);
        setUpdatedAt(Date.now());
      } catch {
        /* keep the last good map — a cell shows its SSR fallback / prior live value */
      }
    };
    poll();
    const id = setInterval(poll, pollMs);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [key, pollMs]);

  const value = useMemo(() => ({ quotes, updatedAt }), [quotes, updatedAt]);
  return <LiveQuotesContext.Provider value={value}>{children}</LiveQuotesContext.Provider>;
}

/** The live quote for one symbol, or null until the first poll lands (or if outside a provider). */
export function useLiveQuote(symbol: string): LiveQuote | null {
  const { quotes } = useContext(LiveQuotesContext);
  return quotes[symbol.toUpperCase()] ?? null;
}

/** Briefly flag a value as moved up/down so a cell can flash on change. */
export function useFlash(value: number | null): "up" | "down" | null {
  const prev = useRef<number | null>(value);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  useEffect(() => {
    if (value === null) return;
    if (prev.current !== null && value !== prev.current) {
      setFlash(value > prev.current ? "up" : "down");
      const id = setTimeout(() => setFlash(null), 650);
      prev.current = value;
      return () => clearTimeout(id);
    }
    prev.current = value;
  }, [value]);
  return flash;
}
