import { Card, Chip, Pnl } from "@/components/ui";
import type { ModelStanding } from "@/lib/race/standings";

/** Condensed per-model standings for the day-detail header — one ranked line per model. */
export default function StandingsStrip({ standings }: { standings: ModelStanding[] }) {
  if (standings.length === 0) return null;
  return (
    <Card className="p-4">
      <div className="mb-2 text-[10px] uppercase tracking-wider text-teal-200/40">Day standings</div>
      <div className="space-y-1">
        {standings.map((s, i) => (
          <div key={s.model} className="flex items-center gap-2 text-sm">
            <span className="w-5 shrink-0 tabular-nums text-teal-200/40">#{i + 1}</span>
            <span className="truncate font-semibold text-teal-50">{s.label}</span>
            <Chip tone={s.role === "champion" ? "teal" : "dim"}>{s.role === "champion" ? "Champion" : "Shadow"}</Chip>
            <span className="ml-auto flex items-center gap-3 tabular-nums">
              <span className="text-xs text-teal-200/40">{s.hitRate != null ? `${Math.round(s.hitRate * 100)}% hit` : "—"}</span>
              {s.scoredCalls ? <Pnl cents={s.pnlCadCents} /> : <span className="text-teal-200/30">—</span>}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
