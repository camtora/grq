"use client";

import { useEffect, useState } from "react";

// Member tool (Settings) to manage the GRQ Daily masthead lines without a deploy:
// add, edit, reorder, enable/disable, delete, and "show today" (pin to today's date,
// overriding the rotation). The lines surface on the Today page for everyone.

type Quote = { id: number; text: string; sortOrder: number; enabled: boolean; pinnedDate: string | null };
type Payload = { quotes: Quote[]; todayId: number | null; today: string };

const btn = "rounded-lg px-2.5 py-1 text-xs font-semibold disabled:opacity-50";
const ghost = "rounded-lg px-2 py-1 text-xs text-teal-200/50 hover:text-teal-100 disabled:opacity-40";

export default function DailyQuotesManager({ readOnly = false }: { readOnly?: boolean }) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [todayId, setTodayId] = useState<number | null>(null);
  const [today, setToday] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  async function load() {
    try {
      const res = await fetch("/api/daily-quotes");
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      const d: Payload = await res.json();
      setQuotes(d.quotes);
      setTodayId(d.todayId);
      setToday(d.today);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function call(url: string, init: RequestInit) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { headers: { "content-type": "application/json" }, ...init });
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    const text = draft.trim();
    if (!text) return;
    if (await call("/api/daily-quotes", { method: "POST", body: JSON.stringify({ text }) })) setDraft("");
  }
  const saveEdit = async (id: number) => {
    if (await call(`/api/daily-quotes/${id}`, { method: "PATCH", body: JSON.stringify({ text: editText }) })) setEditingId(null);
  };
  const toggle = (q: Quote) => call(`/api/daily-quotes/${q.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !q.enabled }) });
  const pin = (q: Quote, on: boolean) => call(`/api/daily-quotes/${q.id}`, { method: "PATCH", body: JSON.stringify({ pinToday: on }) });
  const del = (q: Quote) => {
    if (window.confirm(`Delete this line?\n\n${q.text}`)) call(`/api/daily-quotes/${q.id}`, { method: "DELETE" });
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= quotes.length) return;
    const next = [...quotes];
    [next[i], next[j]] = [next[j], next[i]];
    setQuotes(next); // optimistic
    call("/api/daily-quotes/reorder", { method: "POST", body: JSON.stringify({ ids: next.map((q) => q.id) }) });
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 text-sm font-semibold uppercase tracking-wider text-teal-200/50">Daily masthead quotes</div>
        <p className="text-xs text-teal-200/40">
          The line under the Today header. One shows per day (deterministic, turns over each morning) — or “Show today” to force one onto today
          {today ? ` (${today})` : ""}. Everyone sees these.
          {error && <span className="ml-2 text-red-400">{error}</span>}
        </p>
      </div>

      {!readOnly && (
        <div className="flex items-start gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a quote or a (loving) roast…"
            rows={2}
            className="min-w-0 flex-1 rounded-xl border border-teal-400/15 bg-teal-400/[0.03] px-3 py-2 text-sm text-teal-50 outline-none focus:border-teal-400/40"
          />
          <button onClick={add} disabled={busy || !draft.trim()} className={`${btn} mt-0.5 bg-teal-400/20 text-teal-100 hover:bg-teal-400/30`}>
            Add
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-xs text-teal-200/40">Loading…</div>
      ) : quotes.length === 0 ? (
        <div className="text-xs text-teal-200/40">No lines yet.</div>
      ) : (
        <ul className="space-y-2">
          {quotes.map((q, i) => {
            const isToday = q.id === todayId;
            const editing = editingId === q.id;
            return (
              <li
                key={q.id}
                className={`rounded-2xl border p-3 ${isToday ? "border-teal-400/40 bg-teal-400/[0.06]" : q.enabled ? "border-teal-400/10 bg-teal-400/[0.02]" : "border-teal-400/5 bg-transparent opacity-60"}`}
              >
                <div className="flex items-start gap-2">
                  {!readOnly && (
                    <div className="flex flex-col">
                      <button onClick={() => move(i, -1)} disabled={busy || i === 0} className={ghost} title="move up">
                        ↑
                      </button>
                      <button onClick={() => move(i, 1)} disabled={busy || i === quotes.length - 1} className={ghost} title="move down">
                        ↓
                      </button>
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    {editing ? (
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        rows={2}
                        className="w-full rounded-lg border border-teal-400/20 bg-teal-400/[0.04] px-2 py-1 text-sm text-teal-50 outline-none focus:border-teal-400/40"
                      />
                    ) : (
                      <p className="text-sm text-teal-100/80">{q.text}</p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px]">
                      {isToday && <span className="rounded-full border border-teal-400/30 px-2 py-0.5 font-semibold uppercase tracking-wider text-teal-200/70">showing today</span>}
                      {q.pinnedDate && <span className="rounded-full border border-amber-400/30 px-2 py-0.5 font-semibold uppercase tracking-wider text-amber-300/80">pinned {q.pinnedDate}</span>}
                      {!q.enabled && <span className="text-teal-200/40">disabled</span>}
                    </div>
                  </div>
                  {!readOnly && (
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                      {editing ? (
                        <>
                          <button onClick={() => saveEdit(q.id)} disabled={busy} className={`${btn} bg-teal-400/20 text-teal-100 hover:bg-teal-400/30`}>
                            Save
                          </button>
                          <button onClick={() => setEditingId(null)} disabled={busy} className={ghost}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => pin(q, q.pinnedDate !== today)}
                            disabled={busy}
                            className={`${btn} border ${q.pinnedDate === today ? "border-amber-400/30 bg-amber-400/10 text-amber-300" : "border-teal-400/15 text-teal-300 hover:bg-teal-400/10"}`}
                            title="force this line onto today"
                          >
                            {q.pinnedDate === today ? "Unpin" : "Show today"}
                          </button>
                          <button onClick={() => toggle(q)} disabled={busy} className={ghost}>
                            {q.enabled ? "Disable" : "Enable"}
                          </button>
                          <button onClick={() => { setEditingId(q.id); setEditText(q.text); }} disabled={busy} className={ghost}>
                            Edit
                          </button>
                          <button onClick={() => del(q)} disabled={busy} className={`${ghost} hover:text-red-300`}>
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
