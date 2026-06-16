"use client";

import { useEffect, useState } from "react";
import type { IndexQuote } from "@/lib/fmp";

// The market-indices strip on Today: TSX / S&P 500 / DJIA / NASDAQ / Gold / Oil.
// Renders the SSR snapshot, then polls /api/indices every 15s WHILE the market is
// open (9:30–16:00 ET, weekdays) and stops after the close — "live until close".
const fmtNum = (n: number) => n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function isMarketOpenET(): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Toronto",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd = get("weekday");
  if (wd === "Sat" || wd === "Sun") return false;
  const mins = parseInt(get("hour"), 10) * 60 + parseInt(get("minute"), 10);
  return mins >= 9 * 60 + 30 && mins < 16 * 60;
}

export default function MarketIndices({ initial }: { initial: IndexQuote[] }) {
  const [data, setData] = useState<IndexQuote[]>(initial);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      if (!isMarketOpenET()) return; // frozen at the last values after the close
      try {
        const r = await fetch("/api/indices", { cache: "no-store" });
        const d = await r.json();
        if (active && Array.isArray(d.indices) && d.indices.length > 0) setData(d.indices);
      } catch {
        /* keep the last good values */
      }
    };
    poll();
    const id = setInterval(poll, 15_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  if (data.length === 0) return null;

  return (
    <div className="mb-6 grid grid-cols-2 divide-x divide-y divide-teal-400/10 overflow-hidden rounded-2xl border border-teal-400/10 bg-teal-400/[0.02] sm:grid-cols-3 sm:divide-y-0 lg:grid-cols-6">
      {data.map((ix) => {
        const up = ix.change > 0;
        const down = ix.change < 0;
        const tone = up ? "text-emerald-400" : down ? "text-red-400" : "text-teal-200/50";
        return (
          <div key={ix.symbol} className="px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-teal-50">{ix.label}</span>
              <span className={tone}>{up ? "↗" : down ? "↘" : "→"}</span>
            </div>
            <div className="mt-1 tabular-nums text-teal-100/80">{fmtNum(ix.price)}</div>
            <div className={`text-xs tabular-nums ${tone}`}>
              {ix.change >= 0 ? "+" : ""}
              {fmtNum(ix.change)} ({ix.changePct >= 0 ? "+" : ""}
              {ix.changePct.toFixed(2)}%)
            </div>
          </div>
        );
      })}
    </div>
  );
}
