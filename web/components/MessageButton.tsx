"use client";

import { useCallback, useEffect, useState } from "react";

// The header envelope — opens the unified chat drawer on the Messages tab and
// badges the Cam↔Graham unread count (D63). Polls /api/messages/unread; clears
// instantly when the drawer marks the thread read (the "grq:messages-read" event).
// Members-only (mounted by NavBar).

const POLL_MS = 20_000;

export default function MessageButton() {
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/messages/unread", { cache: "no-store" });
      if (!r.ok) return;
      const d = await r.json();
      if (typeof d.unread === "number") setUnread(d.unread);
    } catch {
      /* transient — keep last good count */
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    // The drawer fires this after marking the thread read, or after sending — refresh now.
    function onRead() {
      setUnread(0);
    }
    function onChanged() {
      load();
    }
    window.addEventListener("grq:messages-read", onRead);
    window.addEventListener("grq:messages-changed", onChanged);
    return () => {
      clearInterval(t);
      window.removeEventListener("grq:messages-read", onRead);
      window.removeEventListener("grq:messages-changed", onChanged);
    };
  }, [load]);

  function open() {
    window.dispatchEvent(new CustomEvent("grq:chat", { detail: { tab: "messages" } }));
  }

  return (
    <button
      onClick={open}
      aria-label={unread > 0 ? `Messages (${unread} unread)` : "Messages"}
      className="relative rounded-lg p-1.5 text-teal-200/70 transition-colors hover:bg-teal-400/10 hover:text-teal-100"
    >
      {/* Envelope */}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </svg>
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-teal-400 px-1 text-[10px] font-bold leading-none text-slate-900">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );
}
