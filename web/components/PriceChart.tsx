"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { money } from "@/lib/money";

// The detailed price history with a timeframe picker + a hover tooltip. All daily
// closes are passed in from the server (already loaded for the page), so switching
// ranges is a client-side slice — no refetch. Hovering reads the nearest session
// to the cursor's point in time and shows its date + close on a crosshair.
//
// SVG note: the chart uses a 0..100 × 0..100 viewBox with preserveAspectRatio="none"
// (stretches to fill), so the data and the CSS overlay share ONE coordinate system —
// the crosshair lands exactly on the line. vectorEffect="non-scaling-stroke" keeps
// strokes crisp despite that non-uniform stretch.

type Pt = { t: number; c: number; session?: "pre" | "regular" | "post" }; // t = ms epoch · c = close cents

// Extended-hours (pre/post-market) line colour — a muted, theme-aware grey so after-hours
// movement reads as context next to the solid up/down regular session. Only 1D carries
// session tags; daily ranges + the NAV tape have none, so they render exactly as before.
const EXT_STROKE = "color-mix(in oklab, var(--body-fg) 38%, transparent)";

// `days` slices the daily series; `intraday` is special-cased (fetched on demand). `null`
// days = YTD. 1D draws today's intraday line; 1W..1Y slice the daily closes.
const RANGES: { key: string; days: number | null; intraday?: boolean }[] = [
  { key: "1D", days: null, intraday: true },
  { key: "1W", days: 7 },
  { key: "1M", days: 30 },
  { key: "3M", days: 91 },
  { key: "6M", days: 182 },
  { key: "YTD", days: null },
  { key: "1Y", days: 366 },
];

// `daily` (default) is the stock-page chart: a month/year date axis with a range
// picker. `intraday` is the Today NAV tape: one session, an HH:MM time axis, no
// range picker — same crosshair/tooltip UX so a dip can be read off to the minute.
// `bare` drops the outer card + header so a caller can embed just the plot inside
// its own card (the Today tape keeps its "opened → now · vs XIC" header).
export default function PriceChart({
  data,
  symbol,
  currency = "CAD",
  mode = "daily",
  label = "Price",
  bare = false,
  heightClass = "h-56",
  defaultRange = "1Y",
  windowStart,
  windowEnd,
  live = false,
}: {
  data: Pt[];
  symbol?: string; // needed for the "1D" range (lazy intraday fetch)
  currency?: string | null;
  mode?: "daily" | "intraday";
  label?: string;
  bare?: boolean;
  heightClass?: string; // plot height — default h-56; the stock page halves it to h-28
  defaultRange?: string; // which range button is selected on first paint (daily mode)
  // When true AND viewing an intraday session, the resting dot gets a pulsing halo to
  // mark it as a live, advancing print (the NAV tape today / the stock 1D during hours).
  // Callers own the liveness decision (market-open, today-vs-archive); we only animate.
  live?: boolean;
  // Intraday only: pin the x-axis to a FIXED time window (epoch ms) instead of stretching
  // the data edge-to-edge. The NAV tape passes the 9:30→16:00 session so the line sits at
  // its real clock-time and grows rightward into empty space as the day goes on.
  windowStart?: number;
  windowEnd?: number;
}) {
  const [range, setRange] = useState(defaultRange);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // "1D" needs today's intraday line, which isn't in the daily `data`. Fetch it the first
  // time 1D is picked (cached in state thereafter). null = not loaded; [] = loaded-but-empty.
  const [intraday, setIntraday] = useState<Pt[] | null>(null);
  const [intradayLoading, setIntradayLoading] = useState(false);
  useEffect(() => {
    if (range !== "1D" || !symbol || intraday !== null || intradayLoading) return;
    setIntradayLoading(true);
    fetch(`/api/intraday?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => r.json())
      .then((d) => setIntraday(Array.isArray(d.points) ? d.points : []))
      .catch(() => setIntraday([]))
      .finally(() => setIntradayLoading(false));
  }, [range, symbol, intraday, intradayLoading]);

  // Intraday view: the NAV tape (mode), or the stock chart's "1D" range (today's fetched
  // line). Either way, an HH:MM time axis instead of dates.
  const isIntra = mode === "intraday" || range === "1D";

  // Slice to the selected window; fall back to the full series if a short window
  // would leave us with fewer than two points to draw. "1D" uses the fetched intraday line.
  const pts = useMemo(() => {
    if (mode === "intraday") return data; // one session — never sliced by range
    if (range === "1D") return intraday ?? []; // [] while loading / empty → guarded below
    const last = data[data.length - 1]?.t ?? Date.now();
    let sliced = data;
    if (range === "YTD") {
      const jan1 = new Date(new Date(last).getFullYear(), 0, 1).getTime();
      sliced = data.filter((p) => p.t >= jan1);
    } else {
      const days = RANGES.find((r) => r.key === range)?.days ?? null;
      if (days) {
        const cutoff = last - days * 86_400_000;
        sliced = data.filter((p) => p.t >= cutoff);
      }
    }
    return sliced.length >= 2 ? sliced : data;
  }, [data, range, mode, intraday]);

  const n = pts.length;
  const hasData = n >= 2; // 1D can briefly have 0 points while the intraday fetch is in flight
  const min = hasData ? Math.min(...pts.map((p) => p.c)) : 0; // y-axis spans ALL bars (incl. pre/post)
  const max = hasData ? Math.max(...pts.map((p) => p.c)) : 0;
  const span = max - min || 1;

  // Extended-hours awareness (1D only). The regular session is one contiguous block in the
  // middle; pre is before it, post after. The headline % + up/down colour track the REGULAR
  // session (the conventional "today" move vs the open), not the pre-market print.
  const regIdx = pts.map((p, i) => ((p.session ?? "regular") === "regular" ? i : -1)).filter((i) => i >= 0);
  const hasExt = pts.some((p) => p.session && p.session !== "regular");
  const firstReg = regIdx[0] ?? -1;
  const lastReg = regIdx[regIdx.length - 1] ?? -1;
  const dir = regIdx.length >= 2 ? regIdx.map((i) => pts[i]) : pts; // points that set the headline direction/%

  const changePct = hasData && dir[0].c > 0 ? (dir[dir.length - 1].c - dir[0].c) / dir[0].c : 0;
  const up = hasData ? dir[dir.length - 1].c >= dir[0].c : true;
  const stroke = up ? "var(--spark-up)" : "var(--spark-down)";

  // Fixed-window mode (the NAV tape): place each point by its real clock-time within
  // [windowStart, windowEnd] instead of stretching the series edge-to-edge, so the line
  // occupies only the elapsed slice of the session and creeps right as the day goes on.
  const useWindow = isIntra && typeof windowStart === "number" && typeof windowEnd === "number" && windowEnd > windowStart;
  const xAt = (t: number) =>
    useWindow ? Math.min(100, Math.max(0, ((t - windowStart!) / (windowEnd! - windowStart!)) * 100)) : 0;
  const xy = (i: number) => ({
    x: useWindow ? xAt(pts[i].t) : n === 1 ? 0 : (i / (n - 1)) * 100,
    y: (1 - (pts[i].c - min) / span) * 100,
  });
  const poly = pts.map((_, i) => { const p = xy(i); return `${p.x.toFixed(2)},${p.y.toFixed(2)}`; }).join(" ");
  // Colour overlay over just the regular session; the grey base line (poly) shows pre/post.
  const polyReg =
    hasExt && firstReg >= 0
      ? Array.from({ length: lastReg - firstReg + 1 }, (_, k) => { const p = xy(firstReg + k); return `${p.x.toFixed(2)},${p.y.toFixed(2)}`; }).join(" ")
      : "";

  const onMove = (e: React.MouseEvent) => {
    const el = wrapRef.current;
    if (!el || n < 2) return;
    const rect = el.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    if (useWindow) {
      // Points are time-positioned, not evenly spaced — snap to the nearest point in time.
      const tTarget = windowStart! + frac * (windowEnd! - windowStart!);
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < n; i++) {
        const d = Math.abs(pts[i].t - tTarget);
        if (d < bestD) { bestD = d; best = i; }
      }
      setHoverIdx(best);
    } else {
      setHoverIdx(Math.round(frac * (n - 1)));
    }
  };

  const hi = hoverIdx != null && hoverIdx >= 0 && hoverIdx < n ? hoverIdx : null;
  const hp = hi != null ? xy(hi) : null;
  // The dot rests on the latest bar (or the hovered one); grey it when that bar is extended-hours.
  const dotIdx = hi ?? (n > 0 ? n - 1 : 0);
  const dotColor = hasData && (pts[dotIdx]?.session ?? "regular") !== "regular" ? EXT_STROKE : stroke;
  // Pulse the resting dot only on a live intraday session, and only when it's parked on the
  // latest print (not while hovering a past point — then you're inspecting history).
  const livePulse = live && isIntra && hi == null;

  const longSpan = hasData && pts[n - 1].t - pts[0].t > 200 * 86_400_000;
  const hhmm = (t: number) =>
    new Date(t).toLocaleTimeString("en-CA", { timeZone: "America/Toronto", hour: "2-digit", minute: "2-digit", hour12: false });
  // Daily bars are stored as "ET trading day at UTC midnight" (see yahoo.ts etDayUtc),
  // so the *UTC* calendar components hold the trading day. Format daily dates in UTC —
  // formatting in any negative-offset zone (incl. the browser's local ET) reads
  // 2026-06-22T00:00:00Z back as June 21 8pm and mislabels the weekday by a day. Intraday
  // points (1D / NAV tape) are real epoch ms, so format those as ET clock time.
  const fmtAxis = (t: number) =>
    isIntra
      ? hhmm(t)
      : new Date(t).toLocaleDateString("en-CA", { timeZone: "UTC", ...(longSpan ? { month: "short", year: "2-digit" } : { month: "short", day: "numeric" }) });
  const fmtFull = (t: number) =>
    isIntra
      ? `${hhmm(t)} ET`
      : new Date(t).toLocaleDateString("en-CA", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" });

  // Keep the tooltip inside the plot near the edges.
  const tipAlign = hp ? (hp.x < 18 ? "left-0 translate-x-0" : hp.x > 82 ? "right-0 translate-x-0" : "-translate-x-1/2") : "";
  const tipLeft = hp ? (hp.x < 18 ? undefined : hp.x > 82 ? undefined : `${hp.x}%`) : undefined;

  const header = (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <div className="flex items-baseline gap-2">
        <span className="text-xs uppercase tracking-wider text-teal-200/50">{label}</span>
        <span className={`text-xs font-semibold tabular-nums ${changePct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
          {changePct >= 0 ? "+" : ""}
          {(changePct * 100).toFixed(1)}%
        </span>
        <span className="text-[11px] text-teal-200/40">{isIntra ? "today" : range === "1Y" ? "past year" : range}</span>
        {isIntra && hasExt && (
          <span className="inline-flex items-center gap-1 text-[10px] text-teal-200/40" title="Pre-/post-market moves, greyed — for tracking, not a regular-session price">
            <span className="inline-block h-[3px] w-3 rounded-full align-middle" style={{ background: EXT_STROKE }} />
            extended hrs
          </span>
        )}
      </div>
      {mode === "daily" && (
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`rounded-md px-2 py-0.5 text-[11px] font-semibold tabular-nums transition-colors ${
                range === r.key ? "bg-teal-400/15 text-teal-200" : "text-teal-200/40 hover:text-teal-200/70"
              }`}
            >
              {r.key}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const chart = !hasData ? (
    <div className={`flex ${heightClass} items-center justify-center text-sm text-teal-200/40`}>
      {range === "1D"
        ? intraday === null || intradayLoading
          ? "Loading today's prices…"
          : "No intraday data for this session yet."
        : "Not enough price history."}
    </div>
  ) : (
    <div className="text-[10px] tabular-nums text-teal-200/40">
        <div className="flex items-stretch">
          <div className={`flex ${heightClass} w-16 shrink-0 flex-col justify-between py-[3px] pr-2 text-right`}>
            <span>{money(max, currency)}</span>
            <span>{money(Math.round((min + max) / 2), currency)}</span>
            <span>{money(min, currency)}</span>
          </div>
          <div
            ref={wrapRef}
            className={`relative ${heightClass} min-w-0 flex-1 cursor-crosshair`}
            onMouseMove={onMove}
            onMouseLeave={() => setHoverIdx(null)}
          >
            {/* The SVG only draws the gridlines + the price line — never the dot. A
                circle here would be stretched into an oval by preserveAspectRatio="none"
                (non-scaling-stroke can't fix a fill), so the dot is an HTML element below. */}
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" role="img" aria-label={mode === "intraday" ? "NAV tape" : "price history"}>
              {[0, 50, 100].map((y) => (
                <line key={y} x1={0} y1={y} x2={100} y2={y} stroke="var(--card-border)" strokeWidth="1" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
              ))}
              {hasExt ? (
                <>
                  {/* Full line greyed (pre/post show as grey context)… */}
                  <polyline points={poly} fill="none" stroke={EXT_STROKE} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  {/* …then the regular session overlaid in the up/down colour (absent before the open). */}
                  {polyReg && <polyline points={polyReg} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
                </>
              ) : (
                <polyline points={poly} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              )}
            </svg>

            {/* A real round dot: on the hovered session, or resting on the latest close.
                When live, a pinging halo radiates behind it to mark the print as live. */}
            <div
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${(hp ?? xy(n - 1)).x}%`, top: `${(hp ?? xy(n - 1)).y}%` }}
            >
              {livePulse && (
                <span
                  className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full opacity-75"
                  style={{ backgroundColor: dotColor }}
                />
              )}
              <span className="relative block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dotColor }} />
            </div>

            {hi != null && (
              <div
                className={`pointer-events-none absolute top-1 z-10 whitespace-nowrap rounded-lg border border-[color:var(--card-border)] bg-[var(--card-bg)] px-2 py-1 shadow-lg ${tipAlign}`}
                style={tipLeft ? { left: tipLeft } : undefined}
              >
                <div className="text-sm font-semibold tabular-nums text-teal-50">{money(pts[hi].c, currency)}</div>
                <div className="text-[10px] text-teal-200/50">{fmtFull(pts[hi].t)}</div>
              </div>
            )}
          </div>
        </div>
        <div className="ml-16 mt-1 flex justify-between">
          {/* Windowed (NAV tape): fixed 9:30 / midday / 16:00 ticks so the axis stays put
              as the line grows. Otherwise: first / mid / last point of the drawn series. */}
          <span>{fmtAxis(useWindow ? windowStart! : pts[0].t)}</span>
          <span>{fmtAxis(useWindow ? (windowStart! + windowEnd!) / 2 : pts[Math.floor((n - 1) / 2)].t)}</span>
          <span>{fmtAxis(useWindow ? windowEnd! : pts[n - 1].t)}</span>
        </div>
      </div>
  );

  // `bare`: just the plot, for a caller that supplies its own card + header
  // (the Today tape). Otherwise the self-contained card with the header on top.
  if (bare) return chart;
  return (
    <div className="mb-6 rounded-2xl border border-[color:var(--card-border)] bg-[var(--card-bg)] p-5">
      {header}
      {chart}
    </div>
  );
}
