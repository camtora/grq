"use client";

import { useState } from "react";

// "Refresh the hunt" (Graham) — queues an off-schedule discovery-hunt run. The
// agent picks up the flag on its next tick (seconds), then posts fresh names.
export default function RefreshHuntButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function go() {
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/hunt/refresh", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setMsg(d.error ?? `HTTP ${r.status}`);
      else setMsg(d.queued ? "Queued — fresh names land in a minute or two." : (d.note ?? "Already queued."));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={go}
        disabled={busy}
        className="rounded-lg border border-teal-400/30 px-2.5 py-1 text-xs font-semibold text-teal-300/80 transition-colors hover:bg-teal-400/10 disabled:opacity-40"
        title="Run the discovery hunt now (it otherwise runs once each market morning)"
      >
        {busy ? "queuing…" : "↻ refresh hunt"}
      </button>
      {msg && <span className="text-[11px] text-teal-200/50">{msg}</span>}
    </span>
  );
}
