"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Dismiss a hunt proposal we don't want — marks it RETIRED (via /api/universe) so
// the hunt won't resurface it and it lands in Retired research (Cam 2026-06-16).
export default function DismissButton({ symbol, name }: { symbol: string; name?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  async function go() {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/universe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "dismiss", symbol, name }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(d.error ?? `HTTP ${r.status}`);
      } else {
        setDone(true);
        router.refresh();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (done) return <span className="text-[11px] text-teal-200/40">dismissed</span>;
  return (
    <button
      onClick={go}
      disabled={busy}
      title={err || "Dismiss — mark it Retired so the hunt won't resurface it"}
      className="text-[11px] font-semibold text-teal-200/40 transition-colors hover:text-red-300/80 disabled:opacity-40"
    >
      {busy ? "…" : err ? "retry" : "✕ dismiss"}
    </button>
  );
}
