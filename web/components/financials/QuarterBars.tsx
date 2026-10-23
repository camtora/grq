"use client";

import { useState } from "react";
import Term from "@/components/Term";
import { bigMoney, epsMoney, growthText, bpsText, growthTone, monthLabel } from "@/lib/financials/format";
import type { Growth } from "@/lib/financials/derive";

// D140 — the 8-quarter trend on the stock page. One metric at a time (Sales · EPS · Free cash flow ·
// Operating margin); bars hang from a zero line so a loss reads as a loss. Colours come from the
// theme vars (--spark-up / --spark-down), never raw hex, so light mode flips with everything else.

export type QuarterPoint = {
  periodEnd: string;
  label: string; // "Q2 FY2027"
  revenue: number | null; // cents
  netIncome: number | null;
  epsQ4: number | null;
  fcf: number | null;
  operatingMarginBps: number | null;
  netMarginBps: number | null;
  revenueYoY: Growth | null;
  epsYoY: Growth | null;
  netIncomeYoY: Growth | null;
};

export type Metric = "revenue" | "profit" | "eps" | "fcf" | "margin" | "netMargin";
const ALL: Record<Metric, { label: string; term: string }> = {
  revenue: { label: "Sales", term: "revenue" },
  profit: { label: "Profit", term: "earnings" },
  eps: { label: "EPS", term: "eps" },
  fcf: { label: "Free cash flow", term: "free-cash-flow" },
  margin: { label: "Op. margin", term: "operating-margin" },
  netMargin: { label: "Profit margin", term: "bank-revenue" },
};

const H = 120; // px of bar area

/** `metrics` = which toggles this company gets (a bank has no free cash flow worth charting; a
 *  pre-revenue explorer has no sales), in order; the first is the default. */
export default function QuarterBars({
  points,
  currency,
  revenueLabel,
  metrics,
}: {
  points: QuarterPoint[];
  currency: string;
  revenueLabel: string;
  metrics: Metric[];
}) {
  const METRICS = metrics.map((key) => ({ key, ...ALL[key] }));
  const [metric, setMetric] = useState<Metric>(metrics[0]);
  const val = (p: QuarterPoint): number | null =>
    metric === "revenue" ? p.revenue : metric === "profit" ? p.netIncome : metric === "eps" ? p.epsQ4 : metric === "fcf" ? p.fcf : metric === "margin" ? p.operatingMarginBps : p.netMarginBps;
  const fmt = (v: number | null) =>
    v == null ? "—" : metric === "eps" ? epsMoney(v, currency) : metric === "margin" || metric === "netMargin" ? bpsText(v) : bigMoney(v, currency);
  const yoy = (p: QuarterPoint): Growth | null =>
    metric === "revenue" ? p.revenueYoY : metric === "profit" ? p.netIncomeYoY : metric === "eps" ? p.epsYoY : null;

  const vals = points.map(val);
  const pos = Math.max(0, ...vals.map((v) => v ?? 0));
  const neg = Math.max(0, ...vals.map((v) => -(v ?? 0)));
  const span = pos + neg || 1;
  const topH = (pos / span) * H;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1">
        {METRICS.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMetric(m.key)}
            className={`rounded-lg px-2.5 py-1 text-xs font-bold uppercase tracking-wider ${
              metric === m.key ? "bg-teal-400/15 text-teal-200" : "text-teal-200/45 hover:text-teal-200/80"
            }`}
          >
            {m.key === "revenue" ? revenueLabel : m.label}
          </button>
        ))}
        <span className="ml-auto self-center text-[10px] text-teal-200/40">
          <Term k={ALL[metric].term}>what is this?</Term>
        </span>
      </div>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}>
        {points.map((p, i) => {
          const v = vals[i];
          const h = v == null ? 0 : (Math.abs(v) / span) * H;
          const g = yoy(p);
          const tone = growthTone(g);
          return (
            <div key={p.periodEnd} className="flex min-w-0 flex-col items-center" title={`${p.label} (to ${p.periodEnd}): ${fmt(v)}`}>
              {/* On a phone only the latest quarter carries its figures (eight labels don't fit in 390px);
                  invisible, not hidden, so every bar keeps the same baseline. Tap/hover gives the rest. */}
              <div
                className={`w-full text-[10px] tabular-nums text-teal-100/75 ${
                  i === points.length - 1 ? "whitespace-nowrap text-right sm:truncate sm:text-center" : "invisible truncate text-center sm:visible"
                }`}
              >
                {fmt(v)}
              </div>
              <div className="relative w-full" style={{ height: H }}>
                {v != null && (
                  <div
                    className="absolute left-[15%] right-[15%] rounded-sm"
                    style={{
                      background: v >= 0 ? "var(--spark-up)" : "var(--spark-down)",
                      opacity: i === points.length - 1 ? 0.95 : 0.55,
                      height: Math.max(h, 1),
                      ...(v >= 0 ? { bottom: H - topH } : { top: topH }),
                    }}
                  />
                )}
                <div className="absolute left-0 right-0 border-t border-teal-400/20" style={{ top: topH }} />
              </div>
              <div className="mt-1 text-[10px] text-teal-200/50">{monthLabel(p.periodEnd)}</div>
              {g && (
                <div className={`text-[10px] tabular-nums ${i === points.length - 1 ? "" : "invisible sm:visible"} ${tone === "up" ? "text-emerald-400" : tone === "down" ? "text-red-400" : "text-teal-200/40"}`}>
                  {growthText(g)}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] text-teal-200/40">
        Each bar is one quarter, oldest on the left. {metric === "revenue" || metric === "eps" || metric === "profit" ? "The figure under it is the change on the same quarter a year earlier. " : ""}
        Figures in {currency}, the currency the company reports in.
      </p>
    </div>
  );
}
