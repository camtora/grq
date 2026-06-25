"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function KillSwitch({
  engaged,
  engagedBy,
  canToggle = true,
  compact = false,
}: {
  engaged: boolean;
  engagedBy: string | null;
  canToggle?: boolean;
  // compact = the header pill (just the toggle/status); default = the full panel.
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const msg = engaged
      ? "Re-enable trading? The agent (and manual orders) will be allowed again."
      : "HALT ALL TRADING? No order of any kind will be accepted until someone re-enables.";
    if (!window.confirm(msg)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/killswitch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ engaged: !engaged }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // Header pill: viewers see a non-interactive status dot; members get the toggle.
  if (compact) {
    if (!canToggle) {
      return (
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-semibold ${engaged ? "text-red-400" : "text-teal-200/50"}`}
          title={engaged ? `Trading halted${engagedBy ? ` by ${engagedBy}` : ""}` : "Trading permitted"}
        >
          <span className={`h-2 w-2 rounded-full ${engaged ? "animate-pulse bg-red-400" : "bg-teal-400/60"}`} />
          {engaged ? "HALTED" : "OK"}
        </span>
      );
    }
    return (
      <button
        onClick={toggle}
        disabled={busy}
        title={
          engaged
            ? `Trading halted${engagedBy ? ` by ${engagedBy}` : ""} — click to resume`
            : "Halt all trading instantly — no order is accepted until resumed"
        }
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50 ${
          engaged
            ? "border-red-400/40 bg-red-400/15 text-red-300 hover:bg-red-400/25"
            : "border-red-400/20 text-red-300/60 hover:bg-red-400/10"
        }`}
      >
        <span className={`h-2 w-2 rounded-full ${engaged ? "animate-pulse bg-red-400" : "bg-teal-400/60"}`} />
        {busy ? "…" : engaged ? "Resume trading" : "Halt trading"}
      </button>
    );
  }

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5 ${
        engaged ? "border-red-400/40 bg-red-400/10" : "border-red-400/15 bg-red-400/[0.03]"
      }`}
    >
      <div>
        <div className="font-semibold text-red-200/90">Kill switch</div>
        <div className="text-sm text-red-200/50">
          {engaged
            ? `Engaged${engagedBy ? ` by ${engagedBy}` : ""} — every order is rejected at the gate.`
            : "Instant halt, no questions asked. Cam and Graham both hold it."}
        </div>
        {error ? <div className="mt-1 text-xs text-red-300">{error}</div> : null}
      </div>
      {canToggle ? (
        <button
          onClick={toggle}
          disabled={busy}
          className={`rounded-lg px-2.5 py-1 text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50 ${
            engaged
              ? "border border-teal-400/40 bg-teal-400/10 text-teal-200 hover:bg-teal-400/20"
              : "border border-red-400/40 bg-red-400/10 text-red-200 hover:bg-red-400/25"
          }`}
        >
          {busy ? "…" : engaged ? "Resume trading" : "Halt trading"}
        </button>
      ) : (
        <span className="rounded-lg border border-red-400/15 px-2.5 py-1 text-xs uppercase tracking-wider text-red-200/40">
          view only
        </span>
      )}
    </div>
  );
}
