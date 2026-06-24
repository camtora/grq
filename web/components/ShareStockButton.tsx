"use client";

import { useState } from "react";

// "Share with <other member>" — posts the symbol to the Cam↔Graham message thread
// (lands in the thread + pushes the recipient, deep-linking to the dossier). Reuses
// the messaging spine (D61) via POST /api/messages {symbol}; the route routes to the
// OTHER member automatically. Members-only (the route self-guards). `compact` = the
// smaller pill used beside Watch on the hunt cards.
export default function ShareStockButton({
  symbol,
  toName,
  compact = false,
  iconOnly = false,
}: {
  symbol: string;
  toName: string;
  compact?: boolean;
  /** Just the share glyph (matches the icon-only Watch on grid/scanner cards). */
  iconOnly?: boolean;
}) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "err">("idle");

  async function share(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (state === "busy") return;
    setState("busy");
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || d?.error) {
        setState("err");
      } else {
        window.dispatchEvent(new CustomEvent("grq:messages-changed"));
        setState("done");
      }
    } catch {
      setState("err");
    }
    setTimeout(() => setState("idle"), 2500);
  }

  const label =
    state === "busy" ? "Sharing…" : state === "done" ? `Shared with ${toName}` : state === "err" ? "Retry" : `Share with ${toName}`;

  const tone =
    state === "done"
      ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
      : state === "err"
        ? "border-red-400/40 bg-red-400/10 text-red-300"
        : "border-teal-400/30 bg-teal-400/10 text-teal-200 hover:bg-teal-400/20";

  const glyph = (sz: number) =>
    state === "done" ? (
      <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M20 6 9 17l-5-5" />
      </svg>
    ) : (
      <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <path d="m8.6 13.5 6.8 4M15.4 6.5 8.6 10.5" />
      </svg>
    );

  if (iconOnly) {
    return (
      <button
        onClick={share}
        disabled={state === "busy"}
        title={state === "done" ? `Shared with ${toName}` : `Share ${symbol} with ${toName}`}
        aria-label={`Share ${symbol} with ${toName}`}
        className={`inline-flex items-center justify-center rounded-lg border p-1.5 transition-colors disabled:opacity-50 ${tone}`}
      >
        {glyph(15)}
      </button>
    );
  }

  const size = compact ? "gap-1 rounded-lg px-2.5 py-1 text-xs" : "gap-1.5 rounded-lg px-3 py-1.5 text-sm";
  return (
    <button
      onClick={share}
      disabled={state === "busy"}
      title={`Share ${symbol} with ${toName}`}
      className={`inline-flex items-center border font-semibold transition-colors disabled:opacity-50 ${size} ${tone}`}
    >
      {glyph(compact ? 13 : 15)}
      {label}
    </button>
  );
}
