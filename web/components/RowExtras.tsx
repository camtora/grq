"use client";

import { useEffect, useState } from "react";

// The lazily-loaded half of an expanded row: earnings + analyst ratings (the same
// FMP data as the stock page). Mounts only when the row is open (ExpandableRow
// renders the detail on expand), so the fetch fires on demand — the tables never
// pay for it on load. A module-level cache keeps re-expanding the same row free.
type Earnings = {
  date: string;
  upcoming: boolean;
  epsEstimated: number | null;
  epsActual: number | null;
  revenueEstimated: number | null;
} | null;
type Grades = {
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
  consensus: string;
  total: number;
} | null;
type Extras = { earnings: Earnings; grades: Grades };

const CACHE = new Map<string, Extras>();

export default function RowExtras({ symbol }: { symbol: string }) {
  const cached = CACHE.get(symbol);
  const [data, setData] = useState<Extras | null>(cached ?? null);
  const [state, setState] = useState<"loading" | "done" | "error">(cached ? "done" : "loading");

  useEffect(() => {
    if (CACHE.has(symbol)) {
      setData(CACHE.get(symbol)!);
      setState("done");
      return;
    }
    let alive = true;
    fetch(`/api/stock-extras/${encodeURIComponent(symbol)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Extras) => {
        CACHE.set(symbol, d);
        if (alive) {
          setData(d);
          setState("done");
        }
      })
      .catch(() => {
        if (alive) setState("error");
      });
    return () => {
      alive = false;
    };
  }, [symbol]);

  if (state === "loading") {
    return (
      <p className="mt-3 border-t border-teal-400/10 pt-3 text-xs text-teal-200/40">
        loading earnings &amp; analyst ratings…
      </p>
    );
  }
  if (state === "error") return null;

  const earnings = data?.earnings ?? null;
  const grades = data?.grades ?? null;
  if (!earnings && !grades) {
    return (
      <p className="mt-3 border-t border-teal-400/10 pt-3 text-xs text-teal-200/40">
        No earnings or analyst coverage for this name (FMP).
      </p>
    );
  }

  const bars: [string, number][] = grades
    ? [
        ["bg-emerald-500", grades.strongBuy],
        ["bg-emerald-400", grades.buy],
        ["bg-teal-400/30", grades.hold],
        ["bg-red-400", grades.sell],
        ["bg-red-500", grades.strongSell],
      ]
    : [];

  return (
    <div className="mt-3 grid gap-x-6 gap-y-3 border-t border-teal-400/10 pt-3 sm:grid-cols-2">
      {earnings && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-teal-200/50">
            Earnings <span className="normal-case text-teal-200/30">· Tier 6</span>
          </div>
          <div className="mt-0.5 text-sm text-teal-100/80">
            {earnings.upcoming ? "Next report" : "Last report"}{" "}
            <span className="font-semibold tabular-nums text-teal-50">{earnings.date}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-teal-200/50">
            {earnings.epsEstimated != null && (
              <span>
                EPS est <b className="text-teal-100/80">{earnings.epsEstimated.toFixed(2)}</b>
                {earnings.epsActual != null ? ` · act ${earnings.epsActual.toFixed(2)}` : ""}
              </span>
            )}
            {earnings.revenueEstimated != null && (
              <span>
                Rev est <b className="text-teal-100/80">${(earnings.revenueEstimated / 1e9).toFixed(2)}B</b>
              </span>
            )}
          </div>
        </div>
      )}
      {grades && (
        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] uppercase tracking-wider text-teal-200/50">Analyst ratings</span>
            <span className="text-xs text-teal-200/40">{grades.total} analysts</span>
          </div>
          <div className="mt-0.5 text-sm font-bold text-teal-100/90">{grades.consensus}</div>
          <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-teal-400/10">
            {bars.map(([cls, n], i) => (n > 0 ? <span key={i} className={cls} style={{ width: `${(n / grades.total) * 100}%` }} /> : null))}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-teal-200/50">
            <span className="text-emerald-400/80">buy {grades.strongBuy + grades.buy}</span>
            <span>hold {grades.hold}</span>
            <span className="text-red-400/80">sell {grades.sell + grades.strongSell}</span>
          </div>
        </div>
      )}
    </div>
  );
}
