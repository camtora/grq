import type { Recommendation } from "@/agent/signals";

// The graded at-a-glance call beside the signal strip on /stocks: Strong Buy →
// Strong Sell, green / amber / red, with a 0–10 score. Advisory technical
// consensus — not the agent's decision (which lives in its journal).
function tone(ratio: number): string {
  if (ratio >= 0.25) return "bg-emerald-400/20 text-emerald-300 border-emerald-400/30";
  if (ratio <= -0.25) return "bg-red-400/20 text-red-300 border-red-400/30";
  return "bg-amber-400/15 text-amber-300 border-amber-400/25";
}

export default function SignalRec({ rec }: { rec: Recommendation | null }) {
  if (!rec) return <span className="text-xs text-teal-200/30">—</span>;
  return (
    <span
      title={`${rec.label} · ${rec.score}/10 — ${rec.rationale}`}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${tone(rec.ratio)}`}
    >
      {rec.label}
      <span className="font-semibold tabular-nums opacity-60">{rec.score}/10</span>
    </span>
  );
}
