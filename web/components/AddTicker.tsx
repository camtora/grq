"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FmpMatch } from "@/lib/fmp";

// Research search bar: type a name or ticker → pick the right listing (e.g.
// ANET on NYSE vs another exchange) instead of guessing → add it as a candidate.
export default function AddTicker() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [matches, setMatches] = useState<FmpMatch[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function search() {
    const query = q.trim();
    if (!query || searching) return;
    setSearching(true);
    setMsg(null);
    setMatches(null);
    try {
      const r = await fetch(`/api/symbol-search?q=${encodeURIComponent(query)}`);
      const d = await r.json();
      setMatches(Array.isArray(d.matches) ? d.matches : []);
      if (d.note) setMsg({ ok: false, text: d.note });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSearching(false);
    }
  }

  async function add(m: FmpMatch) {
    if (adding) return;
    setAdding(m.symbol);
    setMsg(null);
    try {
      // Send the listing the user actually picked (exchange + currency), so the
      // server stores THAT listing — not a ".TO" guess or a colliding CDR (D24).
      const res = await fetch("/api/universe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "add", symbol: m.symbol, exchange: m.exchange, currency: m.currency, name: m.name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ ok: false, text: data.error ?? `HTTP ${res.status}` });
      } else {
        setMsg({ ok: true, text: `${data.symbol ?? m.symbol} is on your watchlist (${data.yahoo ?? m.symbol}) — the agent's dossiering it now.` });
        setMatches(null);
        setQ("");
        router.refresh();
      }
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setAdding(null);
    }
  }

  // Dismiss the results overlay without adding — clears the dropdown, the bar, and any note.
  function clear() {
    setMatches(null);
    setQ("");
    setMsg(null);
  }

  return (
    // relative + inline-block: the results float in an absolutely-positioned overlay anchored to
    // this box, so they lay OVER the page instead of pushing it down (Cam 2026-07-02).
    <div className="relative inline-block">
      {/* As present as the watchlist cards themselves — solid card bg + the card border
          (was near-invisible teal/[0.02] · Cam 2026-06-26). */}
      <div className="inline-flex items-center gap-1 rounded-2xl border border-[color:var(--card-border)] bg-[var(--card-bg)] p-1">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="find a stock"
          aria-label="Find a stock"
          className="w-52 rounded-xl bg-transparent px-3 py-1.5 text-sm text-teal-50 outline-none placeholder:text-teal-200/50 focus:bg-teal-400/10"
        />
        <button
          onClick={search}
          disabled={searching || !q.trim()}
          className="rounded-xl px-3 py-1.5 text-sm font-semibold text-teal-200/80 transition-colors hover:text-teal-100 disabled:opacity-40"
        >
          {searching ? "searching…" : "Search"}
        </button>
      </div>

      {/* Results overlay — floats over the page (does not reflow it). */}
      {matches && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-teal-400/20 bg-[var(--card-bg)] shadow-xl shadow-black/40">
          <div className="flex items-center justify-between border-b border-teal-400/10 px-3 py-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-teal-200/45">
              {matches.length > 0 ? `${matches.length} match${matches.length === 1 ? "" : "es"} — pick a listing` : "No matches"}
            </span>
            <button
              onClick={clear}
              aria-label="Close results"
              className="-mr-1 rounded-md px-1.5 py-0.5 text-teal-200/50 transition-colors hover:bg-teal-400/10 hover:text-teal-100"
            >
              ✕
            </button>
          </div>
          {matches.length > 0 ? (
            <div className="max-h-72 divide-y divide-teal-400/10 overflow-y-auto">
              {matches.map((m) => (
                <div key={`${m.symbol}-${m.exchange}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                  <span className="font-bold text-teal-200">{m.symbol}</span>
                  <span className="min-w-0 flex-1 truncate text-teal-100/70">{m.name}</span>
                  <span className="rounded-full border border-teal-400/15 bg-teal-400/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-teal-200/60">
                    {m.exchange}
                    {m.currency ? ` · ${m.currency}` : ""}
                  </span>
                  <button
                    onClick={() => add(m)}
                    disabled={adding !== null}
                    className="rounded-lg border border-teal-400/40 bg-teal-400/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-teal-200 hover:bg-teal-400/20 disabled:opacity-40"
                  >
                    {adding === m.symbol ? "adding…" : "Add"}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            !searching && <div className="px-3 py-2.5 text-sm text-teal-200/40">Try the company name or a different ticker.</div>
          )}
        </div>
      )}

      {/* Status (add confirmation / error) — also an overlay so it never reflows the page.
          Hidden while the results dropdown is up. */}
      {msg && !matches && (
        <div
          className={`absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border bg-[var(--card-bg)] px-3 py-2 text-sm shadow-xl shadow-black/40 ${
            msg.ok ? "border-emerald-400/30 text-emerald-300" : "border-red-400/30 text-red-300"
          }`}
        >
          {msg.text}
        </div>
      )}
    </div>
  );
}
