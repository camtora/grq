"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { money } from "@/lib/money";

// The monthly fee budget, in its own compact panel. Its Save button writes BOTH
// fee budget + risk (the settings API takes both together) — risk rides along
// unchanged from what's saved, so this panel and the risk dial don't clobber.
// When feeSpentMonthCents is passed it also shows month-to-date USAGE + a progress
// bar (moved here from the Portfolio page top row — Cam 2026-06-29).
export default function FeeBudget({
  riskLevel,
  feeBudgetCentsMonth,
  feeSpentMonthCents,
  readOnly = false,
}: {
  riskLevel: string;
  feeBudgetCentsMonth: number;
  feeSpentMonthCents?: number;
  readOnly?: boolean;
}) {
  const feeFrac = feeBudgetCentsMonth > 0 ? (feeSpentMonthCents ?? 0) / feeBudgetCentsMonth : 0;
  const router = useRouter();
  const [budget, setBudget] = useState((feeBudgetCentsMonth / 100).toFixed(0));
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setState("saving");
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          riskLevel,
          feeBudgetCentsMonth: Math.round(Number(budget) * 100),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      setState("saved");
      router.refresh();
      setTimeout(() => setState("idle"), 2000);
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div>
      <div className="mb-3 text-sm font-semibold uppercase tracking-wider text-teal-200/50">
        Monthly fee budget
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-xl border border-teal-400/20 bg-teal-400/5 px-3">
          <span className="text-teal-200/50">$</span>
          <input
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            inputMode="numeric"
            readOnly={readOnly}
            className="w-16 bg-transparent px-2 py-2.5 text-teal-50 outline-none"
          />
          <span className="text-xs text-teal-200/40">/ mo</span>
        </div>
        {readOnly ? (
          <span className="rounded-lg border border-teal-400/15 px-2.5 py-1 text-xs uppercase tracking-wider text-teal-200/40">
            view only
          </span>
        ) : (
          <button
            onClick={save}
            disabled={state === "saving"}
            className="rounded-lg border border-teal-400/40 bg-teal-400/15 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-teal-200 transition-colors hover:bg-teal-400/25 disabled:opacity-50"
          >
            {state === "saving" ? "Saving…" : "Save"}
          </button>
        )}
      </div>
      <div className="mt-2 h-4 text-sm">
        {state === "saved" && <span className="text-emerald-400">Saved ✓</span>}
        {state === "error" && <span className="text-red-400">{error}</span>}
      </div>
      <p className="mt-1 text-xs text-teal-200/40">
        Commissions stop dead at this number — the order gate rejects anything that would
        cross it.
      </p>
      {feeSpentMonthCents != null && (
        <div className="mt-3 border-t border-teal-400/10 pt-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs uppercase tracking-wider text-teal-200/40">Spent this month</span>
            <span className="text-sm font-semibold tabular-nums text-teal-50">
              {money(feeSpentMonthCents)} <span className="text-teal-200/40">/ {money(feeBudgetCentsMonth)}</span>
            </span>
          </div>
          <span className="mt-2 block h-1.5 w-full overflow-hidden rounded-full bg-teal-400/10">
            <span
              className={`block h-full rounded-full ${feeFrac > 0.8 ? "bg-red-400" : "bg-teal-400/70"}`}
              style={{ width: `${Math.min(100, feeFrac * 100)}%` }}
            />
          </span>
        </div>
      )}
    </div>
  );
}
