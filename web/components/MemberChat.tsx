"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

// The Cam↔Graham direct-message pane (D63 — the web side of the iOS member chat).
// Loads /api/messages, polls for new rows by id, sends via POST, and marks the
// thread read whenever it's the visible tab (clearing the envelope badge). A
// message can carry a shared symbol/panel → renders a tappable dossier card.

type DM = {
  id: number;
  at: string;
  fromKey: string | null;
  fromName: string;
  mine: boolean;
  body: string;
  symbol: string | null;
  panel: string | null;
  panelLabel: string | null;
  readAt: string | null;
};

const POLL_MS = 4_000;

// GRQ Go's quiet time label (mobile/app/messages.tsx): time only for today,
// "Thu, Jul 3 · 1:24 PM" for older pauses.
function timeLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return today ? time : `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · ${time}`;
}

export default function MemberChat({ active, heightClass = "h-full" }: { active: boolean; heightClass?: string }) {
  const [messages, setMessages] = useState<DM[]>([]);
  const [draft, setDraft] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [otherName, setOtherName] = useState("your partner");
  const lastId = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const didInitialScroll = useRef(false);

  // Open straight at the latest message — instant on first paint / each (re)open,
  // smooth for new messages after that.
  const scrollToBottom = (instant: boolean) => {
    const el = listRef.current;
    if (!el) return;
    if (instant) el.scrollTop = el.scrollHeight;
    else el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  const markRead = useCallback(() => {
    fetch("/api/messages/read", { method: "POST" })
      .then(() => window.dispatchEvent(new CustomEvent("grq:messages-read")))
      .catch(() => {});
  }, []);

  // Initial load.
  useEffect(() => {
    fetch("/api/messages", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.messages)) {
          setMessages(d.messages);
          lastId.current = d.messages.reduce((mx: number, m: DM) => Math.max(mx, m.id), 0);
        }
        if (typeof d.otherName === "string") setOtherName(d.otherName);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  // Poll for new rows since the last id we hold.
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/api/messages?since=${lastId.current}`, { cache: "no-store" });
        if (!r.ok) return;
        const d = await r.json();
        if (Array.isArray(d.messages) && d.messages.length) {
          setMessages((prev) => {
            const seen = new Set(prev.map((m) => m.id));
            const fresh = (d.messages as DM[]).filter((m) => !seen.has(m.id));
            if (!fresh.length) return prev;
            lastId.current = Math.max(lastId.current, ...fresh.map((m) => m.id));
            return [...prev, ...fresh];
          });
          if (active) markRead();
        }
      } catch {
        /* transient */
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [active, markRead]);

  // Mark read when this tab becomes the visible one (and after the first load).
  useEffect(() => {
    if (active && loaded) markRead();
  }, [active, loaded, markRead]);

  useEffect(() => {
    scrollToBottom(!didInitialScroll.current);
    if (messages.length) didInitialScroll.current = true;
  }, [messages]);

  useEffect(() => {
    if (active) {
      didInitialScroll.current = false;
      requestAnimationFrame(() => scrollToBottom(true));
    }
  }, [active]);

  async function send() {
    const body = draft.trim();
    if (!body || busy) return;
    setDraft("");
    setBusy(true);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const d = await res.json();
      if (res.ok && d.message) {
        setMessages((m) => [...m, d.message as DM]);
        lastId.current = Math.max(lastId.current, d.message.id);
        window.dispatchEvent(new CustomEvent("grq:messages-changed"));
      } else {
        setDraft(body); // restore so the text isn't lost
      }
    } catch {
      setDraft(body);
    } finally {
      setBusy(false);
    }
  }

  // GRQ Go's messages styling (mobile/app/messages.tsx, Cam 2026-07-03): borderless
  // iMessage-style bubbles — mine = a light accent tint, theirs = a quiet raised surface —
  // clustered when the same side sends consecutively, a centered time label when the
  // conversation pauses (>20 min), a "read" receipt under my last read message, and a
  // pill input with a circular ↑ send. No per-bubble names/avatars — two people, two sides.
  return (
    <div className={`flex flex-col ${heightClass}`}>
      <div ref={listRef} className="flex-1 overflow-y-auto pr-1">
        {loaded && messages.length === 0 && (
          <p className="pt-10 text-center text-sm text-teal-200/40">
            No messages yet — say something, or share a stock from its page.
          </p>
        )}
        {messages.map((m, i) => {
          const prev = i > 0 ? messages[i - 1] : null;
          const next = i < messages.length - 1 ? messages[i + 1] : null;
          const gap = !prev || Date.parse(m.at) - Date.parse(prev.at) > 20 * 60_000;
          const tight = !!prev && prev.mine === m.mine && !gap;
          const lastOfCluster = !next || next.mine !== m.mine;
          const lastRead = m.mine && !!m.readAt && !messages.slice(i + 1).some((x) => x.mine && x.readAt);
          return (
            <div key={m.id}>
              {gap && (
                <div className="mt-4 mb-0.5 text-center text-[10px] font-medium text-teal-200/50">{timeLabel(m.at)}</div>
              )}
              <div className={`flex ${m.mine ? "justify-end" : "justify-start"} ${tight ? "mt-0.5" : "mt-2.5"}`}>
                <div
                  className={`max-w-[78%] rounded-[18px] px-3.5 py-2 ${
                    m.mine ? "bg-teal-400/[0.16]" : "bg-teal-400/[0.07]"
                  }`}
                >
                  {m.symbol && (
                    <Link
                      href={m.panel ? `/stocks/${m.symbol}#${m.panel}` : `/stocks/${m.symbol}`}
                      className={`group my-0.5 flex min-w-[170px] items-center gap-2 rounded-xl px-2.5 py-1.5 transition-colors ${
                        m.mine ? "bg-teal-400/[0.12] hover:bg-teal-400/20" : "bg-(--card-bg) hover:bg-teal-400/10"
                      }`}
                    >
                      <span className="text-[13px] font-bold text-teal-300 group-hover:underline">{m.symbol}</span>
                      <span className="ml-auto text-[11px] text-teal-200/50">{m.panelLabel ?? "open"} →</span>
                    </Link>
                  )}
                  {m.body && <p className="whitespace-pre-wrap text-[15px] leading-snug text-teal-50">{m.body}</p>}
                </div>
              </div>
              {lastRead && lastOfCluster && (
                <div className="mt-0.5 text-right text-[10px] font-medium text-teal-200/50">read</div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-end gap-2 rounded-[20px] border border-(--card-border) bg-(--card-bg) py-1.5 pr-1.5 pl-3.5">
        <textarea
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 112)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          placeholder={`Message ${otherName}…`}
          disabled={busy}
          className="max-h-28 flex-1 resize-none bg-transparent py-1.5 text-[15px] text-teal-50 outline-none placeholder:text-teal-200/30 disabled:opacity-60"
        />
        <button
          onClick={send}
          disabled={busy || draft.trim().length === 0}
          aria-label="Send"
          className={`mb-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full transition-colors ${
            draft.trim() && !busy ? "bg-teal-400 text-teal-950 hover:bg-teal-300" : "bg-teal-400/15 text-teal-200/40"
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19V5" />
            <path d="m5 12 7-7 7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
