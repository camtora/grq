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

export default function MarketIndices({
  initial,
  fundDayPct = null,
}: {
  initial: IndexQuote[];
  fundDayPct?: number | null; // fund's day return as a FRACTION (0.0082 = +0.82%), null off a trading day
}) {
  const [data, setData] = useState<IndexQuote[]>(initial);
  const [fundPct, setFundPct] = useState<number | null>(fundDayPct);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      if (!isMarketOpenET()) return; // frozen at the last values after the close
      try {
        const [ri, rf] = await Promise.all([
          fetch("/api/indices", { cache: "no-store" }),
          fetch("/api/fund-day", { cache: "no-store" }),
        ]);
        const d = await ri.json();
        if (active && Array.isArray(d.indices) && d.indices.length > 0) setData(d.indices);
        const f = await rf.json();
        if (active && typeof f.dayPnlPct === "number" && f.marketDay) setFundPct(f.dayPnlPct);
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

  // GRQ vs each market, today. fundBps = the fund's day % as a plain number (0.82 = +0.82%),
  // directly comparable to each index's changePct. Δ per market = GRQ − index, in points.
  const fundBps = fundPct !== null ? fundPct * 100 : null;
  const ahead = fundBps !== null ? data.filter((ix) => fundBps > ix.changePct).length : 0;
  const fundTone = fundBps === null ? "" : fundBps > 0 ? "text-emerald-400" : fundBps < 0 ? "text-red-400" : "text-teal-200/60";

  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-teal-400/10 bg-teal-400/[0.02]">
      {fundBps !== null && (
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-teal-400/10 px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-teal-200/50">
            GRQ today
            <span className={`ml-1.5 tabular-nums ${fundTone}`}>
              {fundBps >= 0 ? "+" : ""}
              {fundBps.toFixed(2)}%
            </span>
          </span>
          <span className="text-[11px] text-teal-200/50">
            {ahead === data.length
              ? "ahead of every market"
              : ahead === 0
                ? `behind all ${data.length} markets`
                : `ahead of ${ahead} of ${data.length} markets`}
          </span>
        </div>
      )}
      <div className="grid grid-cols-2 divide-x divide-y divide-teal-400/10 sm:grid-cols-3 sm:divide-y-0 lg:grid-cols-6">
        {data.map((ix) => {
          const up = ix.change > 0;
          const down = ix.change < 0;
          const tone = up ? "text-emerald-400" : down ? "text-red-400" : "text-teal-200/50";
          const delta = fundBps !== null ? fundBps - ix.changePct : null;
          const dTone = delta === null ? "" : delta > 0 ? "text-emerald-400" : delta < 0 ? "text-red-400" : "text-teal-200/50";
          return (
            <div key={ix.symbol} className="px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-teal-50">{ix.label}</span>
                <span className={tone}>{up ? "↗" : down ? "↘" : "→"}</span>
              </div>
              {/* Value + today's move on one line */}
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span className="tabular-nums text-teal-100/80">{fmtNum(ix.price)}</span>
                <span className={`text-xs tabular-nums ${tone}`}>
                  {ix.changePct >= 0 ? "+" : ""}
                  {ix.changePct.toFixed(2)}%
                </span>
              </div>
              {/* GRQ vs this market, underneath */}
              {delta !== null && (
                <div className="mt-1.5 flex items-baseline justify-between gap-2 border-t border-teal-400/10 pt-1.5">
                  <span className="text-[11px] text-teal-200/40">GRQ vs {ix.label}</span>
                  <span className={`text-[11px] font-semibold tabular-nums ${dTone}`}>
                    {delta >= 0 ? "+" : ""}
                    {delta.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {fundBps !== null && (
        <p className="border-t border-teal-400/10 px-4 py-2 text-[11px] text-teal-200/35">
          Each bottom line is GRQ&apos;s day vs that market, in percentage points (GRQ − market).
        </p>
      )}
    </div>
  );
}
