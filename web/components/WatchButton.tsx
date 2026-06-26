"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// A pure PERSONAL watch toggle (D-watch). Watching a stock adds YOUR face to it and
// makes it a tracked research CANDIDATE (the agent dossiers it) — independent of the
// tradeable universe: you can watch an ACTIVE name too, and un-watching removes only
// your own watch (it never stops research or un-promotes the name). Universe status
// is shown elsewhere (chips / RatingBar / the tracking column), not by this button.
//
// WatchState stays exported — callers still use it for tracking columns / sorting /
// visibility — but it's no longer how this button is driven (that's `watching`).
export type WatchState = "none" | "watching" | "universe";

export default function WatchButton({
  symbol,
  exchange,
  currency,
  watching: initial = false,
  iconOnly = false,
}: {
  symbol: string;
  exchange?: string;
  currency?: string;
  /** Does the CURRENT member watch this right now? */
  watching?: boolean;
  /** Collapse to a 34×34 star (dense grid/table layouts). */
  iconOnly?: boolean;
}) {
  const router = useRouter();
  const [watching, setWatching] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setErr("");
    const action = watching ? "unwatch" : "add";
    try {
      // The listing (exchange + currency) lets the server resolve THIS one when it
      // has to track the name for the first time (D24) — ignored otherwise.
      const res = await fetch("/api/universe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(action === "add" ? { action, symbol, exchange, currency } : { action, symbol }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.error ?? `HTTP ${res.status}`);
      } else {
        setWatching(action === "add");
        router.refresh();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const title =
    err ||
    (watching
      ? "You're watching this — click to stop watching (research & universe unaffected)."
      : "Watch — adds your face and the agent dossiers it");

  if (iconOnly) {
    return (
      <button
        onClick={toggle}
        disabled={busy}
        title={title}
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
      onClick={toggle}
      disabled={busy}
      title={title}
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
