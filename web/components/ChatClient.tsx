"use client";

import { useEffect, useRef, useState } from "react";
import Md from "./Md";
import Avatar from "./Avatar";
import { personByName } from "@/lib/people";

type Msg = { id: number | string; email: string; role: string; content: string };

function authorName(email: string): string {
  if (email.startsWith("cameron")) return "Cam";
  if (email.startsWith("g.j.appleby")) return "Graham";
  return email === "agent" ? "GRQ" : email;
}

// A member's headshot for the chat bubble, or null (agent/unknown → initial chip).
function authorPhoto(email: string): string | null {
  if (email === "agent") return null;
  return personByName(authorName(email))?.photo ?? null;
}

export default function ChatClient({
  initialMessages = [],
  symbol,
  heightClass = "h-[calc(100vh-16rem)] min-h-[24rem]",
  selfLoad = false,
  owner,
  meEmail,
}: {
  initialMessages?: Msg[];
  symbol?: string;
  heightClass?: string;
  selfLoad?: boolean;
  owner?: string;
  meEmail?: string;
}) {
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [draft, setDraft] = useState(
    symbol ? `Let's talk about ${symbol}. ` : "",
  );

  useEffect(() => {
    if (!selfLoad) return;
    fetch(owner ? `/api/chat?owner=${encodeURIComponent(owner)}` : "/api/chat")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.messages)) setMessages(d.messages);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selfLoad, owner]);

  useEffect(() => {
    if (symbol) setDraft((d) => (d === "" || d.startsWith("Let's talk about") ? `Let's talk about ${symbol}. ` : d));
  }, [symbol]);
  const [pending, setPending] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending, status]);

  async function send() {
    const message = draft.trim();
    if (!message || busy) return;
    setDraft("");
    setBusy(true);
    setPending("");
    setStatus(null);
    setMessages((m) => [...m, { id: `u-${Date.now()}`, email: "me", role: "user", content: message }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, symbol, owner }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.type === "text") {
              acc += (acc ? "\n\n" : "") + ev.text;
              setPending(acc);
              setStatus(null);
            } else if (ev.type === "status") {
              setStatus(ev.text);
            } else if (ev.type === "error") {
              setStatus(`⚠️ ${ev.text}`);
            }
          } catch {
            /* partial frame */
          }
        }
      }
      if (acc) {
        setMessages((m) => [...m, { id: `a-${Date.now()}`, email: "agent", role: "assistant", content: acc }]);
      }
    } catch (e) {
      setMessages((m) => [
        ...m,
        {
          id: `e-${Date.now()}`,
          email: "agent",
          role: "assistant",
          content: `⚠️ Chat failed: ${e instanceof Error ? e.message : String(e)}`,
        },
      ]);
    } finally {
      setPending(null);
      setStatus(null);
      setBusy(false);
    }
  }

  return (
    <div className={`flex flex-col ${heightClass}`}>
      <div className="flex-1 space-y-4 overflow-y-auto pr-1">
        {messages.length === 0 && !pending && (
          <p className="pt-10 text-center text-sm text-teal-200/40">
            Ask the agent anything — stocks, the portfolio, &ldquo;defend this position&rdquo;.
            It can read everything and trade nothing.
          </p>
        )}
        {messages.map((m) => {
          const srcEmail = m.email === "me" ? meEmail ?? "" : m.email;
          const isMe = m.email === "me" || (!!meEmail && m.email === meEmail);
          const who = authorName(srcEmail);
          return (
            <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={`max-w-[85%] rounded-2xl border p-4 ${
                  m.role === "user"
                    ? "border-teal-400/25 bg-teal-400/10"
                    : "border-teal-400/15 bg-teal-400/[0.04]"
                }`}
              >
                <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-teal-200/40">
                  <Avatar src={authorPhoto(srcEmail)} name={who} size="h-5 w-5" />
                  {isMe ? "You" : who}
                </div>
                <Md text={m.content} />
              </div>
            </div>
          );
        })}
        {pending !== null && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl border border-teal-400/15 bg-teal-400/[0.04] p-4">
              <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-teal-200/40">
                <Avatar src={null} name="GRQ" size="h-5 w-5" />
                GRQ
              </div>
              {pending ? <Md text={pending} /> : <span className="text-sm text-teal-200/40">thinking…</span>}
              {status && <div className="mt-2 text-xs italic text-teal-300/60">{status}</div>}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="mt-4 flex items-end gap-2">
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
          placeholder={busy ? "GRQ is thinking…" : "Message the agent (Enter to send)"}
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
