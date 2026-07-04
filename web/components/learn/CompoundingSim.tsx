"use client";

import { useMemo, useRef, useState } from "react";
import { money } from "@/lib/money";

// The Learn portal's compounding machine (docs/LEARN-PORTAL.md, D110 Phase 2) — Course 7's
// interactive: monthly contributions compounding at a chosen return over chosen years, with an
// optional fee-drag line showing what an MER quietly eats. Pure client, integer cents. Chart
// follows docs/DESIGN.md + the house chart tokens: var(--spark-up) for the value line, themed
// amber for fees, dashed dim teal for contributions — identity carried by legend + direct
// labels + dash pattern, never colour alone.

const W = 720;
const H = 250;
const M = { top: 14, right: 118, bottom: 26, left: 56 };
const IW = W - M.left - M.right;
const IH = H - M.top - M.bottom;

type YearPoint = { y: number; contrib: number; val: number; valFee: number }; // cents

function series(monthlyCents: number, retPct: number, feePct: number, years: number): YearPoint[] {
  const out: YearPoint[] = [{ y: 0, contrib: 0, val: 0, valFee: 0 }];
  let val = 0;
  let valFee = 0;
  for (let y = 1; y <= years; y++) {
    for (let m = 0; m < 12; m++) {
      val += monthlyCents;
      valFee += monthlyCents;
      val += Math.round((val * retPct) / 1200);
      valFee += Math.round((valFee * (retPct - feePct)) / 1200);
    }
    out.push({ y, contrib: monthlyCents * 12 * y, val, valFee });
  }
  return out;
}

const fmtK = (c: number) => (c >= 100_000_000 ? `$${(c / 100_000_000).toFixed(1)}M` : c >= 100_000 ? `$${Math.round(c / 100_000)}k` : money(c));

function niceStep(raw: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= raw) return m * pow;
  return 10 * pow;
}

export default function CompoundingSim() {
  const [monthly, setMonthly] = useState(200); // dollars
  const [ret, setRet] = useState(7); // % / yr
  const [years, setYears] = useState(25);
  const [fee, setFee] = useState(2); // % / yr MER drag
  const [hover, setHover] = useState<number | null>(null); // year index
  const plotRef = useRef<HTMLDivElement>(null);

  const pts = useMemo(() => series(monthly * 100, ret, fee, years), [monthly, ret, fee, years]);
  const last = pts[pts.length - 1];
  const yMax = Math.max(last.val, last.contrib, 1);
  const yStep = niceStep(yMax / 4);
  const yTicks = [1, 2, 3, 4].map((i) => i * yStep).filter((v) => v <= yMax * 1.02);

  const X = (y: number) => M.left + (y / years) * IW;
  const Y = (c: number) => M.top + IH - (c / yMax) * IH;
  const line = (pick: (p: YearPoint) => number) => pts.map((p) => `${X(p.y)},${Y(pick(p))}`).join(" ");

  // Direct labels at the line ends, nudged apart so they never collide.
  const labels = useMemo(() => {
    const items = [
      { key: "val", y: Y(last.val), text: `at ${ret}%`, cls: "" },
      ...(fee > 0 ? [{ key: "fee", y: Y(last.valFee), text: `after ${fee}% fees`, cls: "fee" }] : []),
      { key: "contrib", y: Y(last.contrib), text: "you put in", cls: "dim" },
    ].sort((a, b) => a.y - b.y);
    for (let i = 1; i < items.length; i++) if (items[i].y - items[i - 1].y < 13) items[i].y = items[i - 1].y + 13;
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pts, fee, ret]);

  const onMove = (e: React.MouseEvent) => {
    const el = plotRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const fx = ((e.clientX - r.left) / r.width) * W;
    const y = Math.round(((fx - M.left) / IW) * years);
    setHover(y >= 0 && y <= years ? y : null);
  };
  const hp = hover !== null ? pts[hover] : null;

  const xTickEvery = years > 30 ? 10 : 5;

  return (
    <div className="mt-4 rounded-xl border border-teal-400/10 bg-teal-400/[0.02] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-teal-300/70">The compounding machine</div>
        {/* Legend — identity is never colour-alone (dash patterns + direct labels back it up). */}
        <div className="flex flex-wrap items-center gap-3 text-[10px] text-teal-200/60">
          <span className="flex items-center gap-1">
            <svg width="18" height="6" aria-hidden>
              <line x1="0" y1="3" x2="18" y2="3" stroke="var(--spark-up)" strokeWidth="2" />
            </svg>
            value at {ret}%
          </span>
          {fee > 0 ? (
            <span className="flex items-center gap-1 text-amber-300/80">
              <svg width="18" height="6" aria-hidden>
                <line x1="0" y1="3" x2="18" y2="3" stroke="currentColor" strokeWidth="2" />
              </svg>
              after {fee}% fees
            </span>
          ) : null}
          <span className="flex items-center gap-1">
            <svg width="18" height="6" aria-hidden className="text-teal-200/50">
              <line x1="0" y1="3" x2="18" y2="3" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" />
            </svg>
            contributions
          </span>
        </div>
      </div>

      <div ref={plotRef} className="relative mt-2" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Portfolio value over time: contributions, compounded value, and value after fees">
          {/* recessive grid + y labels */}
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={M.left} x2={W - M.right} y1={Y(v)} y2={Y(v)} stroke="currentColor" className="text-teal-400/10" strokeWidth="1" />
              <text x={M.left - 6} y={Y(v) + 3} textAnchor="end" fontSize="10" fill="currentColor" className="text-teal-200/50">
                {fmtK(v)}
              </text>
            </g>
          ))}
          <line x1={M.left} x2={W - M.right} y1={M.top + IH} y2={M.top + IH} stroke="currentColor" className="text-teal-400/20" strokeWidth="1" />
          {pts
            .filter((p) => p.y > 0 && p.y % xTickEvery === 0)
            .map((p) => (
              <text key={p.y} x={X(p.y)} y={H - 8} textAnchor="middle" fontSize="10" fill="currentColor" className="text-teal-200/50">
                {p.y}y
              </text>
            ))}

          {/* series — contributions dashed dim, fee line amber, value the house spark token */}
          <polyline points={line((p) => p.contrib)} fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="5 4" className="text-teal-200/40" />
          {fee > 0 ? <polyline points={line((p) => p.valFee)} fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400" /> : null}
          <polyline points={line((p) => p.val)} fill="none" stroke="var(--spark-up)" strokeWidth="2" />

          {/* direct labels at line ends */}
          {labels.map((l) => (
            <text
              key={l.key}
              x={W - M.right + 6}
              y={l.y + 3}
              fontSize="10"
              fill={l.key === "val" ? "var(--spark-up)" : "currentColor"}
              className={l.key === "fee" ? "text-amber-300" : l.key === "contrib" ? "text-teal-200/50" : undefined}
            >
              {l.text}
            </text>
          ))}

          {/* hover crosshair + markers */}
          {hp ? (
            <g>
              <line x1={X(hp.y)} x2={X(hp.y)} y1={M.top} y2={M.top + IH} stroke="currentColor" className="text-teal-200/25" strokeWidth="1" />
              <circle cx={X(hp.y)} cy={Y(hp.val)} r="3.5" fill="var(--spark-up)" />
              {fee > 0 ? <circle cx={X(hp.y)} cy={Y(hp.valFee)} r="3.5" fill="currentColor" className="text-amber-400" /> : null}
              <circle cx={X(hp.y)} cy={Y(hp.contrib)} r="3" fill="currentColor" className="text-teal-200/50" />
            </g>
          ) : null}
        </svg>

        {hp ? (
          <div
            className="pointer-events-none absolute top-2 z-10 rounded-lg border border-teal-400/20 bg-[var(--card-bg)] px-2.5 py-1.5 text-[11px] leading-relaxed shadow-lg"
            style={{ left: `${Math.min(78, Math.max(2, ((X(hp.y) - 40) / W) * 100))}%` }}
          >
            <div className="font-semibold text-teal-50">Year {hp.y}</div>
            <div className="tabular-nums text-teal-200/70">put in {money(hp.contrib)}</div>
            <div className="tabular-nums" style={{ color: "var(--spark-up)" }}>
              value {money(hp.val)}
            </div>
            {fee > 0 ? <div className="tabular-nums text-amber-300">after fees {money(hp.valFee)}</div> : null}
          </div>
        ) : null}
      </div>

      <div className="mt-1 grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            { label: `$${monthly}/month`, min: 50, max: 1000, step: 50, val: monthly, set: setMonthly },
            { label: `${ret}% / year`, min: 0, max: 12, step: 0.5, val: ret, set: setRet },
            { label: `${years} years`, min: 5, max: 40, step: 1, val: years, set: setYears },
            { label: fee > 0 ? `${fee}% fee drag` : "no fees", min: 0, max: 2.5, step: 0.25, val: fee, set: setFee },
          ] as { label: string; min: number; max: number; step: number; val: number; set: (n: number) => void }[]
        ).map((s) => (
          <label key={s.label} className="block text-[11px] text-teal-200/60">
            <span className="font-semibold tabular-nums text-teal-100">{s.label}</span>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={s.val}
              onChange={(e) => s.set(Number(e.target.value))}
              className="mt-1 w-full accent-teal-400"
            />
          </label>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs tabular-nums lg:grid-cols-4">
        <div className="rounded-lg border border-teal-400/10 p-2">
          <div className="text-[10px] uppercase tracking-wider text-teal-200/45">put in</div>
          <div className="font-semibold text-teal-50">{money(last.contrib)}</div>
        </div>
        <div className="rounded-lg border border-teal-400/10 p-2">
          <div className="text-[10px] uppercase tracking-wider text-teal-200/45">end value</div>
          <div className="font-semibold" style={{ color: "var(--spark-up)" }}>
            {money(last.val)}
          </div>
        </div>
        <div className="rounded-lg border border-teal-400/10 p-2">
          <div className="text-[10px] uppercase tracking-wider text-teal-200/45">growth</div>
          <div className="font-semibold text-teal-50">{money(last.val - last.contrib)}</div>
        </div>
        <div className="rounded-lg border border-teal-400/10 p-2">
          <div className="text-[10px] uppercase tracking-wider text-teal-200/45">lost to fees</div>
          <div className="font-semibold text-amber-300">{fee > 0 ? money(last.val - last.valFee) : "—"}</div>
        </div>
      </div>

      <p className="mt-3 text-[10px] text-teal-200/35">
        A smooth {ret}% every year exists nowhere — real returns arrive lumpy (Course 5). The arithmetic still holds over time, which is the
        point.
      </p>
    </div>
  );
}
