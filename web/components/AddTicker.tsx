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

  return (
    <div>
      {/* Compact pill group matching the watchlist owner tabs (All/Graham/Cam/Agent) — Cam 2026-06-18. */}
      <div className="inline-flex items-center gap-1 rounded-2xl border border-teal-400/10 bg-teal-400/[0.02] p-1">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="watch a stock — name or ticker"
          aria-label="Watch a new stock"
          className="w-52 rounded-xl bg-transparent px-3 py-1.5 text-sm text-teal-50 outline-none placeholder:text-teal-200/30 focus:bg-teal-400/5"
        />
        <button
          onClick={search}
          disabled={searching || !q.trim()}
          className="rounded-xl px-3 py-1.5 text-sm font-semibold text-teal-200/60 transition-colors hover:text-teal-100 disabled:opacity-40"
        >
          {searching ? "searching…" : "Search"}
        </button>
      </div>

      {matches && matches.length > 0 && (
        <div className="mt-3 divide-y divide-teal-400/10 overflow-hidden rounded-xl border border-teal-400/15">
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
      )}
      {matches && matches.length === 0 && !searching && (
        <div className="mt-2 text-sm text-teal-200/40">No matches — try the company name or a different ticker.</div>
      )}
      {msg && <div className={`mt-2 text-sm ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</div>}
    </div>
  );
}
