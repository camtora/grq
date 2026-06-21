"use client";

import { useState } from "react";
import Link from "next/link";

// Browse/screener action (Cam 2026-06-19): the primary CTA is RESEARCH, not "watch".
// Clicking kicks off a full dossier WITHOUT adding the name to the watchlist/universe
// (queues a researchRequest like a hunt find). Once a dossier exists the button becomes
// "View dossier" → the stock page. Same pattern for any name that's already been
// researched. Watching a name is a separate, secondary choice.
export type ResearchState = "none" | "inflight" | "done";

const base =
  "inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider transition";

export default function ResearchButton({
  symbol,
  state: initial,
  canResearch = true,
}: {
  symbol: string;
  state: ResearchState;
  /** Viewers can open an existing dossier but can't kick new research. */
  canResearch?: boolean;
}) {
  const [state, setState] = useState<ResearchState>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function kick() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/universe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "research", symbol }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(typeof data.error === "string" ? data.error : "Failed");
        setBusy(false);
        return;
      }
      setState("inflight");
    } catch {
      setErr("Failed");
    }
    setBusy(false);
  }

  if (state === "done") {
    return (
      <Link
        href={`/stocks/${symbol}`}
        className={`${base} border-teal-400/40 bg-teal-400/15 text-teal-200 hover:bg-teal-400/25`}
      >
        View dossier
      </Link>
    );
  }
  if (state === "inflight") {
    return (
      <Link
        href={`/stocks/${symbol}`}
        title="Research in progress — click to watch it land"
        className={`${base} border-teal-400/20 bg-teal-400/[0.06] text-teal-200/60 hover:bg-teal-400/10`}
      >
        Researching…
      </Link>
    );
  }
  if (!canResearch) return null;
  return (
    <button
      onClick={kick}
      disabled={busy}
      title={err ?? "Queue a deep-research dossier"}
      className={`${base} border-teal-400/30 text-teal-200/80 hover:bg-teal-400/10 disabled:opacity-50`}
    >
      {busy ? "…" : err ? "Retry" : "Research"}
    </button>
  );
}
