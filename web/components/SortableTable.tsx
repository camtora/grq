"use client";

import { Fragment, useState, type ReactNode } from "react";

// One client wrapper that makes any server-rendered stock table sortable by clicking
// a column header (Cam 2026-06-23). The rows stay server-rendered — the caller hands
// us each row's <tr> node plus a flat bag of sort values, and we only reorder the
// keyed nodes in React (which moves the existing DOM nodes, so row state and any
// imperative visibility set by StockFilters/WatchlistTabs survive a re-sort).
//
// Clicking a header sorts by it; clicking the active header flips direction. First
// click defaults ascending for text columns, descending for numbers. `nulls` always
// sort last regardless of direction. The header affordance is a role="button" span,
// NOT a <button>, so a <Term> glossary chip (itself a button) can live inside a label
// without nesting buttons — Term stops its own click from bubbling into a sort.
export type SortDir = "asc" | "desc";

export type SortableColumn = {
  key?: string; // key into row.sort; omit → the column isn't sortable (e.g. an actions cell)
  label: ReactNode;
  align?: "left" | "right" | "center"; // default center
  numeric?: boolean; // sort numerically + default desc on first click
};

export type SortableRow = {
  key: string;
  group?: string; // when `groups` is set, rows cluster by this key (a divider sits between clusters)
  sort?: Record<string, string | number | null>;
  node: ReactNode;
};

export default function SortableTable({
  columns,
  rows,
  initialSort = null,
  footer = null,
  className = "w-full text-sm",
  headRowClassName = "text-center text-xs uppercase tracking-wider text-teal-200/40",
  groups,
}: {
  columns: SortableColumn[];
  rows: SortableRow[];
  initialSort?: { key: string; dir: SortDir } | null;
  footer?: ReactNode;
  className?: string;
  headRowClassName?: string;
  // Optional currency-style grouping: rows are partitioned by `row.group` and rendered in
  // this order, each cluster preceded by a labelled divider row (only when 2+ clusters are
  // present, so a single-group table looks unchanged). Sorting still applies WITHIN a cluster.
  groups?: { key: string; label: ReactNode }[];
}) {
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(initialSort);
  const numericByKey = new Map(columns.filter((c) => c.key).map((c) => [c.key as string, !!c.numeric]));

  const ordered = sort
    ? [...rows].sort((a, b) => {
        const av = a.sort?.[sort.key] ?? null;
        const bv = b.sort?.[sort.key] ?? null;
        if (av == null && bv == null) return 0;
        if (av == null) return 1; // nulls last, always
        if (bv == null) return -1;
        const d = numericByKey.get(sort.key) ? Number(av) - Number(bv) : String(av).localeCompare(String(bv));
        return sort.dir === "asc" ? d : -d;
      })
    : rows;

  const renderRow = (r: SortableRow) => <Fragment key={r.key}>{r.node}</Fragment>;

  // Grouped body: keep the sorted order WITHIN each group, lay groups out in `groups`
  // order, and drop a labelled divider before each (only when 2+ groups have rows). Any
  // row whose group isn't listed trails at the end, unlabelled (defensive fallback).
  let body: ReactNode;
  if (groups && groups.length) {
    const present = groups.filter((g) => ordered.some((r) => r.group === g.key));
    const showDividers = present.length > 1;
    const matched = new Set<string>();
    const blocks = groups.map((g) => {
      const gRows = ordered.filter((r) => r.group === g.key);
      if (!gRows.length) return null;
      gRows.forEach((r) => matched.add(r.key));
      return (
        <Fragment key={`grp-${g.key}`}>
          {showDividers && (
            <tr className="border-t border-teal-400/15 bg-teal-400/[0.02]">
              <td
                colSpan={columns.length}
                className="px-5 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-teal-200/40"
              >
                {g.label}
              </td>
            </tr>
          )}
          {gRows.map(renderRow)}
        </Fragment>
      );
    });
    const leftover = ordered.filter((r) => !matched.has(r.key));
    body = (
      <>
        {blocks}
        {leftover.map(renderRow)}
      </>
    );
  } else {
    body = ordered.map(renderRow);
  }

  const toggle = (col: SortableColumn) => {
    if (!col.key) return;
    const key = col.key;
    setSort((prev) =>
      prev?.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: col.numeric ? "desc" : "asc" },
    );
  };

  return (
    <table className={className}>
      <thead>
        <tr className={headRowClassName}>
          {columns.map((col, i) => {
            const active = !!col.key && sort?.key === col.key;
            const alignCls = col.align === "right" ? "text-right" : col.align === "left" ? "text-left" : "text-center";
            const justify = col.align === "right" ? "justify-end" : col.align === "left" ? "justify-start" : "justify-center";
            return (
              <th
                key={i}
                className={`px-4 py-3 ${alignCls}`}
                aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
              >
                {col.key ? (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={() => toggle(col)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggle(col);
                      }
                    }}
                    className={`inline-flex cursor-pointer select-none items-center gap-1 ${justify} ${
                      active ? "text-teal-200" : "hover:text-teal-100/80"
                    }`}
                  >
                    <span>{col.label}</span>
                    <span aria-hidden className={`text-[8px] leading-none ${active ? "opacity-90" : "opacity-30"}`}>
                      {active ? (sort!.dir === "asc" ? "▲" : "▼") : "↕"}
                    </span>
                  </span>
                ) : (
                  col.label
                )}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {body}
        {footer}
      </tbody>
    </table>
  );
}
