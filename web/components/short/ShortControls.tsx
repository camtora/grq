"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Member controls for the house Short Lab: refresh (mark to live + run the margin check) · reset.
export default function ShortControls() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function act(op: string, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/short-lab", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op }) });
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
      <button disabled={busy} onClick={() => act("mark")} className="rounded-lg border border-teal-400/20 bg-teal-400/5 px-2.5 py-1 text-xs font-semibold text-teal-300 hover:bg-teal-400/10 disabled:opacity-50">
        ↻ Mark to live
      </button>
      <button disabled={busy} onClick={() => act("reset", "Reset the Short Lab? All positions, history, and the equity curve are wiped and cash goes back to the starting $100k.")} className="rounded-lg border border-red-400/20 bg-red-400/5 px-2.5 py-1 text-xs font-semibold text-red-300 hover:bg-red-400/10 disabled:opacity-50">
        Reset
      </button>
    </div>
  );
}
