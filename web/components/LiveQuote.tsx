"use client";

import { useEffect, useRef, useState } from "react";
import { money } from "@/lib/money";

// On-page live price. Renders the SSR snapshot immediately, then polls
// /api/quotes (FMP) every ~2.5s and updates in place — flashing green/red on a
// move. initialChangePct is a FRACTION (0.0017 = +0.17%). `currency` labels a
// non-CAD listing (US$ vs $) so a US name can't be misread as CAD (D24).
const fmtPct = (f: number) => `${f >= 0 ? "+" : ""}${(f * 100).toFixed(2)}%`;

export default function LiveQuote({
  symbol,
  initialCents,
  initialChangePct = null,
  currency = "CAD",
  className = "",
  showChange = true,
}: {
  symbol: string;
  initialCents: number | null;
  initialChangePct?: number | null;
  currency?: string | null;
  className?: string;
  showChange?: boolean;
}) {
  const [cents, setCents] = useState<number | null>(initialCents);
  const [chg, setChg] = useState<number | null>(initialChangePct);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
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
      } catch {
        /* keep the last good value */
      }
    };
    poll();
    const id = setInterval(poll, 2500);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [symbol]);

  return (
    <span className={`tabular-nums transition-colors duration-500 ${flash === "up" ? "text-emerald-300" : flash === "down" ? "text-red-300" : ""} ${className}`}>
      {cents !== null ? money(cents, currency) : "—"}
      {showChange && chg !== null && <span className={`ml-1.5 text-xs ${chg >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtPct(chg)}</span>}
    </span>
  );
}
