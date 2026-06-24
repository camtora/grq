"use client";

import { Fragment, useState, type ReactNode } from "react";

// Client-side kind filter for a stock page's "The record" section. The cards are
// SERVER-rendered (CollapsibleMd/SourceChips and all) and handed in as nodes keyed by
// kind; this just shows the same kind groupings as the Settings Journal (ALL · SYSTEM ·
// RESEARCH · DECISION · TRADE · RETRO · LESSON · NOTE) and toggles visibility — no
// refetch, instant. Only kinds actually present show a chip, each with its count, so a
// name with 20 ATD check-ins is easy to sort past (Cam 2026-06-24).
export type RecordItem = { id: number; kind: string; node: ReactNode };

// Canonical order, mirroring the Settings Journal (JournalKind enum order + NOTE).
const KIND_ORDER = ["SYSTEM", "RESEARCH", "DECISION", "TRADE", "RETRO", "LESSON", "NOTE"];

export default function RecordFilter({ items }: { items: RecordItem[] }) {
  const [kind, setKind] = useState("ALL");

  const counts = new Map<string, number>();
  for (const it of items) counts.set(it.kind, (counts.get(it.kind) ?? 0) + 1);
  const present = KIND_ORDER.filter((k) => counts.has(k));
  const chips = ["ALL", ...present];
  const shown = kind === "ALL" ? items : items.filter((it) => it.kind === kind);

  return (
    <div>
      {/* Only worth a filter row once there's more than one kind to sort between. */}
      {present.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {chips.map((k) => {
            const n = k === "ALL" ? items.length : counts.get(k) ?? 0;
            const active = kind === k;
            return (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                  active ? "bg-teal-400/20 text-teal-200" : "text-teal-200/50 hover:bg-teal-400/10"
                }`}
              >
                {k} <span className="opacity-50">{n}</span>
              </button>
            );
          })}
        </div>
      )}
      <div className="space-y-4">
        {shown.map((it) => (
          <Fragment key={it.id}>{it.node}</Fragment>
        ))}
      </div>
    </div>
  );
}
