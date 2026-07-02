"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Member controls for the Day-Trading Lab: start a lab on a ticker, and (once open) Buy / Sell / Flatten.
// Modeled sandbox — never executable. docs/DAY-TRADE-LAB.md.
export default function DayControls({ open, symbol }: { open: boolean; symbol: string | null }) {
  const router = useRouter();
  const [ticker, setTicker] = useState("");
  const [shares, setShares] = useState(100);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function post(body: Record<string, unknown>, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/day-lab", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* start / restart */}
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-teal-200/50">New lab — ticker</span>
          <input value={ticker} onChange={(e) => setTicker(e.target.value)} onKeyDown={(e) => e.key === "Enter" && post({ op: "start", symbol: ticker })} placeholder="e.g. NVDA" className="w-32 rounded-lg border border-[color:var(--card-border)] bg-[var(--field-bg)] px-2 py-1.5 text-sm uppercase text-teal-50 outline-none placeholder:text-teal-200/30 placeholder:normal-case" />
        </label>
        <button type="button" onClick={() => post({ op: "start", symbol: ticker })} disabled={busy || !ticker.trim()} className="rounded-lg border border-teal-400/30 bg-teal-400/15 px-2.5 py-1.5 text-xs font-bold uppercase tracking-wider text-teal-200 hover:bg-teal-400/25 disabled:opacity-50">
          {busy ? "…" : open ? "Start new" : "Start lab"}
        </button>
      </div>

      {/* trade the open lab */}
      {open ? (
        <div className="flex flex-wrap items-end gap-2 border-t border-teal-400/10 pt-3">
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-teal-200/50">Shares ({symbol})</span>
            <input type="number" min={1} value={shares} onChange={(e) => setShares(Number(e.target.value))} className="w-24 rounded-lg border border-[color:var(--card-border)] bg-[var(--field-bg)] px-2 py-1.5 text-sm tabular-nums text-teal-50 outline-none" />
          </label>
          <button type="button" onClick={() => post({ op: "buy", shares })} disabled={busy} className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1.5 text-xs font-bold uppercase tracking-wider text-emerald-300 hover:bg-emerald-400/20 disabled:opacity-50">Buy @ ask</button>
          <button type="button" onClick={() => post({ op: "sell", shares })} disabled={busy} className="rounded-lg border border-red-400/25 bg-red-400/10 px-2.5 py-1.5 text-xs font-bold uppercase tracking-wider text-red-300 hover:bg-red-400/20 disabled:opacity-50">Sell @ bid</button>
          <button type="button" onClick={() => post({ op: "flatten" }, "Flatten (sell all) and close this lab for a final verdict?")} disabled={busy} className="rounded-lg border border-[color:var(--card-border)] px-2.5 py-1.5 text-xs font-bold uppercase tracking-wider text-teal-200/90 hover:bg-teal-400/10 disabled:opacity-50">Flatten &amp; close</button>
          <button type="button" onClick={() => post({ op: "reset" }, "Delete this lab and its history?")} disabled={busy} className="rounded-lg border border-red-400/15 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-red-300/70 hover:bg-red-400/10 disabled:opacity-50">Reset</button>
        </div>
      ) : null}
      {err ? <p className="text-[11px] text-amber-300/80">{err}</p> : null}
    </div>
  );
}
