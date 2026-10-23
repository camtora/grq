import Term from "@/components/Term";
import type { FinancialsView } from "@/lib/financials/view";
import { growth, type Growth } from "@/lib/financials/derive";
import { bigMoney, epsMoney, growthText, growthTone, monthLabel } from "@/lib/financials/format";

// D140 — "What analysts expect", each forecast in dollar sentences against something we already know
// (Cam's pick, display round 3, 2026-10-23): next quarter vs the same quarter last year, a year vs the
// year before it (derive.estimateBaseline), and the year after next — no reported year yet — vs the
// forecast for the year before it. Under each year: how the forecast has moved over 30 and 90 days,
// once our own snapshot history reaches back that far (FMP keeps none).

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

export default function EstimatesCompared({ v }: { v: Company }) {
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
            {key !== "q" && <Revisions t={t} financial={v.financial} />}
          </div>
        );
      })}
    </div>
  );
}

/** "Over 30 days the forecast moved…" — only once there's history to measure; until then the panel's
 *  footer says when it starts. */
function Revisions({ t, financial }: { t: Target; financial: boolean }) {
  const parts = ([30, 90] as const)
    .map((d) => [d, d === 30 ? t.rev30 : t.rev90] as const)
    .filter(([, r]) => r.kind === "ok");
  if (parts.length === 0) return null;
  return (
    <p className="mt-0.5 text-[11px] text-teal-200/55">
      Forecast moves:{" "}
      {parts.map(([d, r], i) => (
        <span key={d}>
          {i > 0 && " · "}
          {d} days, EPS <span className={tone(r.kind === "ok" ? r.eps : null)}>{growthText(r.kind === "ok" ? r.eps : null)}</span>
          {!financial && (
            <>
              , sales <span className={tone(r.kind === "ok" ? r.revenue : null)}>{growthText(r.kind === "ok" ? r.revenue : null)}</span>
            </>
          )}
        </span>
      ))}{" "}
      (<Term k="estimate-revision">revisions</Term>)
    </p>
  );
}
