"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const inputCls = "rounded-lg border border-teal-400/15 bg-teal-400/[0.03] px-2 py-1 text-xs text-teal-50 outline-none focus:border-teal-400/40";
const btnCls = "rounded-lg px-2.5 py-1 text-xs font-semibold";

/** Member-only: spin up a new Options Desk. A desk is always control (Opus, stock-only) vs treatment
 *  (Opus + options) — the only knobs are the name, cadence, and stake. */
export default function NewDeskForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [cadence, setCadence] = useState("daily");
  const [stake, setStake] = useState(50000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/desk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() || "New Desk", cadence, startingStakeCents: Math.round(stake * 100) }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      setOpen(false);
      router.push(`/options-desk?desk=${d.deskId}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={`${btnCls} border border-teal-400/20 bg-teal-400/5 text-teal-300 hover:bg-teal-400/10`}>
        + New desk
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-teal-400/20 bg-teal-400/[0.03] p-4 text-left">
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label className="text-xs text-teal-200/50">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Earnings-season desk" className={`mt-1 block w-48 ${inputCls}`} />
        </label>
        <label className="text-xs text-teal-200/50">
          Cadence
          <select value={cadence} onChange={(e) => setCadence(e.target.value)} className={`mt-1 block ${inputCls}`}>
            <option value="daily">daily</option>
            <option value="hourly">hourly</option>
          </select>
        </label>
        <label className="text-xs text-teal-200/50">
          Stake each (CA$)
          <input type="number" min={1000} step={1000} value={stake} onChange={(e) => setStake(Number(e.target.value) || 0)} className={`mt-1 block w-28 ${inputCls}`} />
        </label>
      </div>

      <p className="mb-3 text-[10px] text-teal-200/40">Two arms are created automatically — a control (Opus, stock-only) and a treatment (Opus, +options).</p>

      {error ? <div className="mb-3 text-xs text-red-300">{error}</div> : null}

      <div className="flex gap-2">
        <button disabled={busy} onClick={submit} className={`${btnCls} bg-teal-400/20 text-teal-100 hover:bg-teal-400/30 disabled:opacity-50`}>
          {busy ? "Starting…" : "Start desk"}
        </button>
        <button disabled={busy} onClick={() => setOpen(false)} className={`${btnCls} text-teal-200/50 hover:text-teal-200`}>
          Cancel
        </button>
      </div>
    </div>
  );
}
