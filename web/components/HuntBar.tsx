"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Directed hunt (D38) — brief the agent in plain English ("emerging medical names
// about to post trial data"). The web (alpine) can't run a Claude session; this
// POST sets a flag + brief the agent's tick picks up (seconds), then posts focused
// finds. A blank submit clears any prior brief and runs a broad hunt. Members only.
export default function HuntBar() {
  const router = useRouter();
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function go() {
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/hunt/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brief: brief.trim() }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setMsg(d.error ?? `HTTP ${r.status}`);
      else if (!d.queued) setMsg(d.note ?? "A hunt is already running — give it a minute.");
      else {
        setMsg("On the hunt — names land in a minute or two; refresh the page to see them.");
        setBrief("");
        router.refresh();
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 rounded-xl border border-teal-400/20 bg-teal-400/[0.04] px-3 py-2 focus-within:border-teal-400/40">
        <span className="shrink-0 text-teal-300/60" aria-hidden>
          🔭
        </span>
        <input
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") go();
          }}
          disabled={busy}
          placeholder="Brief the hunt — e.g. 'emerging medical names about to post trial data'"
          className="min-w-0 flex-1 bg-transparent text-sm text-teal-50 outline-none placeholder:text-teal-200/30 disabled:opacity-50"
        />
        <button
          onClick={go}
          disabled={busy}
          className="shrink-0 rounded-lg border border-teal-400/40 bg-teal-400/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-teal-200 transition-colors hover:bg-teal-400/20 disabled:opacity-40"
        >
          {busy ? "hunting…" : "Hunt"}
        </button>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 px-1">
        <p className="text-[11px] text-teal-200/40">
          GRQ web-searches North America for under-the-radar names that fit your brief. Leave it blank to go broad.
        </p>
        {msg && <span className="text-[11px] text-teal-300/70">{msg}</span>}
      </div>
    </div>
  );
}
