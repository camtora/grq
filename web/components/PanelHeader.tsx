import React from "react";

// Stock-page panel header: the title (left) + an honest FRESHNESS badge (top-right).
// `live` → the pulsing emerald dot + "live" for panels pulled fresh from FMP on every
// page load; otherwise `fresh` is a muted cadence label (e.g. "~90 min", "history",
// "daily", "researched 3d ago") so EVERY panel states how current it is — without
// faking "live" on research-gated or historical data. The badge sits top-right so the
// freshness read is consistent across the page. docs/DATA-SOURCES.md → "Data freshness".
export default function PanelHeader({
  children,
  live = false,
  fresh,
  freshTitle,
}: {
  children: React.ReactNode;
  live?: boolean;
  fresh?: string;
  freshTitle?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-teal-200/50">{children}</h2>
      {(live || fresh) && (
        <span
          title={freshTitle ?? (live ? "Live — pulled fresh from the market-data feed each time you open this page" : undefined)}
          className={`mt-px inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider ${live ? "text-emerald-400/80" : "text-teal-200/35"}`}
        >
          {live && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />}
          {live ? "live" : fresh}
        </span>
      )}
    </div>
  );
}
