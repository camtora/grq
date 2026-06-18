"use client";

import { useState, type ReactNode } from "react";

// Two views on /universe: the tradeable Universe (default) and a Researched
// catalogue of every name with a dossier (Cam 2026-06-18). Only the active tab's
// content is mounted, so the Universe-only <StockFilters> never touches Researched
// rows. Each slot is server-rendered and passed in as a prop.
type Tab = "universe" | "researched";

export default function UniverseTabs({
  universe,
  researched,
  universeCount,
  researchedCount,
}: {
  universe: ReactNode;
  researched: ReactNode;
  universeCount: number;
  researchedCount: number;
}) {
  const [tab, setTab] = useState<Tab>("universe");
  const tabs: { value: Tab; label: string; count: number }[] = [
    { value: "universe", label: "Universe", count: universeCount },
    { value: "researched", label: "Researched", count: researchedCount },
  ];
  return (
    <>
      <div className="mb-4 inline-flex flex-wrap gap-1 rounded-2xl border border-teal-400/10 bg-teal-400/[0.02] p-1">
        {tabs.map((t) => {
          const active = tab === t.value;
          return (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              aria-pressed={active}
              className={`rounded-xl px-3 py-1.5 text-sm font-semibold transition-colors ${
                active ? "bg-teal-400/20 text-teal-100" : "text-teal-200/50 hover:text-teal-100"
              }`}
            >
              {t.label}
              <span className={`ml-1.5 text-xs tabular-nums ${active ? "text-teal-200/70" : "text-teal-200/30"}`}>{t.count}</span>
            </button>
          );
        })}
      </div>
      {tab === "universe" ? universe : researched}
    </>
  );
}
