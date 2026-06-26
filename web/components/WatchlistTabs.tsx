"use client";

import { useEffect, useState } from "react";

// Member tabs for the Watchlist (D-watch). The table is server-rendered and each
// <tr> carries data-owners — a comma-joined list of the member keys watching that
// name — so a stock both members watch shows under Cam AND Graham. This toggles row
// visibility (the cheap no-refetch trick from StockFilters). Opens on the current
// member's OWN watches by default (`defaultTab` from the server); falls back to "all"
// for viewers or an empty personal list. The agent isn't a watcher, so there's no
// Agent tab — unwatched names live on the Universe / Hunt / Browse pages.
type TabValue = "all" | "cam" | "graham";

const TABS: { value: TabValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: "cam", label: "Cam" },
  { value: "graham", label: "Graham" },
];

export default function WatchlistTabs({
  counts,
  defaultTab = "all",
}: {
  counts: Record<TabValue, number>;
  defaultTab?: TabValue;
}) {
  const [tab, setTab] = useState<TabValue>(defaultTab);

  useEffect(() => {
    const rows = Array.from(document.querySelectorAll<HTMLElement>("tr.stock-row"));
    for (const row of rows) {
      const owners = (row.dataset.owners ?? "").split(",").filter(Boolean);
      const ok = tab === "all" || owners.includes(tab);
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
