"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Directed hunt (D38) — brief the agent in plain English ("emerging medical names
// about to post trial data"). The web (alpine) can't run a Claude session; this
// POST sets a flag + brief the agent's tick picks up (seconds), then posts focused
// finds over the next minute or two. A blank submit clears any prior brief and runs
// a broad hunt. Members only.
//
// The redesign's hero treatment (design handoff): gradient-bordered panel, target
// glyph, big input, ⚡ HUNT. On a successful queue it fires `grq-hunt-submitted` so
// <HuntStatus> starts watching for the new names + marks the current results stale.
export default function HuntBar() {
  const router = useRouter();
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function go() {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/hunt/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brief: brief.trim() }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setErr(d.error ?? `HTTP ${r.status}`);
      else if (!d.queued) setErr(d.note ?? "A hunt is already running — give it a minute.");
      else {
        setBrief("");
        // Tell <HuntStatus> to start watching for fresh finds (and stale-flag the feed).
        window.dispatchEvent(new Event("grq-hunt-submitted"));
        router.refresh();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4">
      <div
        className="rounded-2xl p-0.5"
        style={{ background: "linear-gradient(120deg, color-mix(in oklab, var(--spark-up) 55%, transparent), rgba(155,124,255,0.35), rgba(255,122,69,0.30))" }}
      >
        <div className="flex flex-wrap items-center gap-4 rounded-[14px] bg-[var(--field-bg)] px-4 py-4 sm:flex-nowrap sm:px-5">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-teal-400/30 bg-teal-400/10 text-xl text-teal-300"
            aria-hidden
          >
            ⌖
          </div>
          <div className="min-w-0 flex-1">
            <input
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") go();
              }}
              disabled={busy}
              placeholder="Brief the hunt — e.g. 'emerging medical names about to post trial data'"
              className="w-full bg-transparent text-base text-teal-50 outline-none placeholder:text-teal-200/30 disabled:opacity-50 sm:text-lg"
            />
            <p className="mt-1 text-xs text-teal-200/40">
              GRQ web-searches North America for under-the-radar names that fit your brief — results land in a minute or two; we&apos;ll check
              automatically. Leave it blank to go broad.
            </p>
          </div>
          <button
            onClick={go}
            disabled={busy}
            className="shrink-0 rounded-xl bg-[var(--spark-up)] px-6 py-3 text-sm font-bold uppercase tracking-wider text-teal-950 shadow-lg shadow-teal-400/25 transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "hunting…" : "⚡ Hunt"}
          </button>
        </div>
      </div>
      {err && <p className="mt-1.5 px-1 text-[11px] text-amber-300/80">{err}</p>}
    </div>
  );
}
