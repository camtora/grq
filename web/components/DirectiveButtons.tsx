"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Directive = { directive: "PINNED" | "BLOCKED"; by: string; note: string | null } | null;

export default function DirectiveButtons({
  symbol,
  current,
}: {
  symbol: string;
  current: Directive;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function set(directive: "PINNED" | "BLOCKED" | null, note?: string | null) {
    setBusy(true);
    try {
      await fetch("/api/stocks/directive", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ symbol, directive, note }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const isPinned = current?.directive === "PINNED";
  const isBlocked = current?.directive === "BLOCKED";

  return (
    <div className="flex items-center gap-2">
      <button
        disabled={busy}
        onClick={() => set(isPinned ? null : "PINNED")}
        title={isPinned ? `Pinned by ${current?.by} — click to unpin` : "Pin: always on the watchlist"}
        className={`rounded-xl border px-3 py-2 text-sm font-bold uppercase tracking-wider transition-colors disabled:opacity-50 ${
          isPinned
            ? "border-teal-400/50 bg-teal-400/20 text-teal-200"
            : "border-teal-400/20 text-teal-200/50 hover:bg-teal-400/10"
        }`}
      >
        {isPinned ? `Pinned by ${current?.by}` : "Pin"}
      </button>
      <button
        disabled={busy}
        onClick={() => {
          if (isBlocked) {
            set(null);
          } else {
            const note = window.prompt(`Block ${symbol} for the agent — why? (optional)`) ?? undefined;
            set("BLOCKED", note);
          }
        }}
        title={
          isBlocked
            ? `Blocked by ${current?.by}${current?.note ? `: "${current.note}"` : ""} — click to unblock`
            : "No-fly: the agent may never buy this (sells still allowed)"
        }
        className={`rounded-xl border px-3 py-2 text-sm font-bold uppercase tracking-wider transition-colors disabled:opacity-50 ${
          isBlocked
            ? "border-red-400/50 bg-red-400/15 text-red-300"
            : "border-red-400/20 text-red-300/50 hover:bg-red-400/10"
        }`}
      >
        {isBlocked ? `Blocked by ${current?.by}` : "Block"}
      </button>
    </div>
  );
}
