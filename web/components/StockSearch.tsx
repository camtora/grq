"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { StockIndexItem } from "@/app/api/stock-index/route";

// Floating jump-to-stock search — a round search-icon button stacked just above
// the Ask-GRQ bull (rendered inside that launcher stack). Click it to open a
// popover: type a ticker or name and the list hones in on names we ALREADY hold
// information on — universe, watchlist, researched finds, retired history — and
// Enter opens that stock page. It is NOT the whole-market search (that's Browse);
// it's fast, local, quota-free navigation. The full index loads once (on first
// open) and filters in the browser. With no query it shows the most-recently-
// accessed names (by anyone).

const KIND: Record<StockIndexItem["kind"], { label: string; cls: string }> = {
  active: { label: "Active", cls: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300/80" },
  watching: { label: "Watching", cls: "border-teal-400/30 bg-teal-400/10 text-teal-300/80" },
  researched: { label: "Researched", cls: "border-sky-400/30 bg-sky-400/10 text-sky-300/80" },
  retired: { label: "Retired", cls: "border-slate-400/25 bg-slate-400/10 text-slate-300/70" },
  screened: { label: "Screened", cls: "border-teal-400/15 bg-teal-400/[0.04] text-teal-200/45" },
};

// Higher = surfaces first when match quality and recency are otherwise a tie.
// Screened (the whole-market first-pass layer) ranks below our curated coverage.
const KIND_RANK: Record<StockIndexItem["kind"], number> = { active: 4, watching: 3, researched: 2, retired: 1, screened: 0 };

const MAX_RESULTS = 8;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Score a name against an upper-cased query. -1 = no match. Symbol matches beat
// name matches; prefix beats substring; a shorter symbol beats a longer one.
function score(item: StockIndexItem, q: string): number {
  const sym = item.symbol.toUpperCase();
  const name = item.name.toUpperCase();
  if (sym === q) return 1000;
  if (sym.startsWith(q)) return 900 - Math.min(sym.length, 50);
  if (name.startsWith(q)) return 700;
  if (new RegExp(`\\b${escapeRegExp(q)}`).test(name)) return 600;
  if (sym.includes(q)) return 500;
  if (name.includes(q)) return 400;
  return -1;
}

export default function StockSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [index, setIndex] = useState<StockIndexItem[] | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Lazily load the index once, the first time the popover opens.
  const ensureIndex = useCallback(async () => {
    if (index) return;
    try {
      const r = await fetch("/api/stock-index", { cache: "no-store" });
      if (!r.ok) return;
      const d = await r.json();
      if (Array.isArray(d.stocks)) setIndex(d.stocks);
    } catch {
      /* offline / transient — the field just stays empty */
    }
  }, [index]);

  const results = useMemo(() => {
    if (!index) return [];
    const q = query.trim().toUpperCase();
    // No query → the most-recently-accessed names (by anyone), already sorted
    // recency-first by the API.
    if (!q) return index.slice(0, MAX_RESULTS);
    // Typed → relevance first (so Enter lands on the ticker you typed), recency
    // next, then live-before-retired. Retired matches sink below any live match
    // but still appear, so they're "sorted properly" rather than hidden.
    return index
      .map((item) => ({ item, s: score(item, q) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => {
        const ra = a.item.kind === "retired" ? 1 : 0;
        const rb = b.item.kind === "retired" ? 1 : 0;
        return (
          ra - rb ||
          b.s - a.s ||
          b.item.seenAt - a.item.seenAt ||
          KIND_RANK[b.item.kind] - KIND_RANK[a.item.kind] ||
          a.item.symbol.localeCompare(b.item.symbol)
        );
      })
      .slice(0, MAX_RESULTS)
      .map((x) => x.item);
  }, [query, index]);

  // Keep the highlight in range as the result set changes.
  useEffect(() => {
    setActive(0);
  }, [query]);

  // On open: load the index and focus the field. On close: reset the query.
  useEffect(() => {
    if (open) {
      ensureIndex();
      inputRef.current?.focus();
    } else {
      setQuery("");
    }
  }, [open, ensureIndex]);

  // Close on outside-click.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function go(item: StockIndexItem) {
    setOpen(false);
    setQuery("");
    router.push(`/stocks/${encodeURIComponent(item.symbol)}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const pick = results[active] ?? results[0];
      if (pick) {
        e.preventDefault();
        go(pick);
      }
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      {open && (
        <div
          className="absolute bottom-full right-0 mb-3 w-72 max-w-[calc(100vw-2.5rem)] overflow-hidden rounded-2xl border border-teal-400/20 shadow-2xl"
          style={{ background: "var(--body-bg)" }}
        >
          <div className="border-b border-teal-400/15 p-2">
            <div className="relative">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-teal-200/40"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                placeholder="Ticker or company"
                aria-label="Search stocks in our universe, watchlist, and research"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setQuery(e.target.value.toUpperCase())}
                onKeyDown={onKeyDown}
                className="w-full rounded-lg border border-teal-400/20 bg-teal-400/5 py-1.5 pl-8 pr-2 text-sm uppercase tracking-wide text-teal-100 placeholder:tracking-normal placeholder:text-teal-200/40 focus:border-teal-400/40 focus:outline-none"
              />
            </div>
          </div>

          {results.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-teal-200/45">
              {index === null ? (
                "Loading…"
              ) : query.trim() ? (
                <>
                  No match in our coverage.{" "}
                  <Link href="/market/browse" onClick={() => setOpen(false)} className="text-teal-300 hover:underline">
                    Browse the market →
                  </Link>
                </>
              ) : (
                "Type a ticker or company name."
              )}
            </div>
          ) : (
            <>
              {!query.trim() && (
                <div className="px-3 pb-1 pt-2 text-[10px] uppercase tracking-wider text-teal-200/35">Recently viewed</div>
              )}
              <ul className="max-h-[20rem] overflow-y-auto pb-1">
                {results.map((item, i) => {
                  const k = KIND[item.kind];
                  return (
                    <li key={item.symbol}>
                      <button
                        type="button"
                        onMouseEnter={() => setActive(i)}
                        onClick={() => go(item)}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors ${
                          i === active ? "bg-teal-400/10" : "hover:bg-teal-400/[0.06]"
                        }`}
                      >
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-teal-50">{item.symbol}</span>
                        <span className="min-w-0 flex-1 truncate text-xs text-teal-200/55">{item.name}</span>
                        <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${k.cls}`}>
                          {k.label}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close stock search" : "Search stocks"}
        title="Search stocks"
        className="flex h-14 w-14 items-center justify-center rounded-full border border-teal-300/40 bg-slate-900 text-teal-300 shadow-xl shadow-teal-500/30 transition-transform hover:scale-105 active:scale-95"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </button>
    </div>
  );
}
