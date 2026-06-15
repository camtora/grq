"use client";

import { useState } from "react";

// "+ research" on a market-screener row → adds it as a universe candidate
// (the agent then dossiers it). Members only; the route enforces it.
export default function ScreenerAddButton({ symbol }: { symbol: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "err">("idle");
  const [msg, setMsg] = useState("");

  async function add() {
    if (state === "busy" || state === "done") return;
    setState("busy");
    try {
      const res = await fetch("/api/universe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "add", symbol }),
      });
      const data = await res.json();
      if (!res.ok) {
        setState("err");
        setMsg(data.error ?? `HTTP ${res.status}`);
      } else {
        setState("done");
      }
    } catch (e) {
      setState("err");
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }

  if (state === "done") return <span className="text-xs text-emerald-400">queued ✓</span>;
  return (
    <button
      onClick={add}
      disabled={state === "busy"}
      title={msg || "Add as a research candidate"}
      className="rounded-lg border border-teal-400/30 px-2 py-1 text-xs font-semibold text-teal-300 hover:bg-teal-400/10 disabled:opacity-40"
    >
      {state === "busy" ? "…" : state === "err" ? "retry" : "+ research"}
    </button>
  );
}
