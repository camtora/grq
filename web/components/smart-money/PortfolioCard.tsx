"use client";

import { useState } from "react";
import Link from "next/link";
import SmartMoneyAvatar from "./SmartMoneyAvatar";
import { fmtUsd, type SmPortfolio, type SmHolding, type WatchOverlap } from "@/lib/smart-money/types";

// One tracked fund: a clickable header (avatar + name + meta) that expands into a
// Watchlist-style holdings table. Holdings we already track link to the stock
// page and wear an overlap badge; the rest are informational (mostly US-listed —
// leads, not trades). PUT/CALL lines are flagged so a bearish book doesn't read bull.

const ACTION: Record<string, { label: string; cls: string }> = {
  NEW: { label: "NEW", cls: "border-teal-400/30 bg-teal-400/15 text-teal-200" },
  ADD: { label: "ADD", cls: "border-emerald-400/30 bg-emerald-400/15 text-emerald-300" },
  TRIM: { label: "TRIM", cls: "border-amber-400/30 bg-amber-400/15 text-amber-300" },
  HOLD: { label: "HOLD", cls: "border-teal-400/10 bg-teal-400/5 text-teal-200/45" },
  EXIT: { label: "EXIT", cls: "border-red-400/30 bg-red-400/15 text-red-300" },
};

function Badge({ children, cls }: { children: React.ReactNode; cls: string }) {
  return <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${cls}`}>{children}</span>;
}

function HoldingRow({ h, overlap, maxPct }: { h: SmHolding; overlap?: WatchOverlap; maxPct: number }) {
  const act = ACTION[h.action] ?? ACTION.HOLD;
  const barW = Math.max(4, Math.round((h.pctOfPort / maxPct) * 100));
  return (
    <div className="flex items-center gap-3 border-t border-teal-400/10 py-2 text-sm">
      <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-teal-200/30">{h.rank}</span>
      <div className="flex w-20 shrink-0 items-center gap-1.5">
        {overlap ? (
          <Link href={`/stocks/${h.symbol}`} className="font-semibold text-teal-300 hover:underline">
            {h.symbol}
          </Link>
        ) : (
          <span className="font-semibold text-teal-100/90">{h.symbol}</span>
        )}
        {h.putCall && (
          <Badge cls={h.putCall === "PUT" ? "border-red-400/30 bg-red-400/15 text-red-300" : "border-sky-400/30 bg-sky-400/15 text-sky-300"}>
            {h.putCall}
          </Badge>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-xs text-teal-100/70" title={h.name}>
            {h.name.replace(/\b(INC|CORP|CO|LTD|PLC|LP|LLC|N V|S A|GROUP)\b\.?/gi, "").trim() || h.name}
          </span>
          {overlap === "universe" && <Badge cls="border-emerald-400/30 bg-emerald-400/10 text-emerald-300/80">ours</Badge>}
          {overlap === "watching" && <Badge cls="border-teal-400/30 bg-teal-400/10 text-teal-300/80">watching</Badge>}
        </div>
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-teal-400/5">
          <div className="h-full rounded-full bg-teal-400/40" style={{ width: `${barW}%` }} />
        </div>
      </div>
      <span className="w-12 shrink-0 text-right text-xs tabular-nums text-teal-100/80">{(h.pctOfPort * 100).toFixed(1)}%</span>
      <span className="w-12 shrink-0 text-right">
        <Badge cls={act.cls}>{act.label}</Badge>
      </span>
    </div>
  );
}

export default function PortfolioCard({ p, overlap }: { p: SmPortfolio; overlap: Record<string, WatchOverlap> }) {
  const [open, setOpen] = useState(false);
  const maxPct = Math.max(...p.topHoldings.map((h) => h.pctOfPort), 0.01);
  const ownsCount = p.topHoldings.filter((h) => overlap[h.symbol]).length;

  return (
    <div className="rounded-2xl border border-[color:var(--card-border)] bg-[var(--card-bg)]">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-start gap-3 p-4 text-left">
        <SmartMoneyAvatar name={p.name} avatar={p.avatar} accent={p.accent} className="h-12 w-12 text-base" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-teal-50">{p.name}</span>
            {p.hasPuts && <Badge cls="border-red-400/30 bg-red-400/10 text-red-300/80">holds puts</Badge>}
          </div>
          <div className="text-xs text-teal-200/50">{p.firm}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-teal-200/40">
            <span className="font-semibold text-teal-200/70">{fmtUsd(p.totalValueUsd)}</span>
            <span>·</span>
            <span>{p.holdingsCount} holdings</span>
            <span>·</span>
            <span>13F {p.asOf}</span>
            {p.perf1yPct != null && (
              <>
                <span>·</span>
                <span className={p.perf1yPct >= 0 ? "text-emerald-400/80" : "text-red-400/80"}>
                  {p.perf1yPct >= 0 ? "+" : ""}
                  {p.perf1yPct.toFixed(1)}% 1y
                </span>
              </>
            )}
            {ownsCount > 0 && (
              <>
                <span>·</span>
                <span className="text-emerald-300/70">{ownsCount} overlap{ownsCount > 1 ? "s" : ""} our universe</span>
              </>
            )}
          </div>
        </div>
        <span className={`shrink-0 text-teal-200/40 transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open && (
        <div className="px-4 pb-4">
          <p className="mb-2 text-xs italic text-teal-200/45">{p.blurb}</p>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-teal-200/40">
            <span>
              Top {p.topHoldings.length} of {p.holdingsCount} — 13F as of {p.asOf}, ~45-day lag.
            </span>
            {(p.securitiesAdded != null || p.securitiesRemoved != null) && (
              <span>
                {p.securitiesAdded != null && <span className="text-emerald-400/70">+{p.securitiesAdded} new</span>}
                {p.securitiesRemoved != null && <span className="text-red-400/70"> · −{p.securitiesRemoved} exited</span>}
                <span> this quarter</span>
              </span>
            )}
          </div>
          {p.hasPuts && (
            <p className="mb-1 text-[11px] text-red-300/70">
              ⚠ <span className="font-semibold">PUT</span> lines are bearish bets against a name (and CALL lines are leveraged longs) — 13F shows the
              option notional, not a short. Don&apos;t read a put as ownership.
            </p>
          )}
          <div>
            {p.topHoldings.map((h) => (
              <HoldingRow key={`${h.symbol}-${h.putCall ?? ""}`} h={h} overlap={overlap[h.symbol]} maxPct={maxPct} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
