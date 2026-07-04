"use client";

import { useState, type MouseEvent } from "react";
import Link from "next/link";
import StockLogo from "@/components/StockLogo";

// A reported-earnings BUBBLE (Today page) — who reported, beat/miss, the day reaction and a
// one-line read. Clicking the card EXPANDS it in place (the watchlist row-expand interaction,
// Cam 2026-07-03) into the numbers we captured on the report: EPS + revenue actual-vs-estimate
// with surprise %, when it was reported, the day's reaction and Alfred's call. Links inside
// (symbol, full report) still navigate — same [closest("a")] rule as ExpandableRow.

export type EarnView = {
  symbol: string;
  name: string;
  logoUrl: string | null;
  date: string; // YYYY-MM-DD
  epsEstimated: number | null;
  epsActual: number | null;
  revenueEstimated: number | null;
  revenueActual: number | null;
  dayBps: number | null;
};

const fmtEps = (v: number | null) => (v == null ? "—" : `${v < 0 ? "−" : ""}$${Math.abs(v).toFixed(2)}`);

function fmtRev(v: number | null): string {
  if (v == null) return "—";
  const a = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}$${Math.round(a / 1e6)}M`;
  return `${sign}$${Math.round(a).toLocaleString("en-US")}`;
}

function surprisePct(actual: number | null, est: number | null): number | null {
  if (actual == null || est == null || est === 0) return null;
  return ((actual - est) / Math.abs(est)) * 100;
}

function fmtEarnDate(d: string): string {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function relDay(d: string, today: string): string {
  const n = Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n < 0 ? `${-n}d ago` : `in ${n}d`;
}

function signedPct(bps: number): string {
  const p = bps / 100;
  return `${p > 0 ? "+" : ""}${p.toFixed(1)}%`;
}

function dayClass(bps: number): string {
  return bps > 0 ? "text-emerald-400" : bps < 0 ? "text-red-400" : "text-teal-200/50";
}

function surpriseClass(s: number | null): string {
  return s == null ? "text-teal-200/40" : s >= 0 ? "text-emerald-400" : "text-red-400";
}

/** One expanded-detail line: label · actual vs estimate · surprise. */
function DetailLine({ label, actual, est, surprise }: { label: string; actual: string; est: string; surprise: number | null }) {
  return (
    <div className="flex items-baseline gap-2 tabular-nums">
      <span className="w-14 shrink-0 text-[10px] uppercase tracking-wider text-teal-200/40">{label}</span>
      <span className="font-semibold text-teal-50">{actual}</span>
      <span className="text-teal-200/50">vs {est} est</span>
      {surprise != null && (
        <span className={`ml-auto text-xs font-semibold ${surpriseClass(surprise)}`}>
          {surprise >= 0 ? "+" : "−"}
          {Math.abs(surprise).toFixed(1)}%
        </span>
      )}
    </div>
  );
}

export default function EarningBubble({ e, stance, today }: { e: EarnView; stance: string | null; today: string }) {
  const [open, setOpen] = useState(false);
  const beat =
    e.epsActual != null && e.epsEstimated != null
      ? e.epsActual >= e.epsEstimated
      : e.revenueActual != null && e.revenueEstimated != null
        ? e.revenueActual >= e.revenueEstimated
        : null;
  const epsPart = e.epsActual != null && e.epsEstimated != null ? ` (EPS ${fmtEps(e.epsActual)} vs ${fmtEps(e.epsEstimated)} est)` : "";
  const movePart = e.dayBps != null ? `; the stock is ${signedPct(e.dayBps)} on the print` : "";
  const read =
    beat == null ? "Just reported — the numbers and the market's reaction are on the stock page." : `${beat ? "Beat" : "Missed"} estimates${epsPart}${movePart}.`;

  const onClick = (ev: MouseEvent<HTMLDivElement>) => {
    if ((ev.target as HTMLElement).closest("a,[data-no-expand]")) return;
    setOpen((v) => !v);
  };

  return (
    <div
      onClick={onClick}
      aria-expanded={open}
      className="group flex cursor-pointer flex-col rounded-xl border border-[color:var(--card-border)] bg-[var(--card-bg)] p-3 transition-colors hover:border-teal-400/30 hover:bg-teal-400/[0.03]"
    >
      <div className="flex items-center gap-2">
        <span className={`text-xs text-teal-200/30 transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
        <StockLogo symbol={e.symbol} logoUrl={e.logoUrl} className="h-7 w-7 text-[10px]" />
        <div className="min-w-0">
          <Link href={`/stocks/${e.symbol}`} className="text-[13px] font-semibold text-teal-100 hover:underline">
            {e.symbol}
          </Link>
          <div className="truncate text-[10px] text-teal-200/40">{e.name}</div>
        </div>
        <div className="ml-auto shrink-0 text-right tabular-nums">
          {beat != null && <div className={`text-[10px] font-black ${beat ? "text-emerald-400" : "text-red-400"}`}>{beat ? "beat ✓" : "miss ✗"}</div>}
          {e.dayBps != null && <div className={`text-xs ${dayClass(e.dayBps)}`}>{signedPct(e.dayBps)}</div>}
        </div>
      </div>
      <p className="mt-2 text-[11.5px] leading-snug text-teal-200/60">{read}</p>

      {open && (
        <div className="mt-2 space-y-1.5 border-t border-teal-400/10 pt-2 text-[13px]">
          <DetailLine label="EPS" actual={fmtEps(e.epsActual)} est={fmtEps(e.epsEstimated)} surprise={surprisePct(e.epsActual, e.epsEstimated)} />
          <DetailLine label="Revenue" actual={fmtRev(e.revenueActual)} est={fmtRev(e.revenueEstimated)} surprise={surprisePct(e.revenueActual, e.revenueEstimated)} />
          <div className="flex items-baseline gap-2">
            <span className="w-14 shrink-0 text-[10px] uppercase tracking-wider text-teal-200/40">Reported</span>
            <span className="text-teal-100/80">{fmtEarnDate(e.date)}</span>
            <span className="text-xs text-teal-200/40">{relDay(e.date, today)}</span>
            {e.dayBps != null && (
              <span className={`ml-auto text-xs font-semibold tabular-nums ${dayClass(e.dayBps)}`}>{signedPct(e.dayBps)} on the day</span>
            )}
          </div>
          <p className="text-[10px] leading-snug text-teal-200/40">
            surprise = actual vs the analyst estimate · the full report, transcript notes and Alfred&apos;s take live on the stock page
          </p>
        </div>
      )}

      <div className="mt-1.5 flex items-center gap-2 text-[10px] text-teal-200/35">
        <span>{fmtEarnDate(e.date)}</span>
        {stance && <span className="rounded bg-teal-400/10 px-1.5 py-0.5 font-semibold text-teal-200/70">Alfred: {stance}</span>}
        <Link href={`/stocks/${e.symbol}`} className="ml-auto text-teal-300/60 hover:underline">
          full report →
        </Link>
      </div>
    </div>
  );
}
