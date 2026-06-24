"use client";

import { useEffect, useState } from "react";
import RefreshHuntButton from "@/components/RefreshHuntButton";
import { LiveQuotesProvider } from "@/components/LiveQuotes";
import HuntRow, { type HuntFind } from "@/components/hunt/HuntRow";
import HuntHero from "@/components/hunt/HuntHero";
import HuntGridCard from "@/components/hunt/HuntGridCard";
import ScannerTable from "@/components/hunt/ScannerTable";

// The three Hunt layouts behind a persisted view switcher (Heat Board / Top Pick /
// Scanner). Client component: it owns the chosen view (localStorage) and renders the
// matching layout — chrome + data + scroll position persist across a switch (no nav).
type View = "A" | "B" | "C";
const STORE = "grq-hunt-view";

const HEAT_TIP =
  "Heat = GRQ's 0–100 'ready to pop' read: the agent's conviction, recent 30-day momentum, and how under-the-radar the name is — derived, not a promise.";

const TABS: { id: View; label: string }[] = [
  { id: "A", label: "⚡ Heat Board" },
  { id: "B", label: "★ Top Pick" },
  { id: "C", label: "▤ Scanner" },
];

export default function HuntResults({ finds, isMember, toName }: { finds: HuntFind[]; isMember: boolean; toName: string | null }) {
  const [view, setView] = useState<View>("A");

  // Restore the saved view after mount (avoids an SSR/CSR mismatch — SSR is always A).
  useEffect(() => {
    const saved = localStorage.getItem(STORE);
    if (saved === "A" || saved === "B" || saved === "C") setView(saved);
  }, []);

  function pick(v: View) {
    setView(v);
    try {
      localStorage.setItem(STORE, v);
    } catch {
      /* ignore */
    }
  }

  return (
    <LiveQuotesProvider symbols={finds.map((f) => f.sym)}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {/* segmented switcher */}
        <div className="flex gap-1 rounded-xl border border-[color:var(--card-border)] bg-[var(--field-bg)] p-1">
          {TABS.map((t) => {
            const on = view === t.id;
            return (
              <button
                key={t.id}
                onClick={() => pick(t.id)}
                aria-pressed={on}
                className={`rounded-lg px-3.5 py-2 text-[13px] font-semibold whitespace-nowrap transition-colors ${
                  on ? "border border-teal-400/50 bg-teal-400/15 text-teal-200" : "border border-transparent text-teal-200/50 hover:text-teal-200/80"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        {/* count + sort + refresh */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-teal-200/50">
          <span>
            <b className="font-mono text-teal-100">{finds.length}</b> hot {finds.length === 1 ? "name" : "names"} · sorted by{" "}
            <span className="cursor-help font-semibold text-teal-300 underline decoration-dotted underline-offset-2" title={HEAT_TIP}>
              HEAT
            </span>
          </span>
          {isMember && <RefreshHuntButton />}
        </div>
      </div>

      {view === "A" && (
        <section className="flex flex-col gap-3.5">
          {finds.map((f) => (
            <HuntRow key={f.sym} find={f} isMember={isMember} toName={toName} />
          ))}
        </section>
      )}

      {view === "B" && (
        <section>
          <HuntHero find={finds[0]} isMember={isMember} toName={toName} />
          {finds.length > 1 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {finds.slice(1).map((f) => (
                <HuntGridCard key={f.sym} find={f} isMember={isMember} toName={toName} />
              ))}
            </div>
          )}
        </section>
      )}

      {view === "C" && <ScannerTable finds={finds} isMember={isMember} toName={toName} />}
    </LiveQuotesProvider>
  );
}
