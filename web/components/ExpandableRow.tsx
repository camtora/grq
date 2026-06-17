"use client";

import { useState, type ReactNode, type MouseEvent } from "react";

// Click-to-expand wrapper for a StockTable row (Cam 2026-06-17). The cells and the
// expansion detail are both server-rendered and passed in as props — this only owns
// the open/closed state, so StockTable stays a server component. Clicks on links,
// buttons, inputs, or anything marked [data-no-expand] don't toggle (so the symbol
// link and the Manage actions still work). The detail row carries `stock-row-detail`
// so StockFilters can hide it alongside its parent.
export default function ExpandableRow({
  className,
  data,
  colSpan,
  detail,
  children,
}: {
  className?: string;
  data?: Record<string, string>;
  colSpan: number;
  detail?: ReactNode | null;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const expandable = !!detail;

  const onClick = (e: MouseEvent<HTMLTableRowElement>) => {
    if (!expandable) return;
    if ((e.target as HTMLElement).closest("a,button,input,select,label,[data-no-expand]")) return;
    setOpen((v) => !v);
  };

  return (
    <>
      <tr
        className={`${className ?? ""} ${expandable ? "group cursor-pointer" : ""}`}
        onClick={onClick}
        aria-expanded={expandable ? open : undefined}
        {...data}
      >
        {children}
      </tr>
      {expandable && open && (
        <tr className="stock-row-detail border-t border-teal-400/10 bg-teal-400/[0.02]">
          <td colSpan={colSpan} className="px-4 pb-4 pt-1">
            {detail}
          </td>
        </tr>
      )}
    </>
  );
}
