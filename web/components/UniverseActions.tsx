"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  symbol: string;
  status: "CANDIDATE" | "ACTIVE" | "RETIRED";
  pendingBy: string | null;
  proposedTier: string | null;
  currentUser: string;
  researchInFlight?: boolean;
};

export default function UniverseActions({
  symbol,
  status,
  pendingBy,
  proposedTier,
  currentUser,
  researchInFlight,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [tier, setTier] = useState(proposedTier ?? "mid");
  const [err, setErr] = useState<string | null>(null);

  async function act(action: string, extra: object = {}) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/universe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, symbol, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) setErr(data.error ?? `HTTP ${res.status}`);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const btn =
    "rounded-lg border px-2.5 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-40";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status !== "RETIRED" && (
        <button
          disabled={busy || researchInFlight}
          onClick={() => act("research")}
          title="Queue a fresh deep-research dossier (shared budget: 5/day)"
          className={`${btn} border-teal-400/30 text-teal-300 hover:bg-teal-400/10`}
        >
          {researchInFlight ? "researching…" : "🔍 Research now"}
        </button>
      )}

      {status === "CANDIDATE" && (
        <>
          {!pendingBy || pendingBy === currentUser ? (
            <>
              <select
                value={tier}
                onChange={(e) => setTier(e.target.value)}
                disabled={busy || pendingBy === currentUser}
                className="rounded-lg border border-teal-400/20 bg-(--field-bg) px-2 py-1.5 text-xs text-teal-50 outline-none"
              >
                <option value="etf">etf</option>
                <option value="large">large</option>
                <option value="mid">mid</option>
              </select>
              <button
                disabled={busy || pendingBy === currentUser}
                onClick={() => act("promote", { tier })}
                title={
                  pendingBy === currentUser
                    ? "You requested this — the other member must approve"
                    : "Request promotion into the tradeable universe (needs both members)"
                }
                className={`${btn} border-emerald-400/30 text-emerald-400 hover:bg-emerald-400/10`}
              >
                {pendingBy === currentUser ? `⏳ awaiting other member` : "⬆ Request promotion"}
              </button>
            </>
          ) : (
            <button
              disabled={busy}
              onClick={() => act("promote", { tier: proposedTier ?? tier })}
              title={`${pendingBy} requested this (${proposedTier}) — your click makes it tradeable`}
              className={`${btn} border-emerald-400/50 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20`}
            >
              ✓ Approve → universe ({pendingBy} asked)
            </button>
          )}
          <button
            disabled={busy}
            onClick={() => window.confirm(`Stop researching ${symbol}? History is kept.`) && act("retire")}
            className={`${btn} border-teal-400/15 text-teal-200/40 hover:bg-teal-400/5`}
          >
            Retire
          </button>
        </>
      )}

      {status === "ACTIVE" && (
        <button
          disabled={busy}
          onClick={() =>
            window.confirm(`Demote ${symbol} from the universe? No new buys; holds/sells unaffected.`) &&
            act("demote")
          }
          className={`${btn} border-red-400/20 text-red-300/60 hover:bg-red-400/10`}
        >
          ⬇ Demote
        </button>
      )}

      {status === "RETIRED" && (
        <button
          disabled={busy}
          onClick={() => act("add")}
          className={`${btn} border-teal-400/30 text-teal-300 hover:bg-teal-400/10`}
        >
          ↻ Re-open research
        </button>
      )}

      {err && <span className="text-xs text-red-400">{err}</span>}
    </div>
  );
}
