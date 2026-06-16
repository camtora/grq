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

  async function add(symbol: string) {
    if (adding) return;
    setAdding(symbol);
    setMsg(null);
    try {
      const res = await fetch("/api/universe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "add", symbol }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ ok: false, text: data.error ?? `HTTP ${res.status}` });
      } else {
        setMsg({ ok: true, text: `${symbol} is on your watchlist (${data.yahoo ?? symbol}) — the agent's dossiering it now.` });
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
    <div className="rounded-2xl border border-dashed border-teal-400/20 bg-teal-400/[0.02] p-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-sm font-semibold uppercase tracking-wider text-teal-200/50">Watch a new stock</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="name or ticker — e.g. ANET, Shopify"
          className="w-56 rounded-lg border border-teal-400/20 bg-(--field-bg) px-2.5 py-2 text-sm text-teal-50 outline-none placeholder:text-teal-200/30"
        />
        <button
          onClick={search}
          disabled={searching || !q.trim()}
          className="rounded-xl border border-teal-400/40 bg-teal-400/15 px-4 py-2 text-sm font-bold uppercase tracking-wider text-teal-200 hover:bg-teal-400/25 disabled:opacity-40"
        >
          {searching ? "searching…" : "Search"}
        </button>
        <span className="text-xs text-teal-200/40">pick the right listing — it joins your watchlist and the agent dossiers it; trading it still needs both of you to promote it</span>
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
                onClick={() => add(m.symbol)}
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
