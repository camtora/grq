"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type RosterModel = { model: string; label: string };
type Row = { model: string; dial: string; persona: string };
const DIALS = ["CAUTIOUS", "BALANCED", "AGGRESSIVE"];

const inputCls = "rounded-lg border border-teal-400/15 bg-teal-400/[0.03] px-2 py-1 text-xs text-teal-50 outline-none focus:border-teal-400/40";
const btnCls = "rounded-lg px-2.5 py-1 text-xs font-semibold";

/** Member-only: spin up a new Bull Race — name, cadence, stake, and a free list of bulls
 *  (model × dial × persona). Add the same model twice with different dials to race "versions." */
export default function NewRaceForm({ roster }: { roster: RosterModel[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [cadence, setCadence] = useState("daily");
  const [stake, setStake] = useState(25000);
  const [rows, setRows] = useState<Row[]>(roster.map((r) => ({ model: r.model, dial: "BALANCED", persona: "" })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const labelFor = (m: string) => roster.find((r) => r.model === m)?.label ?? m;
  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { model: roster[0]?.model ?? "", dial: "BALANCED", persona: "" }]);
  const removeRow = (i: number) => setRows((rs) => rs.filter((_, j) => j !== i));

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/bulls", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || "New Race",
          cadence,
          startingStakeCents: Math.round(stake * 100),
          bulls: rows.filter((r) => r.model).map((r) => ({ model: r.model, dial: r.dial, persona: r.persona.trim() || null, label: labelFor(r.model) })),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      setOpen(false);
      router.push(`/bulls?race=${d.raceId}`);
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
        + New race
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-teal-400/20 bg-teal-400/[0.03] p-4">
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label className="text-xs text-teal-200/50">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Aggressive shootout" className={`mt-1 block w-48 ${inputCls}`} />
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

      <div className="mb-2 text-[10px] uppercase tracking-wider text-teal-200/40">Bulls ({rows.length}) — add a model twice with different dials for versions</div>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <select value={r.model} onChange={(e) => setRow(i, { model: e.target.value })} className={`${inputCls} w-44`}>
              {roster.map((m) => (
                <option key={m.model} value={m.model}>
                  {m.label}
                </option>
              ))}
            </select>
            <select value={r.dial} onChange={(e) => setRow(i, { dial: e.target.value })} className={inputCls}>
              {DIALS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <input value={r.persona} onChange={(e) => setRow(i, { persona: e.target.value })} placeholder="persona / style (optional)" className={`${inputCls} min-w-0 flex-1`} />
            <button onClick={() => removeRow(i)} className="px-1.5 text-teal-200/40 hover:text-red-300" title="remove">
              ✕
            </button>
          </div>
        ))}
      </div>

      <button onClick={addRow} className="mt-2 text-xs text-teal-300 hover:underline">
        + add bull
      </button>

      {error ? <div className="mt-3 text-xs text-red-300">{error}</div> : null}

      <div className="mt-4 flex gap-2">
        <button disabled={busy || rows.length === 0} onClick={submit} className={`${btnCls} bg-teal-400/20 text-teal-100 hover:bg-teal-400/30 disabled:opacity-50`}>
          {busy ? "Starting…" : "Start race"}
        </button>
        <button disabled={busy} onClick={() => setOpen(false)} className={`${btnCls} text-teal-200/50 hover:text-teal-200`}>
          Cancel
        </button>
      </div>
    </div>
  );
}
