"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Member control: open a MODELED short on a real US name (docs/SHORT-LAB.md). Sandbox — never executable.
export default function OpenShortForm() {
  const router = useRouter();
  const [symbol, setSymbol] = useState("");
  const [mode, setMode] = useState<"dollars" | "shares">("dollars");
  const [size, setSize] = useState(5000);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    const sym = symbol.trim().toUpperCase();
    if (!sym) return;
    setBusy(true);
    setErr(null);
    try {
      const body = mode === "shares" ? { op: "open", symbol: sym, qty: Math.floor(size) } : { op: "open", symbol: sym, notionalCents: Math.round(size * 100) };
      const res = await fetch("/api/short-lab", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      setSymbol("");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-teal-200/50">Ticker (US)</span>
          <input value={symbol} onChange={(e) => setSymbol(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="e.g. GME" className="w-28 rounded-lg border border-[color:var(--card-border)] bg-[var(--field-bg)] px-2 py-1.5 text-sm uppercase text-teal-50 outline-none placeholder:text-teal-200/30 placeholder:normal-case" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-teal-200/50">Size</span>
          <div className="flex items-center rounded-lg border border-[color:var(--card-border)] bg-[var(--field-bg)] px-2">
            {mode === "dollars" ? <span className="text-xs text-teal-200/40">$</span> : null}
            <input type="number" min={1} value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-24 bg-transparent py-1.5 text-sm tabular-nums text-teal-50 outline-none" />
          </div>
        </label>
        <div className="flex overflow-hidden rounded-lg border border-[color:var(--card-border)]">
          {(["dollars", "shares"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={`px-2.5 py-1.5 text-xs font-semibold ${mode === m ? "bg-teal-400/15 text-teal-100" : "text-teal-200/50 hover:bg-teal-400/10"}`}>
              {m === "dollars" ? "$ notional" : "shares"}
            </button>
          ))}
        </div>
        <button type="button" onClick={submit} disabled={busy} className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-red-300 hover:bg-red-400/20 disabled:opacity-50">
          {busy ? "…" : "Short it"}
        </button>
      </div>
      {err ? <p className="text-[11px] text-amber-300/80">{err}</p> : null}
      <p className="text-[10px] text-teal-200/40">Opens a modeled short at the live quote. Remember: the loss is unbounded, and you pay a modeled borrow fee to hold it.</p>
    </div>
  );
}
