"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Kick a full dossier for a Chess Moves play (lead → research → §6 gate, D46). Members
// only; idempotent on the server. After queueing, the play's stock page shows the
// "researching…" state until the dossier lands.
export default function ChessResearchButton({ symbol }: { symbol: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "done" | "exists">("idle");

  async function go() {
    if (state === "busy") return;
    setState("busy");
    try {
      const r = await fetch("/api/chess/research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      const d = await r.json().catch(() => ({}));
      setState(d?.result === "queued" ? "done" : "exists");
      router.refresh();
    } catch {
      setState("idle");
    }
  }

  const label =
    state === "busy" ? "queuing…" : state === "done" ? "researching…" : state === "exists" ? "research ready →" : "Research";

  return (
    <button
      onClick={go}
      disabled={state === "busy"}
      className="rounded-lg border border-teal-400/30 px-2.5 py-1 text-xs font-semibold text-teal-200/90 transition hover:bg-teal-400/10 disabled:opacity-40"
      title="Queue a full dossier for this lead — it then clears the normal order gate before anything trades"
    >
      {label}
    </button>
  );
}
