import type { FinancialsView } from "@/lib/financials/view";
import type { Growth } from "@/lib/financials/derive";
import { bigMoney, growthText, growthTone, monthLabel } from "@/lib/financials/format";

// D140 display loop, round 4 — two alternatives to the plain split in "Where the money comes from".
// GROWTH answers the panel's own promise, "which part of the company is doing the growing": each
// segment against the same period a year earlier, in dollars, and its share of the company's change.
// TREND stacks up to eight quarters so a shift in the mix shows. Both stop at a re-cut of the
// segments (derive.segmentCompare / segmentSeries): a same-named segment across a re-cut may not be
// the same business, so it's said plainly and nothing is compared.

type Company = Extract<FinancialsView, { kind: "company" }>;
export type Seg = NonNullable<Company["segments"]["product"]>;

export const SEG_SHADES = ["bg-teal-400/80", "bg-teal-400/55", "bg-teal-400/35", "bg-emerald-400/50", "bg-amber-400/45", "bg-teal-400/20"];

/** FMP passes some region names in capitals ("TAIWAN, PROVINCE OF CHINA") or with a redundant
 *  "Segment" suffix; calm them down. */
export function tidyName(raw: string): string {
  const n = raw.replace(/\s+Segment$/i, ""); // AAPL: "Americas Segment" → "Americas"
  if (n !== n.toUpperCase() || n.length <= 4) return n;
  return n.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\bOf\b/g, "of").replace(/\bAnd\b/g, "and");
}

const B = ({ children }: { children: React.ReactNode }) => <strong className="font-semibold text-teal-50">{children}</strong>;
const tone = (g: Growth | null) => (growthTone(g) === "up" ? "text-emerald-400" : growthTone(g) === "down" ? "text-red-400" : "text-teal-200/60");
const periodWord = (s: { period: string; periodEnd: string }) => `${s.period === "FY" ? "the year" : "the quarter"} to ${monthLabel(s.periodEnd)}`;

function Head({ title, seg }: { title: string; seg: Seg }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between text-[11px] text-teal-200/45">
      <span className="uppercase tracking-wider">{title}</span>
      <span>{periodWord(seg)}</span>
    </div>
  );
}

/** The plain split, as the fallback when there's nothing to compare with. */
function SplitList({ seg }: { seg: Seg }) {
  const total = seg.parts.reduce((a, p) => a + p.cents, 0) || 1;
  return (
    <ul className="space-y-1 text-xs">
      {seg.parts.slice(0, 6).map((p, i) => (
        <li key={p.name} className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5 text-teal-100/80">
            <span className={`h-2 w-2 shrink-0 rounded-full ${SEG_SHADES[i % SEG_SHADES.length]}`} />
            <span className="truncate">{tidyName(p.name)}</span>
          </span>
          <span className="shrink-0 tabular-nums text-teal-200/60">
            {bigMoney(p.cents, seg.currency)} · {Math.round((p.cents / total) * 100)}%
          </span>
        </li>
      ))}
    </ul>
  );
}

export function SegmentGrowth({ seg, title, company }: { seg: Seg; title: string; company: string }) {
  const c = seg.compare;
  const ccy = seg.currency;
  if (c.kind !== "ok") {
    return (
      <div>
        <Head title={title} seg={seg} />
        <SplitList seg={seg} />
        <p className="mt-1.5 text-[11px] text-teal-200/45">
          {c.kind === "resegmented"
            ? `${company} changed how it splits its sales from ${monthLabel(c.since)}, so there's no like-for-like comparison with a year earlier.`
            : "No figures from a year earlier to compare with yet."}
        </p>
      </div>
    );
  }
  const parts = c.parts.slice(0, 6);
  const maxMove = Math.max(1, ...parts.map((p) => Math.abs(p.cents - p.prevCents)));
  const lead = [...c.parts].sort((a, b) => (c.totalChange >= 0 ? b.cents - b.prevCents - (a.cents - a.prevCents) : a.cents - a.prevCents - (b.cents - b.prevCents)))[0];
  const leadMove = lead.cents - lead.prevCents;
  const prevTotal = c.parts.reduce((a, p) => a + p.prevCents, 0);
  const totalG: Growth | null = prevTotal > 0 ? { kind: "ok", bps: Math.round((c.totalChange / prevTotal) * 10_000) } : null;
  return (
    <div>
      <Head title={title} seg={seg} />
      <p className="mb-2 text-sm leading-snug text-teal-100/85">
        Sales {c.totalChange >= 0 ? "grew" : "fell"} <B>{bigMoney(Math.abs(c.totalChange), ccy)}</B> on a year earlier
        {totalG && (
          <>
            {" "}
            (<span className={tone(totalG)}>{growthText(totalG)}</span>)
          </>
        )}
        .{" "}
        {Math.sign(leadMove) === Math.sign(c.totalChange) && c.totalChange !== 0 && (
          <>
            <B>{tidyName(lead.name)}</B> {c.totalChange >= 0 ? "brought in" : "lost"} {bigMoney(Math.abs(leadMove), ccy)} of that
            {lead.shareOfChangeBps != null && lead.shareOfChangeBps <= 10_000 && <> ({Math.round(lead.shareOfChangeBps / 100)}%)</>}
            {lead.shareOfChangeBps != null && lead.shareOfChangeBps > 10_000 && <>, more than the whole, while others shrank</>}.
          </>
        )}
      </p>
      <ul className="space-y-1.5 text-xs">
        {parts.map((p) => {
          const d = p.cents - p.prevCents;
          return (
            <li key={p.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
              <span className="truncate text-teal-100/80">{tidyName(p.name)}</span>
              <span className="tabular-nums text-teal-200/60">
                {bigMoney(p.cents, ccy)}{" "}
                <span className={tone(p.growth)}>
                  {d >= 0 ? "+" : "−"}
                  {bigMoney(Math.abs(d), ccy)} ({growthText(p.growth)})
                </span>
              </span>
              <div className="col-span-2 flex h-1.5">
                <div className="flex w-1/2 justify-end">
                  {d < 0 && <div className="h-full rounded-l-full" style={{ width: `${(Math.abs(d) / maxMove) * 100}%`, background: "var(--spark-down)" }} />}
                </div>
                <div className="w-px bg-teal-400/30" />
                <div className="flex w-1/2">
                  {d > 0 && <div className="h-full rounded-r-full" style={{ width: `${(d / maxMove) * 100}%`, background: "var(--spark-up)" }} />}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function SegmentTrend({ seg, title, company }: { seg: Seg; title: string; company: string }) {
  const series = seg.series;
  const ccy = seg.currency;
  if (series.length < 2) {
    return (
      <div>
        <Head title={title} seg={seg} />
        <SplitList seg={seg} />
        <p className="mt-1.5 text-[11px] text-teal-200/45">
          {seg.compare.kind === "resegmented"
            ? `${company} changed how it splits its sales from ${monthLabel(seg.compare.since)}, so there aren't enough quarters on the same split for a trend yet.`
            : "Not enough quarters on the same split for a trend yet."}
        </p>
      </div>
    );
  }
  const latest = series[series.length - 1];
  const names = Object.entries(latest.data)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);
  const top = names.slice(0, 5);
  const stack = (r: (typeof series)[number]) => {
    const vals = top.map((n) => Math.max(0, r.data[n] ?? 0));
    const rest = Object.entries(r.data).reduce((a, [k, v]) => (top.includes(k) || v <= 0 ? a : a + v), 0);
    return rest > 0 ? [...vals, rest] : vals;
  };
  const legend = names.length > 5 ? [...top, "Other"] : top;
  const totals = series.map((r) => stack(r).reduce((a, b) => a + b, 0));
  const max = Math.max(1, ...totals);
  const H = 110;
  const recut = seg.compare.kind === "resegmented";
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-[11px] text-teal-200/45">
        <span className="uppercase tracking-wider">{title}</span>
        <span>last {series.length} quarters</span>
      </div>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${series.length}, minmax(0, 1fr))` }}>
        {series.map((r, i) => {
          const vals = stack(r);
          return (
            <div key={r.periodEnd} className="flex min-w-0 flex-col items-center" title={`${monthLabel(r.periodEnd)}: ${bigMoney(totals[i], ccy)}`}>
              <div className={`w-full truncate text-center text-[10px] tabular-nums text-teal-100/75 ${i === series.length - 1 ? "" : "invisible sm:visible"}`}>{bigMoney(totals[i], ccy)}</div>
              <div className="flex w-full flex-col-reverse items-center" style={{ height: H }}>
                {vals.map((v, j) => (
                  <div key={j} className={`w-[70%] ${SEG_SHADES[j % SEG_SHADES.length]} ${j === vals.length - 1 ? "rounded-t-sm" : ""}`} style={{ height: (v / max) * H }} />
                ))}
              </div>
              <div className="mt-1 text-[10px] text-teal-200/50">{monthLabel(r.periodEnd)}</div>
            </div>
          );
        })}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-teal-100/75">
        {legend.map((n, i) => (
          <li key={n} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${SEG_SHADES[i % SEG_SHADES.length]}`} />
            {tidyName(n)}
          </li>
        ))}
      </ul>
      {recut && <p className="mt-1.5 text-[11px] text-teal-200/45">Starts {monthLabel(seg.compare.kind === "resegmented" ? seg.compare.since : latest.periodEnd)}, when {company} changed how it splits its sales.</p>}
    </div>
  );
}
