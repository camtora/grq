"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Member controls for the Short Lab agent A/B contest: start / pause / reset.
export default function ShortDeskControls({ status }: { status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function act(op: string, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/short-desk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op }) });
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      router.refresh();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {status === "RUNNING" ? (
        <button disabled={busy} onClick={() => act("pause")} className="rounded-lg border border-amber-400/20 bg-amber-400/5 px-2.5 py-1 text-xs font-semibold text-amber-300 hover:bg-amber-400/10 disabled:opacity-50">Pause</button>
      ) : (
        <button disabled={busy} onClick={() => act("start")} className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 px-2.5 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-400/10 disabled:opacity-50">Start</button>
      )}
      <button disabled={busy} onClick={() => act("reset", "Reset the A/B? Both arms go back to $100k and all positions/trades/history are wiped.")} className="rounded-lg border border-red-400/20 bg-red-400/5 px-2.5 py-1 text-xs font-semibold text-red-300 hover:bg-red-400/10 disabled:opacity-50">Reset</button>
    </div>
  );
}
