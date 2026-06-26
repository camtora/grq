import BullMark from "@/components/bulls/BullMark";

// Multi-line return-%-over-time chart for the Bull Races — one line per bull, color matched to its
// leaderboard row. Labeled axes (Y = return % vs starting stake, 0 = break-even; X = time). A
// recolored bull logo marks each line's leading point. Sparse early (points land as sessions run).
export type ChartSeries = { label: string; color: string; points: { at: Date; returnPct: number }[] };

const fmtX = (d: Date) =>
  d.toLocaleString("en-US", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function BullChart({ series }: { series: ChartSeries[] }) {
  const all = series.flatMap((s) => s.points);
  if (all.length < 2) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-teal-400/10 bg-teal-400/[0.02] text-center text-xs text-teal-200/40">
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
  const H = 380; // taller aspect so it fills the right-hand column beside the leaderboard
  const padL = 46;
  const padR = 18;
  const padT = 18;
  const padB = 30;
  const px = (t: number) => padL + ((t - minX) / spanX) * (W - padL - padR);
  const py = (v: number) => padT + (1 - (v - minY) / spanY) * (H - padT - padB);
  const fmtPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
  const yTicks = Array.from(new Set([maxY, 0, minY])); // top, break-even, bottom (deduped)

  return (
    <div className="rounded-xl border border-teal-400/10 bg-teal-400/[0.02] p-2">
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full">
          {/* Y axis: gridline + % label per tick (the bolder line is 0 / break-even) */}
          {yTicks.map((v) => {
            const y = py(v);
            const isZero = v === 0;
            return (
              <g key={v}>
                <line
                  x1={padL}
                  x2={W - padR}
                  y1={y}
                  y2={y}
                  stroke="currentColor"
                  strokeWidth={isZero ? 0.8 : 0.4}
                  className={isZero ? "text-teal-200/30" : "text-teal-200/10"}
                />
                <text x={padL - 6} y={y + 3.5} textAnchor="end" fill="currentColor" className="text-teal-200/50" fontSize={11}>
                  {fmtPct(v)}
                </text>
              </g>
            );
          })}

          {/* X axis: start + end timestamps */}
          <text x={padL} y={H - 8} textAnchor="start" fill="currentColor" className="text-teal-200/45" fontSize={11}>
            {fmtX(new Date(minX))}
          </text>
          <text x={W - padR} y={H - 8} textAnchor="end" fill="currentColor" className="text-teal-200/45" fontSize={11}>
            {fmtX(new Date(maxX))}
          </text>

          {/* Lines + bigger point dots, one set per bull */}
          {series.map((s) =>
            s.points.length < 2 ? null : (
              <polyline
                key={s.label}
                points={s.points.map((p) => `${px(p.at.getTime()).toFixed(1)},${py(p.returnPct).toFixed(1)}`).join(" ")}
                fill="none"
                stroke={s.color}
                strokeWidth={1.75}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ),
          )}
          {series.flatMap((s) =>
            s.points.map((p, i) => (
              <circle key={`${s.label}-${i}`} cx={px(p.at.getTime())} cy={py(p.returnPct)} r={3.5} fill={s.color} />
            )),
          )}
        </svg>

        {/* Recolored bull logo at each bull's leading (latest) point */}
        {series.map((s) => {
          const last = s.points[s.points.length - 1];
          if (!last) return null;
          return (
            <span
              key={s.label}
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${(px(last.at.getTime()) / W) * 100}%`, top: `${(py(last.returnPct) / H) * 100}%` }}
            >
              <BullMark color={s.color} className="h-5 w-8 drop-shadow" title={s.label} />
            </span>
          );
        })}
      </div>
      <p className="mt-1 px-1 text-[10px] leading-snug text-teal-200/40">
        Each line is a bull&apos;s <span className="text-teal-200/60">return %</span> vs its starting stake over time; the flat
        line is break-even. The bull (and line color) matches the leaderboard.
      </p>
    </div>
  );
}
