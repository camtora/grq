"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// One unified action across the app. Watching a stock makes it a research
// CANDIDATE (your watchlist) — the agent dossiers it; it's not tradeable until
// you both promote it into the universe. "universe" = already ACTIVE (ours),
// shown as a badge, not a toggle.
export type WatchState = "none" | "watching" | "universe";

export default function WatchButton({
  symbol,
  exchange,
  currency,
  state: initial = "none",
  iconOnly = false,
}: {
  symbol: string;
  exchange?: string;
  currency?: string;
  state?: WatchState;
  /** Collapse to a 34×34 star (dense grid/table layouts). */
  iconOnly?: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<WatchState>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function call(action: "add" | "retire") {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      // Pass the listing (exchange + currency) so the server resolves THIS one,
      // not a ".TO" guess or a colliding CDR (D24).
      const res = await fetch("/api/universe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(action === "add" ? { action, symbol, exchange, currency } : { action, symbol }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.error ?? `HTTP ${res.status}`);
      } else {
        setState(action === "add" ? "watching" : "none");
        router.refresh();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (state === "universe") {
    return iconOnly ? (
      <span
        className="flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-emerald-400/30 bg-emerald-400/10 text-sm text-emerald-300/80"
        title="In the tradeable universe — the agent may buy it"
      >
        ✓
      </span>
    ) : (
      <span
        className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-xs font-semibold text-emerald-300/80"
        title="In the tradeable universe — the agent may buy it"
      >
        ✓ universe
      </span>
    );
  }

  const watching = state === "watching";
  if (iconOnly) {
    return (
      <button
        onClick={() => call(watching ? "retire" : "add")}
        disabled={busy}
        title={err || (watching ? "On your watchlist — click to stop watching." : "Watch — the agent dossiers it and it joins your watchlist")}
        className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg border text-sm transition-colors disabled:opacity-40 ${
          watching ? "border-teal-400/45 bg-teal-400/15 text-teal-200" : "border-teal-400/20 text-teal-300/70 hover:bg-teal-400/10"
        }`}
      >
        {busy ? "…" : err ? "↻" : watching ? "★" : "☆"}
      </button>
    );
  }
  return (
    <button
      onClick={() => call(watching ? "retire" : "add")}
      disabled={busy}
      title={
        err ||
        (watching
          ? "On your watchlist — the agent is researching it. Click to stop watching."
          : "Watch — the agent dossiers it and it joins your watchlist")
      }
      className={`rounded-lg border px-2 py-1 text-xs font-semibold transition-colors disabled:opacity-40 ${
        watching
          ? "border-teal-400/50 bg-teal-400/15 text-teal-200"
          : "border-teal-400/25 text-teal-300/70 hover:bg-teal-400/10"
      }`}
    >
      {busy ? "…" : err ? "retry" : watching ? "★ watching" : "☆ watch"}
    </button>
  );
}
