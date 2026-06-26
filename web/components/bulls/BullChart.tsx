// Multi-line return-%-over-time chart for the Bull Races — one line per bull (color matches its
// leaderboard row's dot). Pure SVG. A faint zero baseline marks break-even. Sparse early (points
// land as race sessions run).
export type ChartSeries = { label: string; color: string; points: { at: Date; returnPct: number }[] };

export default function BullChart({ series }: { series: ChartSeries[] }) {
  const all = series.flatMap((s) => s.points);
  if (all.length < 2) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-teal-400/10 bg-teal-400/[0.02] text-center text-xs text-teal-200/40">
        The race is just getting going — return lines fill in after the first couple of sessions.
      </div>
    );
  }
  const xs = all.map((p) => p.at.getTime());
  const ys = all.map((p) => p.returnPct);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(0, ...ys);
  const maxY = Math.max(0, ...ys);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const W = 640;
  const H = 200;
  const pad = 10;
  const px = (t: number) => pad + ((t - minX) / spanX) * (W - 2 * pad);
  const py = (v: number) => pad + (1 - (v - minY) / spanY) * (H - 2 * pad);
  const zeroY = py(0);
  return (
    <div className="rounded-xl border border-teal-400/10 bg-teal-400/[0.02] p-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <line x1={0} x2={W} y1={zeroY} y2={zeroY} stroke="currentColor" strokeWidth={0.5} className="text-teal-200/20" />
        {series.map((s) => {
          if (s.points.length === 0) return null;
          if (s.points.length === 1) {
            const p = s.points[0];
            return <circle key={s.label} cx={px(p.at.getTime())} cy={py(p.returnPct)} r={2.5} fill={s.color} />;
          }
          const pts = s.points.map((p) => `${px(p.at.getTime()).toFixed(1)},${py(p.returnPct).toFixed(1)}`).join(" ");
          return <polyline key={s.label} points={pts} fill="none" stroke={s.color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />;
        })}
      </svg>
    </div>
  );
}
