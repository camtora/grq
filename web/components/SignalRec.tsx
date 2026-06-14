import type { Recommendation } from "@/agent/signals";

// The synthesized technical call (BUY/SELL/HOLD + conviction) shown beside the
// signal strip on /stocks. Advisory — a consensus of the technical families,
// not the agent's decision (which lives in the journal).
const TONE: Record<string, string> = {
  BUY: "bg-emerald-400/20 text-emerald-300 border-emerald-400/30",
  SELL: "bg-red-400/20 text-red-300 border-red-400/30",
  HOLD: "bg-teal-400/[0.08] text-teal-200/60 border-teal-400/15",
};

export default function SignalRec({ rec }: { rec: Recommendation | null }) {
  if (!rec) return <span className="text-xs text-teal-200/30">—</span>;
  return (
    <span
      title={`${rec.signal} (${rec.confidence}% conviction) — ${rec.rationale}`}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${TONE[rec.signal] ?? TONE.HOLD}`}
    >
      {rec.signal}
      {rec.signal !== "HOLD" && (
        <span className="font-semibold tabular-nums opacity-60">{rec.confidence}%</span>
      )}
    </span>
  );
}
