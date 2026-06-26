"use client";

import { useEffect, useState } from "react";
import ChatClient from "./ChatClient";
import StockSearch from "./StockSearch";

/** The "Ask GRQ" floating chat — a bubble pinned to the bottom-right of every page
 *  (members only). Click it to open the read-only agent chat in a floating panel;
 *  click again (or ✕ / Escape) to close. It stays mounted after the first open so the
 *  thread keeps its scroll + draft. Stock pages open it pre-aimed at a symbol via
 *    window.dispatchEvent(new CustomEvent("grq:chat", { detail: { symbol: "RY" } }))
 *  This is separate from the member↔member Messages drawer (the header bubble). */
export default function GrqChat({
  meEmail,
  members,
}: {
  meEmail: string;
  members: { email: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [symbol, setSymbol] = useState<string | undefined>(undefined);

  // Whose agent thread: yours first, then the other member's.
  const inList = members.some((m) => m.email === meEmail);
  const threads = inList
    ? [...members.filter((m) => m.email === meEmail), ...members.filter((m) => m.email !== meEmail)]
    : [{ email: meEmail, name: "You" }, ...members];
  const [activeOwner, setActiveOwner] = useState(meEmail);

  useEffect(() => {
    function onChat(e: Event) {
      const detail = (e as CustomEvent).detail as { symbol?: string } | undefined;
      if (detail?.symbol) setSymbol(detail.symbol.toUpperCase());
      setOpen(true);
      setEverOpened(true);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("grq:chat", onChat);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("grq:chat", onChat);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  function toggle() {
    setEverOpened(true);
    setOpen((o) => !o);
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3">
      {everOpened && (
        <section
          className={`flex flex-col overflow-hidden rounded-2xl border border-teal-400/20 shadow-2xl transition-all duration-200 ${
            open ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
          }`}
          style={{
            background: "var(--body-bg)",
            width: expanded ? "min(58rem, calc(100vw - 2.5rem))" : "min(34rem, calc(100vw - 2.5rem))",
            // Open all the way up to just below the sticky header: 100vh minus the launcher
            // stack at the bottom (bottom-5 1.25 + button 3.5 + gap 0.75 = 5.5rem) and the
            // header up top (~3.5rem nav + a 1.25rem gap matching the right/bottom margins).
            height: "calc(100vh - 10.25rem)",
          }}
          aria-hidden={!open}
        >
          <header className="flex items-center gap-2 border-b border-teal-400/15 px-4 py-3">
            <span className="bg-gradient-to-r from-teal-300 to-teal-500 bg-clip-text font-black tracking-tight text-transparent">
              Ask GRQ
            </span>
            {symbol && (
              <span className="rounded-full border border-teal-400/20 bg-teal-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-teal-300">
                {symbol}
              </span>
            )}
            <div className="ml-auto flex items-center gap-1.5">
              <button
                onClick={() => setExpanded((x) => !x)}
                aria-label={expanded ? "Shrink chat" : "Expand chat"}
                title={expanded ? "Shrink" : "Expand"}
                className="rounded-lg border border-teal-400/20 p-1.5 text-teal-200/60 hover:bg-teal-400/10"
              >
                {expanded ? (
                  // minimize-2
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <polyline points="4 14 10 14 10 20" />
                    <polyline points="20 10 14 10 14 4" />
                    <line x1="14" y1="10" x2="21" y2="3" />
                    <line x1="3" y1="21" x2="10" y2="14" />
                  </svg>
                ) : (
                  // maximize-2
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <polyline points="15 3 21 3 21 9" />
                    <polyline points="9 21 3 21 3 15" />
                    <line x1="21" y1="3" x2="14" y2="10" />
                    <line x1="3" y1="21" x2="10" y2="14" />
                  </svg>
                )}
              </button>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                className="rounded-lg border border-teal-400/20 px-2 py-1 text-sm text-teal-200/60 hover:bg-teal-400/10"
              >
                ✕
              </button>
            </div>
          </header>

          {/* Whose agent thread + the read-only reminder. */}
          <div className="flex items-center gap-3 border-b border-teal-400/10 px-4 py-2">
            {threads.length > 1 && (
              <div className="flex items-center gap-0.5 rounded-lg border border-teal-400/15 p-0.5">
                {threads.map((m) => (
                  <button
                    key={m.email}
                    onClick={() => setActiveOwner(m.email)}
                    title={m.email === meEmail ? "Your chat" : `${m.name}'s chat`}
                    className={`rounded-md px-2 py-0.5 text-xs font-semibold transition-colors ${
                      activeOwner === m.email ? "bg-teal-400/20 text-teal-200" : "text-teal-200/50 hover:bg-teal-400/10"
                    }`}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            )}
            <span className="ml-auto text-[10px] uppercase tracking-wider text-teal-200/30">reads everything · trades nothing</span>
          </div>

          <div className="min-h-0 flex-1 px-4 py-3">
            <ChatClient
              key={activeOwner}
              selfLoad
              owner={activeOwner}
              meEmail={meEmail}
              symbol={symbol}
              heightClass="h-full"
              active={open}
            />
          </div>
        </section>
      )}

      {/* Jump-to-stock search — sits just above the Ask-GRQ bull. Hidden while the
          chat is open so it never overlaps the chat panel; the flex column gives it
          the same gap as the panel↔bull spacing. */}
      {!open && <StockSearch />}

      <button
        onClick={toggle}
        aria-label={open ? "Close GRQ chat" : "Ask GRQ"}
        title="Ask GRQ"
        className="flex h-14 w-14 items-center justify-center rounded-full border border-teal-300/40 bg-slate-900 text-teal-300 shadow-xl shadow-teal-500/30 transition-transform hover:scale-105 active:scale-95"
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M6 9l6 6 6-6" />
          </svg>
        ) : (
          // The GRQ bull — "talk to the agent".
          <img src="/bull-splash.png" alt="" aria-hidden className="h-9 w-9 select-none object-contain" />
        )}
      </button>
    </div>
  );
}
