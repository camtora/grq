"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const DIALS = [
  {
    value: "CAUTIOUS",
    label: "Cautious",
    desc: "Max 10% per position · 30% cash floor · broad ETFs + TSX60 · 5% stops · ≤2 new trades/wk",
  },
  {
    value: "BALANCED",
    label: "Balanced",
    desc: "Max 15% per position · 15% cash floor · + liquid mid-caps · 8% stops · ≤5 new trades/wk",
  },
  {
    value: "AGGRESSIVE",
    label: "Aggressive",
    desc: "Max 25% per position · no cash floor · full whitelist · 12% stops · ≤10 new trades/wk",
  },
] as const;

export default function SettingsForm({
  riskLevel,
  feeBudgetCentsMonth,
}: {
  riskLevel: string;
  feeBudgetCentsMonth: number;
}) {
  const router = useRouter();
  const [risk, setRisk] = useState(riskLevel);
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
          riskLevel: risk,
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
    <div className="space-y-6">
      <div>
        <div className="mb-3 text-sm font-semibold uppercase tracking-wider text-teal-200/50">
          Risk dial
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {DIALS.map((d) => (
            <button
              key={d.value}
              onClick={() => setRisk(d.value)}
              className={`rounded-2xl border p-4 text-left transition-colors ${
                risk === d.value
                  ? "border-teal-400/50 bg-teal-400/10"
                  : "border-teal-400/10 bg-teal-400/[0.02] hover:border-teal-400/30"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-teal-50">{d.label}</span>
                {risk === d.value && (
                  <span className="h-2.5 w-2.5 rounded-full bg-teal-400" />
                )}
              </div>
              <div className="mt-2 text-xs leading-relaxed text-teal-200/50">{d.desc}</div>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-teal-200/40">
          Changes apply at the agent&rsquo;s next decision. Hard guardrails (no shorting, no
          margin, no options) are not configurable here — by design.
        </p>
      </div>

      <div>
        <div className="mb-3 text-sm font-semibold uppercase tracking-wider text-teal-200/50">
          Monthly fee budget
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-xl border border-teal-400/20 bg-teal-400/5 px-3">
            <span className="text-teal-200/50">$</span>
            <input
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              inputMode="numeric"
              className="w-24 bg-transparent px-2 py-2.5 text-teal-50 outline-none"
            />
            <span className="text-xs text-teal-200/40">/ month</span>
          </div>
          <button
            onClick={save}
            disabled={state === "saving"}
            className="rounded-xl border border-teal-400/40 bg-teal-400/15 px-5 py-2.5 text-sm font-bold uppercase tracking-wider text-teal-200 transition-colors hover:bg-teal-400/25 disabled:opacity-50"
          >
            {state === "saving" ? "Saving…" : "Save"}
          </button>
          {state === "saved" && <span className="text-sm text-emerald-400">Saved ✓</span>}
          {state === "error" && <span className="text-sm text-red-400">{error}</span>}
        </div>
        <p className="mt-2 text-xs text-teal-200/40">
          Commissions stop dead at this number — the order gate rejects anything that would
          cross it.
        </p>
      </div>
    </div>
  );
}
