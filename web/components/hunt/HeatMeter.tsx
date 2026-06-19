// The heat meter — "HEAT" label + the 0–100 score (in the hue-coded heat color) over a
// gradient bar that fills from teal (cool) to the name's heat color (hot). Pure markup →
// server-renderable. The fill gradient ends on `color` so a hotter name reads warmer.
export default function HeatMeter({
  heat,
  color,
  barHeight = 7,
}: {
  heat: number;
  color: string; // heatColor(heat) from lib/heat
  barHeight?: number;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[9px] font-semibold uppercase tracking-[0.15em] text-teal-200/50">Heat</span>
        <span className="font-mono text-base font-bold tabular-nums" style={{ color }}>
          {heat}
        </span>
      </div>
      <div className="overflow-hidden rounded" style={{ height: barHeight, background: "color-mix(in oklab, var(--body-fg) 8%, transparent)" }}>
        <div
          className="h-full rounded"
          style={{ width: `${Math.min(100, Math.max(0, heat))}%`, background: `linear-gradient(90deg, var(--spark-up), ${color})` }}
        />
      </div>
    </div>
  );
}
