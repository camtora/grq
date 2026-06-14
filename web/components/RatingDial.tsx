import type { Recommendation } from "@/agent/signals";

// The at-a-glance verdict: a graded label (Strong Buy → Strong Sell), a 0–10
// score, and a color-graded needle on a red→amber→green track. Green buy,
// yellow hold, red sell (Graham, 2026-06-14).
function tone(ratio: number): string {
  if (ratio >= 0.25) return "text-emerald-400";
  if (ratio <= -0.25) return "text-red-400";
  return "text-amber-300";
}

export default function RatingDial({ rec }: { rec: Recommendation }) {
  const pos = Math.max(2, Math.min(98, ((rec.ratio + 1) / 2) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className={`text-2xl font-black ${tone(rec.ratio)}`}>{rec.label}</span>
        <span className="text-sm tabular-nums text-teal-200/50">{rec.score}/10</span>
      </div>
      <div className="relative mt-2.5 h-2.5 rounded-full bg-gradient-to-r from-red-500/55 via-amber-400/45 to-emerald-500/55">
        <span
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#0a1413] shadow-lg"
          style={{ left: `${pos}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wider text-teal-200/40">
        <span>Strong Sell</span>
        <span>Hold</span>
        <span>Strong Buy</span>
      </div>
    </div>
  );
}
