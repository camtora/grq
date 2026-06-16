"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// "Add note" on a stock page — saves a human note into "The record" (a NOTE journal
// entry). Collapsed to a button; expands to a textarea (Cam 2026-06-16).
export default function AddNote({ symbol }: { symbol: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    if (busy || !text.trim()) return;
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/note", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ symbol, body: text }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(d.error ?? `HTTP ${r.status}`);
      } else {
        setText("");
        setOpen(false);
        router.refresh();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-teal-400/30 px-2.5 py-1 text-xs font-semibold text-teal-300/80 transition-colors hover:bg-teal-400/10"
      >
        + add note
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-teal-400/20 bg-teal-400/[0.03] p-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        autoFocus
        placeholder="Your note on this stock — saved to The record."
        className="w-full resize-y rounded-lg border border-teal-400/20 bg-(--field-bg) px-2.5 py-2 text-sm text-teal-50 outline-none placeholder:text-teal-200/30"
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          onClick={save}
          disabled={busy || !text.trim()}
          className="rounded-lg border border-teal-400/40 bg-teal-400/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-teal-200 hover:bg-teal-400/25 disabled:opacity-40"
        >
          {busy ? "saving…" : "Save note"}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setText("");
            setErr("");
          }}
          className="text-xs text-teal-200/50 hover:text-teal-100"
        >
          cancel
        </button>
        {err && <span className="text-xs text-red-400">{err}</span>}
      </div>
    </div>
  );
}
