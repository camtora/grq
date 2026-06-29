"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

// Chess Moves (docs/CHESS-MOVES.md) — brief Alfred on a theme or value chain to map
// ("uranium supply squeeze", "the GLP-1 chain"). The web can't run a Claude session;
// this POST creates a PENDING board the agent's tick picks up. On a successful queue it
// fires `grq-chess-submitted` so <ChessStatus> watches for the finished board. Members
// only. On-system per docs/DESIGN.md: a themed field input + the canonical Button.
export default function ChessBar() {
  const router = useRouter();
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function go() {
    if (busy) return;
    const b = brief.trim();
    if (b.length < 3) {
      setErr("Name a theme or chain to map.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/chess", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brief: b }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setErr(d.error ?? `HTTP ${r.status}`);
      else if (!d.queued) setErr(d.note ?? "A board is already being mapped — give it a minute.");
      else {
        setBrief("");
        window.dispatchEvent(new Event("grq-chess-submitted"));
        router.refresh();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") go();
          }}
          disabled={busy}
          placeholder="Name a theme or chain — e.g. “uranium supply squeeze” or “the GLP-1 chain”"
          className="min-w-0 flex-1 rounded-lg border border-[color:var(--card-border)] bg-[var(--field-bg)] px-3 py-2 text-sm text-teal-100 outline-none placeholder:text-teal-200/30 focus:border-teal-400/40 disabled:opacity-50"
        />
        <Button onClick={go} disabled={busy}>
          {busy ? "Mapping…" : "Map it"}
        </Button>
      </div>
      <p className="mt-1.5 text-xs text-teal-200/40">
        Alfred maps the value chain, names the force in motion, and traces the ripple-effect plays — the board lands in a minute or two.
      </p>
      {err && <p className="mt-1 text-[11px] text-amber-300/80">{err}</p>}
    </div>
  );
}
