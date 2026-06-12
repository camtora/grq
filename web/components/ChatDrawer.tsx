"use client";

import { useEffect, useState } from "react";
import ChatClient from "./ChatClient";

/** Slide-out chat drawer (right side, ~1/3 width, overlays content).
 *  Open it from anywhere: window.dispatchEvent(new CustomEvent("grq:chat",
 *  { detail: { symbol?: "RY" } })). Escape or ✕ closes. Stays mounted after
 *  first open so the conversation survives open/close. */
export default function ChatDrawer() {
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const [symbol, setSymbol] = useState<string | undefined>(undefined);

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

  return (
    <aside
      className={`fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-teal-400/20 shadow-2xl transition-transform duration-300 sm:w-[440px] lg:w-[33vw] lg:max-w-[620px] ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
      style={{ background: "var(--body-bg)" }}
      aria-hidden={!open}
    >
      <div className="flex items-center gap-3 border-b border-teal-400/15 px-5 py-3">
        <span className="bg-gradient-to-r from-teal-300 to-teal-500 bg-clip-text font-black tracking-tight text-transparent">
          GRQ
        </span>
        <span className="text-sm font-semibold text-teal-50">Chat</span>
        {symbol && (
          <span className="rounded-full border border-teal-400/20 bg-teal-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-teal-300">
            discussing {symbol}
          </span>
        )}
        <span className="ml-auto text-[10px] uppercase tracking-wider text-teal-200/30">
          reads everything · trades nothing
        </span>
        <button
          onClick={() => setOpen(false)}
          aria-label="Close chat"
          className="rounded-lg border border-teal-400/20 px-2 py-0.5 text-sm text-teal-200/60 hover:bg-teal-400/10"
        >
          ✕
        </button>
      </div>
      <div className="min-h-0 flex-1 px-5 py-4">
        {everOpened && <ChatClient selfLoad symbol={symbol} heightClass="h-full" />}
      </div>
    </aside>
  );
}
