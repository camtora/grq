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
}: {
  columns: SortableColumn[];
  rows: SortableRow[];
  initialSort?: { key: string; dir: SortDir } | null;
  footer?: ReactNode;
  className?: string;
  headRowClassName?: string;
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
        {ordered.map((r) => (
          <Fragment key={r.key}>{r.node}</Fragment>
        ))}
        {footer}
      </tbody>
    </table>
  );
}
