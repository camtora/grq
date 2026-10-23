import Term from "@/components/Term";
import type { FinancialsView } from "@/lib/financials/view";
import { growth, type Growth } from "@/lib/financials/derive";
import { bigMoney, epsMoney, growthText, growthTone, monthLabel } from "@/lib/financials/format";

// D140 display loop, round 3 — two alternatives to the plain-numbers "What analysts expect" panel.
// Both ground each forecast against something we already know: next quarter vs the same quarter last
// year, a year vs the year before it (derive.estimateBaseline), or — for the year after next, which has
// no reported year yet — vs the forecast for the year before it. COMPARED says it in dollar sentences;
// RANGES draws how far apart the analysts are, with last year's actual as a tick on the same scale.

type Company = Extract<FinancialsView, { kind: "company" }>;
type Est = NonNullable<Company["estimates"]>;
type Target = NonNullable<Est["nextYear"]>;

const B = ({ children }: { children: React.ReactNode }) => <strong className="font-semibold text-teal-50">{children}</strong>;
const tone = (g: Growth | null) => (growthTone(g) === "up" ? "text-emerald-400" : growthTone(g) === "down" ? "text-red-400" : "text-teal-200/60");

type Slot = { key: string; title: string; t: Target; vsLabel: string; vsRevenue: number | null; vsEps: number | null };

/** The three forecasts in reading order, each with what it's measured against. */
function slots(e: Est): Slot[] {
  const out: Slot[] = [];
  const add = (key: string, t: Target | null, kind: "quarter" | "year", prev: Target | null) => {
    if (!t) return;
    const title = kind === "quarter" ? `The quarter to ${monthLabel(t.targetEnd)}` : `The year to ${monthLabel(t.targetEnd)}`;
    if (t.base) {
      out.push({ key, title, t, vsLabel: kind === "quarter" ? "the same quarter last year" : "the year before", vsRevenue: t.base.revenue, vsEps: t.base.epsAvg4 });
    } else if (prev) {
      out.push({ key, title, t, vsLabel: "the forecast for the year before", vsRevenue: prev.revenueAvg, vsEps: prev.epsAvg4 });
    } else {
      out.push({ key, title, t, vsLabel: "", vsRevenue: null, vsEps: null });
    }
  };
  add("q", e.nextQuarter, "quarter", null);
  add("y1", e.nextYear, "year", null);
  add("y2", e.followingYear, "year", e.nextYear);
  return out;
}

const analysts = (t: Target) =>
  t.analysts != null ? `${t.analysts} analyst${t.analysts === 1 ? "" : "s"}${t.analysts <= 2 ? " (a thin read)" : ""}` : "";

export function EstimatesCompared({ v }: { v: Company }) {
  const e = v.estimates!;
  const c = v.currency;
  return (
    <div className="space-y-3">
      {slots(e).map(({ key, title, t, vsLabel, vsRevenue, vsEps }) => {
        const gRev = growth(t.revenueAvg, vsRevenue);
        const gEps = growth(t.epsAvg4, vsEps);
        const dRev = t.revenueAvg != null && vsRevenue != null ? t.revenueAvg - vsRevenue : null;
        const showRev = !v.financial && t.revenueAvg != null;
        return (
          <div key={key} className="border-b border-teal-400/10 pb-3 last:border-0 last:pb-0">
            <div className="mb-0.5 text-[11px] font-bold uppercase tracking-wider text-teal-300/70">{title}</div>
            <p className="leading-snug text-teal-100/85">
              {showRev && (
                <>
                  Sales of <B>{bigMoney(t.revenueAvg, c)}</B>
                  {dRev != null && gRev?.kind === "ok" ? (
                    <>
                      , <B>{bigMoney(Math.abs(dRev), c)}</B> {dRev >= 0 ? "more" : "less"} than {vsLabel} (<span className={tone(gRev)}>{growthText(gRev)}</span>)
                    </>
                  ) : null}
                  .{" "}
                </>
              )}
              <Term k="eps">Earnings per share</Term> of <B>{epsMoney(t.epsAvg4, c)}</B>
              {vsEps != null && (
                <>
                  , against {epsMoney(vsEps, c)} for {vsLabel}
                  {gEps?.kind === "ok" && (
                    <>
                      {" "}
                      (<span className={tone(gEps)}>{growthText(gEps)}</span>)
                    </>
                  )}
                </>
              )}
              .
            </p>
            <p className="mt-0.5 text-[11px] text-teal-200/45">
              {analysts(t)}
              {showRev && t.revenueLow != null && t.revenueHigh != null && (
                <>
                  {" "}
                  · the most cautious says {bigMoney(t.revenueLow, c)}, the boldest {bigMoney(t.revenueHigh, c)}
                </>
              )}
              {!showRev && t.epsLow4 != null && t.epsHigh4 != null && (
                <>
                  {" "}
                  · from {epsMoney(t.epsLow4, c)} to {epsMoney(t.epsHigh4, c)} a share
                </>
              )}
            </p>
          </div>
        );
      })}
    </div>
  );
}

/** One forecast as a range: the bar spans the lowest to the highest analyst, the dot is the average,
 *  the tick is what it's compared with — all on one scale, so "how far from last year" and "how much
 *  they disagree" are read together. */
function RangeBar({ low, avg, high, vs, fmt, vsLabel }: { low: number; avg: number; high: number; vs: number | null; fmt: (n: number) => string; vsLabel: string }) {
  const vsShort = vsLabel.startsWith("the forecast") ? "year before (forecast)" : "a year earlier";
  const lo = Math.min(low, vs ?? low);
  const hi = Math.max(high, vs ?? high);
  const span = hi - lo || 1;
  const pct = (x: number) => `${((x - lo) / span) * 100}%`;
  return (
    <div className="mt-1">
      <div className="relative h-5">
        <div className="absolute top-1/2 h-px w-full -translate-y-1/2 bg-teal-400/15" />
        <div className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-teal-400/35" style={{ left: pct(low), width: `calc(${pct(high)} - ${pct(low)})` }} />
        <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal-300" style={{ left: pct(avg) }} title={`average ${fmt(avg)}`} />
        {vs != null && (
          <div className="absolute top-0 h-5 w-0.5 -translate-x-1/2 bg-amber-300" style={{ left: pct(vs) }} title={`${vsLabel}: ${fmt(vs)}`} />
        )}
      </div>
      <div className="flex justify-between gap-2 text-[10px] tabular-nums text-teal-200/45">
        <span className="text-amber-300">{vs != null ? `${vsShort}: ${fmt(vs)}` : ""}</span>
        <span className="text-teal-100/80">
          avg <span className="font-semibold text-teal-50">{fmt(avg)}</span>
        </span>
        <span>
          {fmt(low)}–{fmt(high)}
        </span>
      </div>
    </div>
  );
}

export function EstimatesRanges({ v }: { v: Company }) {
  const e = v.estimates!;
  const c = v.currency;
  return (
    <div className="space-y-4">
      {slots(e).map(({ key, title, t, vsLabel, vsRevenue, vsEps }) => {
        const showRev = !v.financial && t.revenueAvg != null && t.revenueLow != null && t.revenueHigh != null;
        const showEps = t.epsAvg4 != null && t.epsLow4 != null && t.epsHigh4 != null;
        return (
          <div key={key}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-teal-300/70">{title}</span>
              <span className="text-[10px] text-teal-200/40">{analysts(t)}</span>
            </div>
            {showRev && (
              <div className="mt-1">
                <div className="text-[11px] text-teal-200/55">Sales</div>
                <RangeBar low={t.revenueLow!} avg={t.revenueAvg!} high={t.revenueHigh!} vs={vsRevenue} fmt={(n) => bigMoney(n, c)} vsLabel={vsLabel} />
              </div>
            )}
            {showEps && (
              <div className="mt-1">
                <div className="text-[11px] text-teal-200/55">
                  <Term k="eps">EPS</Term>
                </div>
                <RangeBar low={t.epsLow4!} avg={t.epsAvg4!} high={t.epsHigh4!} vs={vsEps} fmt={(n) => epsMoney(n, c)} vsLabel={vsLabel} />
              </div>
            )}
          </div>
        );
      })}
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-teal-200/45">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-5 rounded-full bg-teal-400/35" /> lowest to highest analyst
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-teal-300" /> average
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-0.5 bg-amber-300" /> a year earlier (for the year after next: its forecast)
        </span>
      </p>
    </div>
  );
}
