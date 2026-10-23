import type { FinancialsView } from "@/lib/financials/view";
import type { Growth } from "@/lib/financials/derive";
import { bigMoney, growthText, growthTone, monthLabel } from "@/lib/financials/format";

// D140 — "Where the money comes from" (Cam's pick, display round 4, 2026-10-23: the split and the growth
// combined). One block per cut (by business, by region): the share bar, a sentence on what drove the
// change against the same period a year earlier, then each segment with its dollars, its share and its
// change. Across a re-cut of the segments (derive.segmentCompare → "resegmented") a same-named segment
// may not be the same business, so the change is left out and the panel says why — never rebuilt.

type Company = Extract<FinancialsView, { kind: "company" }>;
type Seg = NonNullable<Company["segments"]["product"]>;

const SHADES = ["bg-teal-400/80", "bg-teal-400/55", "bg-teal-400/35", "bg-emerald-400/50", "bg-amber-400/45", "bg-teal-400/20"];
const TOP = 5; // segments shown by name; the rest fold into "Other"

/** FMP passes some region names in capitals ("TAIWAN, PROVINCE OF CHINA") or with a redundant
 *  "Segment" suffix ("Americas Segment"); calm them down. */
function tidyName(raw: string): string {
  const n = raw.replace(/\s+Segment$/i, "");
  if (n !== n.toUpperCase() || n.length <= 4) return n;
  return n.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\bOf\b/g, "of").replace(/\bAnd\b/g, "and");
}

const B = ({ children }: { children: React.ReactNode }) => <strong className="font-semibold text-teal-50">{children}</strong>;
const tone = (g: Growth | null) => (growthTone(g) === "up" ? "text-emerald-400" : growthTone(g) === "down" ? "text-red-400" : "text-teal-200/60");
const grow = (cur: number, prev: number): Growth | null => (prev > 0 ? { kind: "ok", bps: Math.round(((cur - prev) / prev) * 10_000) } : null);

type Line = { name: string; cents: number; prevCents: number | null };

/** Segments biggest first, the tail folded into "Other" — the same lines for the bar and the list. */
function lines(seg: Seg): Line[] {
  const c = seg.compare;
  const all: Line[] =
    c.kind === "ok" ? c.parts.map((p) => ({ name: p.name, cents: p.cents, prevCents: p.prevCents })) : seg.parts.map((p) => ({ name: p.name, cents: p.cents, prevCents: null }));
  if (all.length <= TOP + 1) return all;
  const rest = all.slice(TOP);
  return [
    ...all.slice(0, TOP),
    { name: "Other", cents: rest.reduce((a, p) => a + p.cents, 0), prevCents: c.kind === "ok" ? rest.reduce((a, p) => a + (p.prevCents ?? 0), 0) : null },
  ];
}

export default function SegmentBreakdown({ seg, title, company }: { seg: Seg; title: string; company: string }) {
  const ccy = seg.currency;
  const c = seg.compare;
  const ls = lines(seg);
  const total = ls.reduce((a, p) => a + p.cents, 0) || 1;
  const compared = c.kind === "ok";
  const maxMove = Math.max(1, ...ls.map((p) => (p.prevCents == null ? 0 : Math.abs(p.cents - p.prevCents))));

  let sentence: React.ReactNode = null;
  if (c.kind === "ok") {
    const prevTotal = c.parts.reduce((a, p) => a + p.prevCents, 0);
    const totalG = grow(prevTotal + c.totalChange, prevTotal);
    const up = c.totalChange >= 0;
    const lead = [...c.parts].sort((a, b) => (up ? b.cents - b.prevCents - (a.cents - a.prevCents) : a.cents - a.prevCents - (b.cents - b.prevCents)))[0];
    const leadMove = lead.cents - lead.prevCents;
    sentence = (
      <>
        Sales {up ? "grew" : "fell"} <B>{bigMoney(Math.abs(c.totalChange), ccy)}</B> on a year earlier
        {totalG && (
          <>
            {" "}
            (<span className={tone(totalG)}>{growthText(totalG)}</span>)
          </>
        )}
        .
        {c.totalChange !== 0 && Math.sign(leadMove) === Math.sign(c.totalChange) && (
          <>
            {" "}
            <B>{tidyName(lead.name)}</B> {up ? "brought in" : "lost"} {bigMoney(Math.abs(leadMove), ccy)} of that
            {lead.shareOfChangeBps != null && lead.shareOfChangeBps <= 10_000 ? <> ({Math.round(lead.shareOfChangeBps / 100)}%)</> : <>, more than the whole, while others shrank</>}.
          </>
        )}
      </>
    );
  } else {
    const [big] = ls;
    sentence = (
      <>
        <B>{tidyName(big.name)}</B> brings in <B>{bigMoney(big.cents, ccy)}</B>, {Math.round((big.cents / total) * 100)}% of the total.
      </>
    );
  }

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-[11px] text-teal-200/45">
        <span className="uppercase tracking-wider">{title}</span>
        <span>
          {seg.period === "FY" ? "the year" : "the quarter"} to {monthLabel(seg.periodEnd)}
        </span>
      </div>
      <div className="flex h-3 w-full overflow-hidden rounded-full">
        {ls.map((p, i) => (
          <div key={p.name} className={SHADES[i % SHADES.length]} style={{ width: `${(p.cents / total) * 100}%` }} title={tidyName(p.name)} />
        ))}
      </div>
      <p className="mt-2 text-sm leading-snug text-teal-100/85">{sentence}</p>
      <ul className="mt-2 space-y-1.5 text-xs">
        {ls.map((p, i) => {
          const d = p.prevCents == null ? null : p.cents - p.prevCents;
          const g = p.prevCents == null ? null : grow(p.cents, p.prevCents);
          return (
            <li key={p.name}>
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-teal-100/80">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${SHADES[i % SHADES.length]}`} />
                  <span className="truncate">{tidyName(p.name)}</span>
                </span>
                <span className="shrink-0 tabular-nums text-teal-200/60">
                  {bigMoney(p.cents, ccy)} · {Math.round((p.cents / total) * 100)}%
                  {d != null && (
                    <span className={`ml-1.5 ${tone(g)}`}>
                      {d >= 0 ? "+" : "−"}
                      {bigMoney(Math.abs(d), ccy)} ({growthText(g)})
                    </span>
                  )}
                </span>
              </div>
              {d != null && (
                <div className="ml-3.5 mt-0.5 flex h-1">
                  <div className="flex w-1/2 justify-end">
                    {d < 0 && <div className="h-full rounded-l-full" style={{ width: `${(-d / maxMove) * 100}%`, background: "var(--spark-down)" }} />}
                  </div>
                  <div className="w-px bg-teal-400/30" />
                  <div className="flex w-1/2">{d > 0 && <div className="h-full rounded-r-full" style={{ width: `${(d / maxMove) * 100}%`, background: "var(--spark-up)" }} />}</div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {!compared && (
        <p className="mt-1.5 text-[11px] text-teal-200/45">
          {c.kind === "resegmented"
            ? `${company} changed how it splits its sales from ${monthLabel(c.since)}, so there's no like-for-like comparison with a year earlier.`
            : "No figures from a year earlier to compare with yet."}
        </p>
      )}
    </div>
  );
}
