"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const btn = "rounded-lg px-2.5 py-1 text-xs font-semibold disabled:opacity-50";

/** Member-only lifecycle controls for one Options Desk: start/pause · reset · delete. */
export default function DeskControls({ deskId, status }: { deskId: number; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function act(op: string, confirmMsg?: string, gotoHub = false) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/desk/${deskId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op }) });
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      if (gotoHub) router.push("/options-desk");
      router.refresh();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "RUNNING" ? (
        <button disabled={busy} onClick={() => act("pause")} className={`${btn} border border-amber-400/20 bg-amber-400/5 text-amber-300 hover:bg-amber-400/10`}>
          Pause
        </button>
      ) : (
        <button disabled={busy} onClick={() => act("start")} className={`${btn} border border-emerald-400/20 bg-emerald-400/5 text-emerald-300 hover:bg-emerald-400/10`}>
          {status === "ENDED" ? "Reopen" : "Start"}
        </button>
      )}
      <button
        disabled={busy}
        onClick={() => act("reset", "Reset this desk? Both arms go back to their starting stake and all trades + history are wiped.")}
        className={`${btn} border border-teal-400/20 bg-teal-400/5 text-teal-300 hover:bg-teal-400/10`}
      >
        Reset
      </button>
      <button
        disabled={busy}
        onClick={() => act("delete", "Delete this desk entirely? This removes both arms and all history — can't be undone.", true)}
        className={`${btn} border border-red-400/20 bg-red-400/5 text-red-300 hover:bg-red-400/10`}
      >
        Delete
      </button>
    </div>
  );
}
