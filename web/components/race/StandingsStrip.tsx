import { Card, Pnl } from "@/components/ui";
import type { ModelStanding } from "@/lib/race/standings";

/** Per-model day standings — 8 compact tiles left-to-right (champion flagged), wrapping on narrow. */
export default function StandingsStrip({ standings }: { standings: ModelStanding[] }) {
  if (standings.length === 0) return null;
  return (
    <Card className="p-4">
      <div className="mb-3 text-[10px] uppercase tracking-wider text-teal-200/40">Day standings</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {standings.map((s, i) => (
          <div
            key={s.model}
            className={`rounded-lg border p-2.5 text-center ${
              s.role === "champion" ? "border-teal-400/30 bg-teal-400/[0.05]" : "border-teal-400/10 bg-teal-400/[0.02]"
            }`}
          >
            <div className="text-[10px] tabular-nums text-teal-200/40">
              #{i + 1}
              {s.role === "champion" ? " ★" : ""}
            </div>
            <div className="mt-0.5 truncate text-xs font-semibold text-teal-50" title={s.label}>
              {s.label}
            </div>
            <div className="mt-1.5">
              {s.scoredCalls ? <Pnl cents={s.pnlCadCents} className="text-sm" /> : <span className="text-xs text-teal-200/30">—</span>}
            </div>
            <div className="mt-0.5 text-[10px] tabular-nums text-teal-200/40">
              {s.hitRate != null ? `${Math.round(s.hitRate * 100)}% hit` : "—"}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
