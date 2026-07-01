"use client";

import { useMemo } from "react";
import Term from "@/components/Term";
import { pnlAt, type Leg } from "@/lib/options/payoff";
import { probAbove, probOfProfit } from "@/lib/options/probability";

// The price × date P/L grid (Phase 2, docs/OPTIONS-PORTAL.md) — optionsprofitcalculator.com's signature
// view. Rows = underlying prices, columns = dates from today to expiry; each cell is the modeled P/L,
// heat-shaded green (profit) / red (loss). A per-row "P(≥)" column gives the lognormal odds the stock
// reaches that price by expiry, and the header carries the overall probability of profit. Educational —
// the odds come from one number (IV) and are not a forecast.
const fmtSigned = (cents: number) => (cents >= 0 ? "+" : "−") + "$" + Math.abs(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmtPrice = (cents: number) => "$" + (cents / 100).toLocaleString("en-US", { maximumFractionDigits: cents < 1000 ? 2 : 0 });

export default function PnlTable({ legs, spotCents, dteNow, ivFrac }: { legs: Leg[]; spotCents: number; dteNow: number; ivFrac: number }) {
  const { rows, cols, grid, maxAbs, pop } = useMemo(() => {
    // Price rows: ~±(2.2σ, clamped) around spot, 11 rows, with the spot row included.
    const tYears = Math.max(0, dteNow) / 365;
    const span = Math.min(0.6, Math.max(0.15, ivFrac * Math.sqrt(tYears || 0.1) * 2.2));
    const ROWS = 11;
    const rows: number[] = [];
    for (let i = 0; i < ROWS; i++) {
      const f = 1 + span - (2 * span * i) / (ROWS - 1); // high → low
      rows.push(Math.round((spotCents * f) / 100) * 100);
    }
    // Date columns: today → expiry, evenly stepped (deduped for short-dated options).
    const colDays = [...new Set([dteNow, Math.round(dteNow * 0.75), Math.round(dteNow * 0.5), Math.round(dteNow * 0.25), 0].filter((d) => d >= 0))];
    const cols = colDays.map((d) => ({ days: d, label: d === 0 ? "expiry" : d === dteNow ? "today" : `${d}d` }));
    const grid = rows.map((p) => cols.map((c) => pnlAt(legs, p, c.days)));
    const maxAbs = Math.max(1, ...grid.flat().map((v) => Math.abs(v)));
    const pop = probOfProfit(legs, spotCents, ivFrac, tYears);
    return { rows, cols, grid, maxAbs, pop };
  }, [legs, spotCents, dteNow, ivFrac]);

  const tYears = Math.max(0, dteNow) / 365;
  const cell = (v: number, ci: number) => {
    const intensity = Math.min(55, (Math.abs(v) / maxAbs) * 55).toFixed(0);
    const bg = `color-mix(in srgb, ${v >= 0 ? "var(--spark-up)" : "var(--spark-down)"} ${intensity}%, transparent)`;
    return (
      <td key={ci} className="px-2 py-1 text-right text-[11px] tabular-nums text-teal-50" style={{ backgroundColor: bg }}>
        {fmtSigned(v)}
      </td>
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-teal-300/70">P/L by price &amp; date</div>
        <div className="text-[11px] text-teal-200/60">
          <Term k="break-even">Prob. of profit</Term>: <span className="font-semibold tabular-nums text-teal-100">{(pop * 100).toFixed(0)}%</span>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-[color:var(--card-border)]">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-teal-400/[0.04] text-[10px] uppercase tracking-wider text-teal-200/50">
              <th className="px-2 py-1.5 text-left font-semibold">Price</th>
              {cols.map((c) => (
                <th key={c.days} className="px-2 py-1.5 text-right font-semibold">{c.label}</th>
              ))}
              <th className="px-2 py-1.5 text-right font-semibold" title="Lognormal chance the stock is at/above this price by expiry">P(≥)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p, ri) => {
              const isSpotRow = Math.abs(p - spotCents) < spotCents * 0.012;
              return (
                <tr key={p} className={`border-t border-teal-400/5 ${isSpotRow ? "bg-teal-400/[0.06]" : ""}`}>
                  <td className="whitespace-nowrap px-2 py-1 text-left tabular-nums text-teal-100/80">
                    {fmtPrice(p)}
                    {isSpotRow ? <span className="ml-1 text-[9px] uppercase text-teal-300/60">now</span> : null}
                  </td>
                  {grid[ri].map((v, ci) => cell(v, ci))}
                  <td className="px-2 py-1 text-right tabular-nums text-teal-200/50">{(probAbove(spotCents, p, ivFrac, tYears) * 100).toFixed(0)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-teal-200/40">
        Cells are modeled P/L (IV held fixed); the “today” column rolls Black-Scholes forward, “expiry” is intrinsic. Odds are a driftless lognormal from the implied vol — rough, not a forecast.
      </p>
    </div>
  );
}
