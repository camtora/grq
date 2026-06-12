"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AddTicker() {
  const router = useRouter();
  const [symbol, setSymbol] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function add() {
    const s = symbol.trim().toUpperCase();
    if (!s || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/universe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "add", symbol: s }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ ok: false, text: data.error ?? `HTTP ${res.status}` });
      } else {
        setMsg({ ok: true, text: `${s} added as a candidate (${data.yahoo ?? ""}) — dossier queued.` });
        setSymbol("");
        router.refresh();
      }
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-dashed border-teal-400/20 bg-teal-400/[0.02] p-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-sm font-semibold uppercase tracking-wider text-teal-200/50">
          Research a new stock
        </span>
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="ticker (TSX / TSX-V)"
          className="w-40 rounded-lg border border-teal-400/20 bg-(--field-bg) px-2.5 py-2 text-sm uppercase text-teal-50 outline-none placeholder:normal-case placeholder:text-teal-200/30"
        />
        <button
          onClick={add}
          disabled={busy || !symbol.trim()}
          className="rounded-xl border border-teal-400/40 bg-teal-400/15 px-4 py-2 text-sm font-bold uppercase tracking-wider text-teal-200 hover:bg-teal-400/25 disabled:opacity-40"
        >
          {busy ? "validating…" : "Add"}
        </button>
        <span className="text-xs text-teal-200/40">
          becomes a researched candidate — trading it requires both of you to promote it
        </span>
      </div>
      {msg && (
        <div className={`mt-2 text-sm ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</div>
      )}
    </div>
  );
}
