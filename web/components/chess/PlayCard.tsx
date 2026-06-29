import Link from "next/link";
import { pct, money } from "@/lib/money";
import { heatColor } from "@/lib/heat";
import StockLogo from "@/components/StockLogo";
import Sparkline from "@/components/Sparkline";
import ConfidenceGauge from "@/components/hunt/ConfidenceGauge";
import HeatMeter from "@/components/hunt/HeatMeter";
import { OBSCURITY_LABEL } from "@/components/hunt/shared";
import { stanceMeta, STANCE_TONE_CLASSES } from "@/lib/stance";
import Md from "@/components/Md";
import ChessResearchButton from "@/components/chess/ChessResearchButton";
import type { ChessPlayView } from "@/lib/chess";

// One ChessPlay as a heat-ranked row (mirrors The Hunt's HuntRow). Leads-not-verdicts:
// it shows direction (beneficiary/victim), effect order, conviction + heat — and GRQ's
// call only when we already cover the name; otherwise it's a "lead". Server component;
// only the Research button is a client island.
const DIR = {
  BENEFICIARY: { icon: "↑", label: "beneficiary", chip: "bg-emerald-400/10 text-emerald-300" },
  VICTIM: { icon: "↓", label: "victim", chip: "bg-red-400/10 text-red-300" },
  NEUTRAL: { icon: "↔", label: "neutral", chip: "bg-amber-400/10 text-amber-300" },
} as const;

const ORDINAL = ["", "1st", "2nd", "3rd"];

export default function PlayCard({ play, isMember }: { play: ChessPlayView; isMember: boolean }) {
  const color = heatColor(play.heat);
  const up = (play.change30d ?? 0) >= 0;
  const dir = DIR[play.direction];
  const m = stanceMeta(play.stance);
  const tone = m ? STANCE_TONE_CLASSES[m.tone] : null;
  const obs = play.obscurity ? OBSCURITY_LABEL[play.obscurity] : null;

  return (
    <div className="relative flex flex-wrap items-center gap-x-5 gap-y-4 overflow-hidden rounded-2xl border border-[color:var(--card-border)] bg-[var(--card-bg)] py-4 pl-6 pr-5">
      <div className="absolute inset-y-0 left-0 w-1" style={{ background: color, boxShadow: `0 0 16px ${color}` }} aria-hidden />

      {/* identity */}
      <div className="flex min-w-[14rem] flex-1 items-center gap-3">
        <StockLogo symbol={play.sym} logoUrl={play.logoUrl} className="h-9 w-9 text-[11px]" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Link href={play.href} className="font-semibold text-teal-50 hover:underline">
              {play.sym}
            </Link>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${dir.chip}`}>
              {dir.icon} {dir.label}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-teal-200/40">{ORDINAL[play.effectOrder] ?? `${play.effectOrder}th`}-order</span>
            {m && tone ? (
              <span title={`Alfred's call: ${m.label}`} className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${tone.bg} ${tone.text}`}>
                {m.abbr}
              </span>
            ) : (
              <span className="text-[10px] uppercase tracking-wide text-teal-200/30">lead</span>
            )}
          </div>
          <div className="truncate text-xs text-teal-200/50">
            {play.name}
            {play.tag ? ` · ${play.tag}` : ""}
          </div>
          <div className="mt-0.5 text-[10px] uppercase tracking-wide text-teal-200/35">
            {play.role}
            {obs ? ` · ${obs}` : ""}
          </div>
        </div>
      </div>

      {/* the one-line thesis (agent markdown → Md) */}
      <div className="min-w-[12rem] flex-[2] text-sm">
        <Md text={play.thesis} />
      </div>

      {/* price + 30-day */}
      <div className="w-28 shrink-0 text-right">
        <div className="font-semibold tabular-nums text-teal-50">{play.cur != null ? money(play.cur, play.currency) : "—"}</div>
        <div className={`text-xs tabular-nums ${up ? "text-emerald-400" : "text-red-400"}`}>
          {play.change30d != null ? `${up ? "+" : ""}${pct(play.change30d, 0)} 30d` : "—"}
        </div>
        {play.spark.length >= 2 && (
          <div className="mt-1">
            <Sparkline values={play.spark} width={112} height={26} />
          </div>
        )}
      </div>

      {/* conviction + heat */}
      <div className="flex shrink-0 items-center gap-3">
        <ConfidenceGauge value={play.conviction} size={50} label="CONV" />
        <div className="w-20">
          <HeatMeter heat={play.heat} color={color} />
        </div>
      </div>

      {isMember && (
        <div className="shrink-0">
          <ChessResearchButton symbol={play.sym} />
        </div>
      )}
    </div>
  );
}
