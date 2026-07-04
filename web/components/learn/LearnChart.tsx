import { getCloses, refreshBars } from "@/lib/bars";
import type { LearnChartSpec } from "@/lib/learn/content";

// A lesson's real-data chart (docs/LEARN-FRAMEWORK.md D111 §5.2, phase L3) — daily closes
// from the same Bar cache the rest of the app charts with, self-warming on first render
// (the chess.ts refresh-on-miss pattern). `annotate: "biggest-gap"` finds the largest
// overnight close-to-close jump IN the fetched window and pins it — computed from the
// data, so the annotation stays true as the window rolls forward (an authored date would
// rot). Honest stamp always; honest empty state if the cache can't serve; a lesson never
// falls over on its live parts.

const W = 720;
const H = 210;
const M = { top: 18, right: 20, bottom: 24, left: 56 };
const IW = W - M.left - M.right;
const IH = H - M.top - M.bottom;

const NICE_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric" });
const money = (c: number) => `$${Math.floor(c / 100)}${c >= 10_000_00 ? "" : "." + String(c % 100).padStart(2, "0")}`;

function Shell({ title, children, stamp }: { title: string; children: React.ReactNode; stamp: string }) {
  return (
    <div className="mt-4 rounded-xl border border-teal-400/10 bg-teal-400/[0.02] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-teal-300/70">{title}</div>
        <div className="text-[10px] text-teal-200/35">{stamp}</div>
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

export default async function LearnChart({ spec }: { spec: LearnChartSpec }) {
  let closes: { date: Date; closeCents: number }[] = [];
  try {
    closes = await getCloses(spec.symbol, spec.days);
    if (closes.length < 8) {
      await refreshBars([spec.symbol], "1y");
      closes = await getCloses(spec.symbol, spec.days);
    }
  } catch {
    closes = [];
  }

  if (closes.length < 8) {
    return (
      <Shell title={spec.label} stamp="live chart">
        <p className="text-xs text-teal-200/50">
          No chart data for {spec.symbol} yet — the price cache warms nightly, and this chart appears the moment it has history.
        </p>
      </Shell>
    );
  }

  const min = Math.min(...closes.map((c) => c.closeCents));
  const max = Math.max(...closes.map((c) => c.closeCents));
  const pad = Math.max(1, Math.round((max - min) * 0.08));
  const lo = min - pad;
  const hi = max + pad;
  const X = (i: number) => M.left + (i / (closes.length - 1)) * IW;
  const Y = (c: number) => M.top + IH - ((c - lo) / (hi - lo)) * IH;
  const path = closes.map((c, i) => `${X(i)},${Y(c.closeCents)}`).join(" ");

  // The largest overnight repricing in the window — the gap lesson's live exhibit.
  let gap: { i: number; bps: number } | null = null;
  if (spec.annotate === "biggest-gap") {
    for (let i = 1; i < closes.length; i++) {
      const prev = closes[i - 1].closeCents;
      if (prev <= 0) continue;
      const bps = Math.round(((closes[i].closeCents - prev) * 10000) / prev);
      if (!gap || Math.abs(bps) > Math.abs(gap.bps)) gap = { i, bps };
    }
    if (gap && Math.abs(gap.bps) < 150) gap = null; // under 1.5% isn't a story
  }

  const yTicks = [lo + (hi - lo) * 0.15, lo + (hi - lo) * 0.5, lo + (hi - lo) * 0.85].map(Math.round);
  const first = closes[0];
  const last = closes[closes.length - 1];

  return (
    <Shell title={spec.label} stamp={`daily closes · as of ${NICE_DAY.format(last.date)}`}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`${spec.symbol} daily closes over the last ${closes.length} trading days, from ${money(first.closeCents)} to ${money(last.closeCents)}${gap ? `, with its biggest overnight move (${(gap.bps / 100).toFixed(1)}%) marked` : ""}.`}
      >
        {yTicks.map((v) => (
          <g key={v} className="text-teal-400/15">
            <line x1={M.left} y1={Y(v)} x2={W - M.right} y2={Y(v)} stroke="currentColor" strokeWidth={1} />
            <text x={M.left - 8} y={Y(v)} textAnchor="end" dominantBaseline="middle" fill="currentColor" className="text-[9.5px] tabular-nums text-teal-200/45">
              {money(v)}
            </text>
          </g>
        ))}
        <text x={M.left} y={H - 8} fill="currentColor" className="text-[9.5px] text-teal-200/45">
          {NICE_DAY.format(first.date)}
        </text>
        <text x={W - M.right} y={H - 8} textAnchor="end" fill="currentColor" className="text-[9.5px] text-teal-200/45">
          {NICE_DAY.format(last.date)}
        </text>
        <polyline points={path} fill="none" stroke="var(--spark-up)" strokeWidth={2} />
        {gap ? (
          <g className="text-amber-300/90">
            <circle cx={X(gap.i)} cy={Y(closes[gap.i].closeCents)} r={5} fill="none" stroke="currentColor" strokeWidth={1.8} />
            <text
              x={Math.min(Math.max(X(gap.i), M.left + 90), W - M.right - 90)}
              y={Y(closes[gap.i].closeCents) + (Y(closes[gap.i].closeCents) < M.top + 40 ? 24 : -14)}
              textAnchor="middle"
              fill="currentColor"
              paintOrder="stroke"
              stroke="var(--card-bg)"
              strokeWidth={5}
              strokeLinejoin="round"
              className="text-[10px] font-semibold"
            >
              {gap.bps > 0 ? "+" : ""}
              {(gap.bps / 100).toFixed(1)}% overnight — {NICE_DAY.format(closes[gap.i].date)}
            </text>
          </g>
        ) : null}
      </svg>
    </Shell>
  );
}
