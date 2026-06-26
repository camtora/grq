import { Card, Chip, Pnl } from "@/components/ui";
import Term from "@/components/Term";
import Sparkline from "./Sparkline";
import { glossaryKeyForModel } from "@/lib/race/models";
import type { ModelStanding } from "@/lib/race/standings";

// Signed bps → "+1.2%" / "−0.4%". Null → em dash.
function fmtBps(bps: number | null): string {
  if (bps == null) return "—";
  const p = bps / 100;
  return `${p >= 0 ? "+" : "−"}${Math.abs(p).toFixed(1)}%`;
}

function Stat({ label, value, sub, valueClass = "text-teal-50" }: { label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-teal-200/40">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${valueClass}`}>{value}</div>
      {sub ? <div className="text-[10px] tabular-nums text-teal-200/30">{sub}</div> : null}
    </div>
  );
}

/** One model's scorecard tile on the overview. Champion is flagged regardless of rank. */
export default function ModelTile({ s, rank }: { s: ModelStanding; rank: number }) {
  const champ = s.role === "champion";
  const idle = s.totalCalls === 0; // configured but hasn't raced yet — fade it
  const gkey = glossaryKeyForModel(s.model);
  const hit = s.hitRate != null ? `${Math.round(s.hitRate * 100)}%` : "—";
  const vsClass = s.vsBenchmarkBps == null ? "text-teal-200/40" : s.vsBenchmarkBps >= 0 ? "text-emerald-300" : "text-red-300";
  return (
    <Card className={`p-4 ${champ ? "border-teal-400/30 bg-teal-400/[0.04]" : ""} ${idle ? "opacity-45" : ""}`}>
      <div className="flex items-center gap-2">
        <span className="text-xs tabular-nums text-teal-200/40">#{rank}</span>
        <span className="min-w-0 text-sm font-semibold text-teal-50">{gkey ? <Term k={gkey}>{s.label}</Term> : s.label}</span>
        <span className="ml-auto">
          <Chip tone={champ ? "teal" : "dim"}>{champ ? "Champion" : "Shadow"}</Chip>
        </span>
      </div>

      <div className="mt-3 flex items-end justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-teal-200/40">Paper P&amp;L</div>
          <div className="text-xl font-bold">{s.scoredCalls ? <Pnl cents={s.pnlCadCents} /> : <span className="text-teal-200/30">—</span>}</div>
        </div>
        <div className="h-8 w-24">
          <Sparkline data={s.spark} />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Stat label="Hit rate" value={hit} sub={`${s.greens}/${s.scoredCalls}`} />
        <Stat label="vs XIC" value={fmtBps(s.vsBenchmarkBps)} valueClass={vsClass} />
        <Stat label="Conviction" value={s.avgConfidence != null ? `${s.avgConfidence}%` : "—"} />
      </div>

      {idle ? (
        <div className="mt-2 text-center text-[10px] uppercase tracking-wider text-teal-200/40">Awaiting first session</div>
      ) : (
        <div className="mt-2 text-center text-[10px] tabular-nums text-teal-200/40">
          {s.counts.BUY} buy · {s.counts.SELL} sell · {s.counts.HOLD} hold · {s.counts.NONE} stand-down
        </div>
      )}
    </Card>
  );
}
