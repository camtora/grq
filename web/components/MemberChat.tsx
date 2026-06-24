"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Avatar from "./Avatar";
import { personByName } from "@/lib/people";

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

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
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

  return (
    <div className={`flex flex-col ${heightClass}`}>
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto pr-1">
        {loaded && messages.length === 0 && (
          <p className="pt-10 text-center text-sm text-teal-200/40">
            No messages yet. Say hi, or share a stock from its page.
          </p>
        )}
        {messages.map((m) => {
          const photo = personByName(m.fromName)?.photo ?? null;
          return (
            <div key={m.id} className={m.mine ? "flex justify-end" : "flex justify-start"}>
              <div
                className={`max-w-[85%] rounded-2xl border p-3 ${
                  m.mine ? "border-teal-400/25 bg-teal-400/10" : "border-teal-400/15 bg-teal-400/[0.04]"
                }`}
              >
                <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-teal-200/40">
                  <Avatar src={photo} name={m.fromName} size="h-5 w-5" />
                  {m.mine ? "You" : m.fromName}
                  <span className="ml-1 font-normal tracking-normal text-teal-200/30">{timeLabel(m.at)}</span>
                </div>
                {m.symbol && (
                  <Link
                    href={m.panel ? `/stocks/${m.symbol}#${m.panel}` : `/stocks/${m.symbol}`}
                    className="mb-1.5 flex items-center gap-2 rounded-lg border border-teal-400/20 bg-teal-400/[0.06] px-2.5 py-1.5 transition-colors hover:bg-teal-400/15"
                  >
                    <span className="rounded bg-teal-400/15 px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-teal-200">{m.symbol}</span>
                    <span className="text-xs text-teal-200/70">{m.panelLabel ?? "Shared a stock"} →</span>
                  </Link>
                )}
                {m.body && <p className="whitespace-pre-wrap text-sm text-teal-50">{m.body}</p>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          placeholder={`Message ${otherName} (Enter to send)`}
          disabled={busy}
          className="flex-1 resize-none rounded-xl border border-teal-400/20 bg-(--field-bg) px-3 py-2.5 text-sm text-teal-50 outline-none placeholder:text-teal-200/30 disabled:opacity-60"
        />
        <button
          onClick={send}
          disabled={busy || draft.trim().length === 0}
          className="rounded-xl border border-teal-400/40 bg-teal-400/15 px-5 py-2.5 text-sm font-bold uppercase tracking-wider text-teal-200 hover:bg-teal-400/25 disabled:opacity-40"
        >
          {busy ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}
