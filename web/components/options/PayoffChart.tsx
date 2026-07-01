"use client";

import { useMemo, useRef, useState } from "react";
import { payoffCurve, pnlAt, type Leg } from "@/lib/options/payoff";

// The payoff diagram — profit/loss across every underlying price (docs/OPTIONS-PORTAL.md). Inline SVG,
// no charting lib. Fixed-aspect viewBox so the axis <text> stays crisp (unlike PriceChart's stretched
// viewBox); hover crosshair modeled on PriceChart. The bold zero line + break-even dots + the shaded
// profit (up) / loss (down) regions are the whole point — read the shape at a glance. Themed via
// var(--spark-up/down) and teal classes only — no hardcoded hex.
const W = 760;
const H = 380;
const PAD = { l: 60, r: 16, t: 18, b: 30 };

const fmtDollars = (cents: number) => {
  const v = cents / 100;
  const a = Math.abs(v);
  const s = a >= 1000 ? `$${(a / 1000).toFixed(a >= 10000 ? 0 : 1)}k` : `$${a.toFixed(a < 10 ? 2 : 0)}`;
  return v < 0 ? `−${s}` : s;
};
const fmtSignedDollars = (cents: number) => (cents >= 0 ? "+" : "−") + fmtDollars(Math.abs(cents)).replace("−", "");

export default function PayoffChart({
  legs,
  spotCents,
  dteNow,
  breakevens,
  expiryLabel = "at expiry",
}: {
  legs: Leg[];
  spotCents: number;
  dteNow: number;
  breakevens: number[];
  expiryLabel?: string;
}) {
  const ref = useRef<SVGSVGElement | null>(null);
  const [hoverSpot, setHoverSpot] = useState<number | null>(null);

  const curve = useMemo(() => payoffCurve(legs, spotCents, dteNow), [legs, spotCents, dteNow]);
  const { lo, hi, expiry, today } = curve;

  const { ymin, ymax } = useMemo(() => {
    const ps = expiry.map((d) => d.p).concat(today ? today.map((d) => d.p) : []);
    let mn = Math.min(0, ...ps);
    let mx = Math.max(0, ...ps);
    const pad = (mx - mn) * 0.12 || 100;
    mn -= pad;
    mx += pad;
    return { ymin: mn, ymax: mx };
  }, [expiry, today]);

  const xOf = (s: number) => PAD.l + ((s - lo) / (hi - lo || 1)) * (W - PAD.l - PAD.r);
  const yOf = (p: number) => PAD.t + ((ymax - p) / (ymax - ymin || 1)) * (H - PAD.t - PAD.b);
  const y0 = yOf(0);

  const line = (pts: { s: number; p: number }[]) => pts.map((d, i) => `${i ? "L" : "M"}${xOf(d.s).toFixed(1)} ${yOf(d.p).toFixed(1)}`).join(" ");
  // Fill between the at-expiry curve (clamped to one side of zero) and the baseline.
  const area = (side: "up" | "down") => {
    const top = expiry.map((d) => `L${xOf(d.s).toFixed(1)} ${yOf(side === "up" ? Math.max(d.p, 0) : Math.min(d.p, 0)).toFixed(1)}`);
    const back = [...expiry].reverse().map((d) => `L${xOf(d.s).toFixed(1)} ${y0.toFixed(1)}`);
    return `M${xOf(expiry[0].s).toFixed(1)} ${y0.toFixed(1)} ${top.join(" ")} ${back.join(" ")} Z`;
  };

  // X ticks: lo, the strikes, hi — spaced so labels never stack. Spot is NOT a bottom tick (it's the
  // "now $…" marker at the top), so a $100 spot and a $105 strike don't print on top of each other.
  const strikes = [...new Set(legs.filter((l) => l.kind !== "STOCK").map((l) => (l as { strikeCents: number }).strikeCents))];
  const rawTicks = [...new Set([lo, ...strikes, hi].map((v) => Math.round(v)))].filter((v) => v >= lo && v <= hi).sort((a, b) => a - b);
  const MIN_TICK_GAP = 52; // viewBox units between adjacent labels
  const xTicks: number[] = [];
  for (const t of rawTicks) {
    if (xTicks.length === 0 || xOf(t) - xOf(xTicks[xTicks.length - 1]) >= MIN_TICK_GAP) xTicks.push(t);
  }
  const hiTick = rawTicks[rawTicks.length - 1];
  if (xTicks.length && xTicks[xTicks.length - 1] !== hiTick) {
    // Keep the right edge: replace the last kept tick if it's too close, else append.
    if (xOf(hiTick) - xOf(xTicks[xTicks.length - 1]) < MIN_TICK_GAP) xTicks[xTicks.length - 1] = hiTick;
    else xTicks.push(hiTick);
  }

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = (e.clientX - rect.left) / rect.width;
    const vbX = ratio * W;
    const s = lo + ((vbX - PAD.l) / (W - PAD.l - PAD.r)) * (hi - lo);
    setHoverSpot(Math.max(lo, Math.min(hi, s)));
  };

  const hoverExp = hoverSpot != null ? pnlAt(legs, hoverSpot, 0) : null;
  const hoverToday = hoverSpot != null && today ? pnlAt(legs, hoverSpot, dteNow) : null;

  return (
    <div className="relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: "auto" }}
        onMouseMove={onMove}
        onMouseLeave={() => setHoverSpot(null)}
        role="img"
        aria-label="Option strategy payoff diagram"
      >
        {/* profit / loss shading */}
        <path d={area("up")} fill="var(--spark-up)" opacity={0.13} />
        <path d={area("down")} fill="var(--spark-down)" opacity={0.13} />

        {/* y-axis gridlines + labels */}
        {[ymax, (ymax + ymin) / 2, 0, ymin].map((v, i) => (
          <g key={i}>
            <line x1={PAD.l} y1={yOf(v)} x2={W - PAD.r} y2={yOf(v)} stroke="currentColor" className="text-teal-400/10" strokeWidth={1} />
            <text x={PAD.l - 6} y={yOf(v) + 3} textAnchor="end" className="fill-teal-200/40 text-[10px] tabular-nums">
              {fmtSignedDollars(v)}
            </text>
          </g>
        ))}
        {/* bold break-even baseline (P/L = 0) */}
        <line x1={PAD.l} y1={y0} x2={W - PAD.r} y2={y0} stroke="currentColor" className="text-teal-200/40" strokeWidth={1.5} />

        {/* x ticks */}
        {xTicks.map((s, i) => (
          <text key={i} x={xOf(s)} y={H - PAD.b + 16} textAnchor="middle" className="fill-teal-200/40 text-[10px] tabular-nums">
            {fmtDollars(s)}
          </text>
        ))}

        {/* current spot marker */}
        <line x1={xOf(spotCents)} y1={PAD.t} x2={xOf(spotCents)} y2={H - PAD.b} stroke="currentColor" className="text-teal-300/40" strokeWidth={1} strokeDasharray="3 3" />
        <text x={xOf(spotCents)} y={PAD.t - 5} textAnchor="middle" className="fill-teal-300/70 text-[10px]">
          now {fmtDollars(spotCents)}
        </text>

        {/* the "today" (pre-expiry, modeled) curve */}
        {today ? <path d={line(today)} fill="none" stroke="currentColor" className="text-teal-300/50" strokeWidth={1.5} strokeDasharray="4 3" /> : null}
        {/* the at-expiry payoff line */}
        <path d={line(expiry)} fill="none" stroke="currentColor" className="text-teal-100" strokeWidth={2} />

        {/* break-even dots */}
        {breakevens.filter((b) => b >= lo && b <= hi).map((b, i) => (
          <g key={i}>
            <circle cx={xOf(b)} cy={y0} r={3.5} className="fill-teal-200" />
            <text x={xOf(b)} y={y0 - 7} textAnchor="middle" className="fill-teal-200/70 text-[10px] tabular-nums">
              {fmtDollars(b)}
            </text>
          </g>
        ))}

        {/* hover crosshair */}
        {hoverSpot != null ? (
          <line x1={xOf(hoverSpot)} y1={PAD.t} x2={xOf(hoverSpot)} y2={H - PAD.b} stroke="currentColor" className="text-teal-200/25" strokeWidth={1} />
        ) : null}
      </svg>

      {/* hover readout (HTML overlay — crisp text, themed) */}
      {hoverSpot != null && hoverExp != null ? (
        <div className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2 rounded-lg border border-[color:var(--card-border)] bg-[var(--field-bg)] px-3 py-1.5 text-[11px] shadow-lg">
          <span className="text-teal-200/60">at </span>
          <span className="font-semibold tabular-nums text-teal-50">{fmtDollars(hoverSpot)}</span>
          <span className="ml-2 text-teal-200/60">expiry </span>
          <span className={`font-semibold tabular-nums ${hoverExp >= 0 ? "text-emerald-300" : "text-red-300"}`}>{fmtSignedDollars(hoverExp)}</span>
          {hoverToday != null ? (
            <>
              <span className="ml-2 text-teal-200/60">today </span>
              <span className={`font-semibold tabular-nums ${hoverToday >= 0 ? "text-emerald-300" : "text-red-300"}`}>{fmtSignedDollars(hoverToday)}</span>
            </>
          ) : null}
        </div>
      ) : null}

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-teal-200/40">
        <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-teal-100" /> {expiryLabel}</span>
        {today ? <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-teal-300/50" style={{ borderTop: "1px dashed" }} /> today ({dteNow}d to go, modeled)</span> : null}
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-teal-200" /> break-even</span>
      </div>
    </div>
  );
}
