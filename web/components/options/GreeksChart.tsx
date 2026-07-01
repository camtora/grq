"use client";

import { useMemo, useState } from "react";
import Term from "@/components/Term";
import { spotDomain, type Leg } from "@/lib/options/payoff";
import { netGreeks, type GreekLeg } from "@/lib/options/greeks";

// Greeks-vs-price visualizer (Phase 5, docs/OPTIONS-PORTAL.md). Plots a chosen Greek across every
// underlying price so you can SEE how the position reacts — delta's S-curve, gamma peaking at the
// money, theta's bleed, vega's tent. Educational; reuses netGreeks. Themed SVG, no hardcoded hex.
const W = 720;
const H = 240;
const PAD = { l: 58, r: 14, t: 14, b: 26 };

type GreekKey = "delta" | "gamma" | "theta" | "vega";
const GREEKS: { key: GreekKey; label: string; unit: string; money: boolean }[] = [
  { key: "delta", label: "Delta", unit: "share-equiv (per $1 move)", money: false },
  { key: "gamma", label: "Gamma", unit: "Δ change per $1 move", money: false },
  { key: "theta", label: "Theta", unit: "$ per day", money: true },
  { key: "vega", label: "Vega", unit: "$ per +1% IV", money: true },
];

const fmtPrice = (cents: number) => "$" + (cents / 100).toLocaleString("en-US", { maximumFractionDigits: cents < 1000 ? 2 : 0 });

export default function GreeksChart({ legs, spotCents, dteNow }: { legs: Leg[]; spotCents: number; dteNow: number }) {
  const [greek, setGreek] = useState<GreekKey>("delta");
  const meta = GREEKS.find((g) => g.key === greek)!;

  const greekLegs = useMemo<GreekLeg[]>(
    () => legs.map((l) => (l.kind === "STOCK" ? { kind: "STOCK", action: l.action, qty: l.qty } : { kind: l.kind, action: l.action, qty: l.qty, strikeCents: l.strikeCents, multiplier: l.multiplier, ivFrac: l.ivFrac, daysLeft: dteNow })),
    [legs, dteNow],
  );

  const { lo, hi, pts, ymin, ymax, atSpot } = useMemo(() => {
    const { lo, hi } = spotDomain(legs, spotCents);
    const N = 120;
    const step = (hi - lo) / N;
    const pts: { s: number; v: number }[] = [];
    for (let i = 0; i <= N; i++) {
      const s = lo + i * step;
      pts.push({ s, v: netGreeks(greekLegs, Math.round(s))[greek] });
    }
    const vs = pts.map((p) => p.v);
    let ymin = Math.min(0, ...vs);
    let ymax = Math.max(0, ...vs);
    const pad = (ymax - ymin) * 0.12 || 1;
    ymin -= pad;
    ymax += pad;
    return { lo, hi, pts, ymin, ymax, atSpot: netGreeks(greekLegs, spotCents)[greek] };
  }, [greekLegs, legs, spotCents, greek]);

  const xOf = (s: number) => PAD.l + ((s - lo) / (hi - lo || 1)) * (W - PAD.l - PAD.r);
  const yOf = (v: number) => PAD.t + ((ymax - v) / (ymax - ymin || 1)) * (H - PAD.t - PAD.b);
  const y0 = yOf(0);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${xOf(p.s).toFixed(1)} ${yOf(p.v).toFixed(1)}`).join(" ");
  const fmtV = (v: number) => (meta.money ? `${v >= 0 ? "" : "−"}$${Math.abs(v).toFixed(Math.abs(v) < 10 ? 1 : 0)}` : v.toFixed(Math.abs(v) < 5 ? 2 : 0));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-teal-300/70">Greeks across price</div>
        <div className="flex gap-1">
          {GREEKS.map((g) => (
            <button key={g.key} type="button" onClick={() => setGreek(g.key)} className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-colors ${greek === g.key ? "border-teal-400/40 bg-teal-400/10 text-teal-100" : "border-teal-400/10 text-teal-300/60 hover:bg-teal-400/10"}`}>
              <Term k={g.key}>{g.label}</Term>
            </button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: "auto" }} role="img" aria-label={`${meta.label} across underlying price`}>
        {[ymax, (ymax + ymin) / 2, 0, ymin].map((v, i) => (
          <g key={i}>
            <line x1={PAD.l} y1={yOf(v)} x2={W - PAD.r} y2={yOf(v)} stroke="currentColor" className="text-teal-400/10" strokeWidth={1} />
            <text x={PAD.l - 6} y={yOf(v) + 3} textAnchor="end" className="fill-teal-200/40 text-[10px] tabular-nums">{fmtV(v)}</text>
          </g>
        ))}
        <line x1={PAD.l} y1={y0} x2={W - PAD.r} y2={y0} stroke="currentColor" className="text-teal-200/30" strokeWidth={1.25} />
        {[lo, spotCents, hi].map((s, i) => (
          <text key={i} x={xOf(s)} y={H - PAD.b + 15} textAnchor="middle" className="fill-teal-200/40 text-[10px] tabular-nums">{fmtPrice(s)}</text>
        ))}
        {/* current spot marker */}
        <line x1={xOf(spotCents)} y1={PAD.t} x2={xOf(spotCents)} y2={H - PAD.b} stroke="currentColor" className="text-teal-300/40" strokeWidth={1} strokeDasharray="3 3" />
        <circle cx={xOf(spotCents)} cy={yOf(atSpot)} r={3.5} className="fill-teal-200" />
        <path d={path} fill="none" stroke="currentColor" className="text-teal-100" strokeWidth={2} />
      </svg>

      <p className="text-[10px] text-teal-200/45">
        <span className="font-semibold text-teal-200/70">{meta.label}</span> ({meta.unit}) across the underlying price, at {dteNow}d to expiry. At the current price it&apos;s <span className="tabular-nums text-teal-100">{fmtV(atSpot)}</span>.
      </p>
    </div>
  );
}
