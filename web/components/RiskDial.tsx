"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const DIALS = [
  {
    value: "CAUTIOUS",
    label: "Cautious",
    desc: "Max 10% per position · 30–50% cash (floor–ceiling, per currency) · ETFs + large-cap (TSX60) · 5% stop / 15% take-profit · ≤15 new buys/wk",
  },
  {
    value: "BALANCED",
    label: "Balanced",
    desc: "Max 15% per position · 15–30% cash (per currency) · ETFs + large + mid-cap · 8% stop / 25% take-profit · ≤20 new buys/wk",
  },
  {
    value: "AGGRESSIVE",
    label: "Aggressive",
    desc: "Max 25% per position · 0–15% cash (per currency) · ETFs + large + mid-cap · 12% stop / 40% take-profit · ≤25 new buys/wk",
  },
] as const;

// The risk dial, in its own panel. Its Save button writes BOTH risk + fee budget
// (the settings API takes both together) — the fee budget rides along unchanged from
// what's saved, so the fee panel and this panel never clobber each other's field.
export default function RiskDial({
  riskLevel,
  feeBudgetCentsMonth,
  readOnly = false,
}: {
  riskLevel: string;
  feeBudgetCentsMonth: number;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [risk, setRisk] = useState(riskLevel);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setState("saving");
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ riskLevel: risk, feeBudgetCentsMonth }),
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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-semibold uppercase tracking-wider text-teal-200/50">Risk dial</div>
        {!readOnly && (
          <div className="flex items-center gap-3">
            {state === "saved" && <span className="text-sm text-emerald-400">Saved ✓</span>}
            {state === "error" && <span className="text-sm text-red-400">{error}</span>}
            <button
              onClick={save}
              disabled={state === "saving"}
              className="rounded-xl border border-teal-400/40 bg-teal-400/15 px-5 py-2 text-sm font-bold uppercase tracking-wider text-teal-200 transition-colors hover:bg-teal-400/25 disabled:opacity-50"
            >
              {state === "saving" ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {DIALS.map((d) => (
          <button
            key={d.value}
            onClick={() => !readOnly && setRisk(d.value)}
            className={`rounded-2xl border p-4 text-left transition-colors ${readOnly ? "cursor-default" : ""} ${
              risk === d.value
                ? "border-teal-400/50 bg-teal-400/10"
                : "border-teal-400/10 bg-teal-400/[0.02] hover:border-teal-400/30"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-teal-50">{d.label}</span>
              {risk === d.value && <span className="h-2.5 w-2.5 rounded-full bg-teal-400" />}
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
  );
}
