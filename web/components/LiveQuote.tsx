"use client";

import { useEffect, useRef, useState } from "react";
import { money } from "@/lib/money";

// On-page live price. Renders the SSR snapshot immediately, then polls
// /api/quotes (FMP) every ~2.5s and updates in place — flashing green/red on a
// move. initialChangePct is a FRACTION (0.0017 = +0.17%). `currency` labels a
// non-CAD listing (US$ vs $) so a US name can't be misread as CAD (D24).
// With `live`, also shows the freshness marker: a pulsing dot + "live · Ns ago"
// counting up from the last successful fetch — going amber/"stale" if polls stop
// landing, so the badge can't claim "live" while the price has quietly frozen.
const POLL_MS = 2500;
const STALE_AFTER_MS = 8000; // ~3 missed polls → no longer fresh
const fmtPct = (f: number) => `${f >= 0 ? "+" : ""}${(f * 100).toFixed(2)}%`;

export default function LiveQuote({
  symbol,
  initialCents,
  initialChangePct = null,
  currency = "CAD",
  className = "",
  showChange = true,
  live = false,
}: {
  symbol: string;
  initialCents: number | null;
  initialChangePct?: number | null;
  currency?: string | null;
  className?: string;
  showChange?: boolean;
  /** Show the freshness marker (pulsing dot + "live · Ns ago") beside the price. */
  live?: boolean;
}) {
  const [cents, setCents] = useState<number | null>(initialCents);
  const [chg, setChg] = useState<number | null>(initialChangePct);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const [lastOkAt, setLastOkAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const prev = useRef<number | null>(initialCents);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const r = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbol)}`, { cache: "no-store" });
        const d = await r.json();
        const q = d.quotes?.[symbol.toUpperCase()] ?? d.quotes?.[symbol];
        if (!active || !q) return;
        if (prev.current !== null && q.priceCents !== prev.current) {
          setFlash(q.priceCents > prev.current ? "up" : "down");
          setTimeout(() => {
            if (active) setFlash(null);
          }, 650);
        }
        prev.current = q.priceCents;
        setCents(q.priceCents);
        setChg(q.changePct / 100);
        setLastOkAt(Date.now());
      } catch {
        /* keep the last good value — lastOkAt stays put, so the age climbs */
      }
    };
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [symbol]);

  // Tick a 1s clock only while the freshness marker is shown, so "Ns ago" counts up.
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);

  const ageMs = lastOkAt !== null ? now - lastOkAt : null;
  const ageSec = ageMs !== null ? Math.max(0, Math.round(ageMs / 1000)) : null;
  const stale = ageMs !== null && ageMs > STALE_AFTER_MS;

  return (
    <>
      <span className={`tabular-nums transition-colors duration-500 ${flash === "up" ? "text-emerald-300" : flash === "down" ? "text-red-300" : ""} ${className}`}>
        {cents !== null ? money(cents, currency) : "—"}
        {showChange && chg !== null && <span className={`ml-1.5 text-xs ${chg >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtPct(chg)}</span>}
      </span>
      {live && (
        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-teal-200/40">
          <span className={`h-1.5 w-1.5 rounded-full ${stale ? "bg-amber-400" : "animate-pulse bg-emerald-400"}`} />
          {stale ? "stale" : "live"}
          {ageSec !== null && <span className="tabular-nums normal-case text-teal-200/30">· {ageSec}s ago</span>}
        </span>
      )}
    </>
  );
}
