"use client";

import { useEffect, useState } from "react";
import MemberChat from "./MemberChat";

/** Right-side slide-out for the Cam↔Graham direct messages (D63). Opened from the
 *  header messages bubble:  window.dispatchEvent(new Event("grq:messages")). Escape or
 *  ✕ closes. Stays mounted after the first open so the thread keeps its scroll + draft.
 *  Member↔member only — the agent chat lives in its own floating bubble (<GrqChat>). */
export default function MessagesDrawer() {
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);

  useEffect(() => {
    function onOpen() {
      setOpen(true);
      setEverOpened(true);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("grq:messages", onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("grq:messages", onOpen);
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
          Messages
        </span>
        <button
          onClick={() => setOpen(false)}
          aria-label="Close messages"
          className="ml-auto rounded-lg border border-teal-400/20 px-2 py-0.5 text-sm text-teal-200/60 hover:bg-teal-400/10"
        >
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 px-5 py-4">{everOpened && <MemberChat active={open} heightClass="h-full" />}</div>
    </aside>
  );
}
