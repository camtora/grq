"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Jot a research note (optionally tagged to a ticker). Members only.
export default function NoteForm() {
  const router = useRouter();
  const [symbol, setSymbol] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!body.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body, symbol: symbol.trim() || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      setBody("");
      setSymbol("");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-teal-400/15 bg-teal-400/[0.02] p-4">
      <div className="mb-2 flex items-center gap-2">
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="ticker"
          className="w-28 rounded-lg border border-teal-400/20 bg-(--field-bg) px-2.5 py-1.5 text-sm uppercase text-teal-50 outline-none placeholder:normal-case placeholder:text-teal-200/30"
        />
        <span className="text-xs text-teal-200/40">tag the note to a stock, or leave blank for a general note</span>
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="What did you find? (markdown supported)"
        rows={3}
        className="w-full rounded-lg border border-teal-400/20 bg-(--field-bg) px-3 py-2 text-sm text-teal-50 outline-none placeholder:text-teal-200/30"
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          onClick={save}
          disabled={busy || !body.trim()}
          className="rounded-xl border border-teal-400/40 bg-teal-400/15 px-4 py-2 text-sm font-bold uppercase tracking-wider text-teal-200 hover:bg-teal-400/25 disabled:opacity-40"
        >
          {busy ? "saving…" : "Save note"}
        </button>
        {err && <span className="text-sm text-red-400">{err}</span>}
      </div>
    </div>
  );
}
