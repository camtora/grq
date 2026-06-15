"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Toggle a ticker on/off your watchlist. Works for any symbol (universe or not).
export default function WatchButton({ symbol, watched: initial }: { symbol: string; watched?: boolean }) {
  const router = useRouter();
  const [watched, setWatched] = useState(!!initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ symbol, action: watched ? "remove" : "add" }),
      });
      if (res.ok) {
        const d = await res.json();
        setWatched(!!d.watched);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      title={watched ? "On your watchlist — click to remove" : "Add to your watchlist"}
      className={`rounded-lg border px-2 py-1 text-xs font-semibold transition-colors disabled:opacity-40 ${
        watched
          ? "border-teal-400/50 bg-teal-400/15 text-teal-200"
          : "border-teal-400/25 text-teal-300/70 hover:bg-teal-400/10"
      }`}
    >
      {busy ? "…" : watched ? "★ watching" : "☆ watch"}
    </button>
  );
}
