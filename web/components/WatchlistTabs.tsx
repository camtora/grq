"use client";

import { useEffect, useState } from "react";
import type { OwnerKey } from "@/lib/people";

// Owner tabs for the Watchlist. The table is server-rendered and each <tr> carries
// data-owner (cam | graham | agent — anything not tagged to a member is "agent");
// this toggles row visibility, same cheap no-refetch trick as StockFilters. Opens on
// the current member's OWN names by default (`defaultTab` from the server — Cam
// 2026-06-25); falls back to "all" for viewers or an empty personal list.
type Tab = { value: "all" | OwnerKey; label: string };

const TABS: Tab[] = [
  { value: "all", label: "All" },
  { value: "graham", label: "Graham" },
  { value: "cam", label: "Cam" },
  { value: "agent", label: "Agent" },
];

export default function WatchlistTabs({
  counts,
  defaultTab = "all",
}: {
  counts: Record<"all" | OwnerKey, number>;
  defaultTab?: "all" | OwnerKey;
}) {
  const [tab, setTab] = useState<Tab["value"]>(defaultTab);

  useEffect(() => {
    const rows = Array.from(document.querySelectorAll<HTMLElement>("tr.stock-row"));
    for (const row of rows) {
      const ok = tab === "all" || row.dataset.owner === tab;
      row.hidden = !ok;
      // Keep an open expansion row in lockstep with its parent (it's the next sibling).
      const detail = row.nextElementSibling;
      if (detail instanceof HTMLElement && detail.classList.contains("stock-row-detail")) detail.hidden = !ok;
    }
  }, [tab]);

  return (
    <div className="inline-flex flex-wrap gap-1 rounded-2xl border border-teal-400/10 bg-teal-400/[0.02] p-1">
      {TABS.map((t) => {
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
            <span className={`ml-1.5 text-xs tabular-nums ${active ? "text-teal-200/70" : "text-teal-200/30"}`}>{counts[t.value]}</span>
          </button>
        );
      })}
    </div>
  );
}
