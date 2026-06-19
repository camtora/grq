"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Directive = { directive: "PINNED" | "BLOCKED"; by: string; note: string | null } | null;

export default function DirectiveButtons({
  symbol,
  current,
  canEdit = true,
}: {
  symbol: string;
  current: Directive;
  canEdit?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  // Match the UniverseActions button shape EXACTLY (research / promote / demote / ✕)
  // so the whole action row is one consistent size (Cam 2026-06-19).
  const btn = "rounded-md border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors disabled:opacity-40";

  // Viewers see the directive state read-only (nothing if there's none).
  if (!canEdit) {
    if (!current) return null;
    const pinned = current.directive === "PINNED";
    return (
      <span
        className={`${btn} ${
          pinned ? "border-teal-400/50 bg-teal-400/20 text-teal-200" : "border-red-400/50 bg-red-400/15 text-red-300"
        }`}
      >
        {pinned ? `Pinned by ${current.by}` : `Blocked by ${current.by}`}
      </span>
    );
  }

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
        className={`${btn} ${
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
        className={`${btn} ${
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
