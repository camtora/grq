"use client";

import { useCallback, useEffect, useState } from "react";

// The header messages bubble (matches the iOS bubble.left.and.bubble.right icon) —
// opens the member↔member Messages drawer and badges the Cam↔Graham unread count
// (D63). Live via the /api/messages/stream SSE (the web twin of iOS's push-received
// refresh, 2e02e48): the badge updates the instant a DM lands or is read on ANY
// surface. A slow poll of /api/messages/unread is the no-stream fallback (matching
// the phone's 60s tick), and "grq:messages-read"/"grq:messages-changed" keep the
// same tab instant. Members-only (mounted by NavBar). The Ask-GRQ chat is a
// separate floating bubble (<GrqChat>), not in here.

const POLL_MS = 60_000;

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
    // The live path: the server pushes {unread} the moment a DM lands or the thread
    // is marked read. EventSource reconnects on its own; the poll above covers any
    // stretch where the stream can't.
    const es = new EventSource("/api/messages/stream");
    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (typeof d.unread === "number") setUnread(d.unread);
      } catch {
        /* not ours — ignore */
      }
    };
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
      es.close();
      window.removeEventListener("grq:messages-read", onRead);
      window.removeEventListener("grq:messages-changed", onChanged);
    };
  }, [load]);

  function open() {
    window.dispatchEvent(new Event("grq:messages"));
  }

  return (
    <button
      onClick={open}
      aria-label={unread > 0 ? `Messages (${unread} unread)` : "Messages"}
      className="relative rounded-lg p-1.5 text-teal-200/70 transition-colors hover:bg-teal-400/10 hover:text-teal-100"
    >
      {/* Two overlapping speech bubbles — a messenger/conversation icon (matches the iOS
          bubble.left.and.bubble.right), distinct from the single-bubble Ask-GRQ icon. */}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5Z" />
        <path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1" />
      </svg>
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-teal-400 px-1 text-[10px] font-bold leading-none text-slate-900">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );
}
