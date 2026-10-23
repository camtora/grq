import Term from "@/components/Term";
import type { FinancialsView } from "@/lib/financials/view";
import type { Growth } from "@/lib/financials/derive";
import { bigMoney, epsMoney, growthText, nmReason, bpsText, growthTone, monthLabel } from "@/lib/financials/format";

// D140 display loop, round 2 — two alternative layouts of the headline + trend block, beside the
// "report card" in FinancialsSection. STORY leads every line with a dollar figure in plain words
// (Graham reads dollars); TABLE puts eight quarters side by side. Same data, same rules (banks lead
// with profit, a pre-revenue company with cash), so the choice is purely about how it reads.

type Company = Extract<FinancialsView, { kind: "company" }>;
type Q = Company["quarters"][number];

const tone = (g: Growth | null | undefined) =>
  growthTone(g) === "up" ? "text-emerald-400" : growthTone(g) === "down" ? "text-red-400" : "text-teal-200/50";

/** Eight tiny bars — the shape of a line's history at a glance. Theme vars, never raw hex. */
function Spark({ values }: { values: Array<number | null> }) {
  const vs = values.map((v) => v ?? 0);
  const max = Math.max(1, ...vs.map(Math.abs));
  const anyNeg = vs.some((v) => v < 0);
  const H = 28;
  return (
    <div className="flex h-7 w-24 shrink-0 items-end gap-[3px]" aria-hidden>
      {vs.map((v, i) => {
        const h = Math.max(2, (Math.abs(v) / max) * (anyNeg ? H / 2 : H));
        return (
          <div key={i} className="relative flex-1" style={{ height: H }}>
            <div
              className="absolute left-0 right-0 rounded-[1px]"
              style={{
                height: h,
                background: v >= 0 ? "var(--spark-up)" : "var(--spark-down)",
                opacity: i === vs.length - 1 ? 0.95 : 0.5,
                ...(anyNeg ? (v >= 0 ? { bottom: H / 2 } : { top: H / 2 }) : { bottom: 0 }),
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

function Line({ children, spark }: { children: React.ReactNode; spark?: Array<number | null> }) {
  return (
    <li className="flex items-center justify-between gap-4 border-b border-teal-400/10 py-2.5 last:border-0">
      <span className="text-[15px] leading-snug text-teal-100/85">{children}</span>
      {spark && <Spark values={spark} />}
    </li>
  );
}

const B = ({ children }: { children: React.ReactNode }) => <strong className="font-semibold text-teal-50">{children}</strong>;

export function HeadlineStory({ v, symbol }: { v: Company; symbol: string }) {
  const h = v.headline;
  const c = v.currency;
  const qs = v.quarters;
  const when = `to ${monthLabel(h.asOf)}`;
  const pick = (f: (q: Q) => number | null) => qs.map(f);

  if (h.preRevenue) {
    return (
      <ul>
        <Line>
          <B>{symbol} has no sales yet.</B> Common for explorers and drug developers: the bet is on what it finds or invents.
        </Line>
        {h.netIncomeTtm != null && (
          <Line spark={pick((q) => q.netIncome)}>
            Over the last year it {h.netIncomeTtm < 0 ? "lost" : "made"} <B>{bigMoney(Math.abs(h.netIncomeTtm), c)}</B>.
          </Line>
        )}
        {h.fcfTtm != null && (
          <Line spark={pick((q) => q.fcf)}>
            It {h.fcfTtm < 0 ? "used" : "brought in"} <B>{bigMoney(Math.abs(h.fcfTtm), c)}</B> of cash doing it (<Term k="free-cash-flow">free cash flow</Term>).
          </Line>
        )}
        {h.netDebt != null && (
          <Line>
            {h.netDebt < 0 ? (
              <>
                It holds <B>{bigMoney(-h.netDebt, c)}</B> more cash than debt. At last year&apos;s pace that lasts about{" "}
                {h.fcfTtm != null && h.fcfTtm < 0 ? <B>{Math.max(0, Math.round((-h.netDebt / -h.fcfTtm) * 12))} months</B> : "a while"}.
              </>
            ) : (
              <>
                It owes <B>{bigMoney(h.netDebt, c)}</B> more than it holds in cash.
              </>
            )}
          </Line>
        )}
      </ul>
    );
  }

  if (v.financial) {
    const delta = h.netIncomeQ != null && h.netIncomeQYearAgo != null ? h.netIncomeQ - h.netIncomeQYearAgo : null;
    return (
      <ul>
        <Line spark={pick((q) => q.netIncome)}>
          {symbol} made <B>{bigMoney(h.netIncomeQ, c)}</B> of profit in its latest quarter ({when}).
        </Line>
        {delta != null && h.netIncomeYoY?.kind === "ok" && (
          <Line>
            That&apos;s <B>{bigMoney(Math.abs(delta), c)}</B> {delta >= 0 ? "more" : "less"} than the same quarter a year ago:{" "}
            <span className={tone(h.netIncomeYoY)}>{growthText(h.netIncomeYoY)}</span>.
          </Line>
        )}
        <Line spark={pick((q) => q.epsQ4)}>
          Per share it earned <B>{epsMoney(h.epsQ4, c)}</B>
          {h.epsQ4YearAgo != null && <>, up from {epsMoney(h.epsQ4YearAgo, c)} a year ago</>} (<Term k="eps">EPS</Term>).
        </Line>
        {h.roeBps != null && (
          <Line>
            Every <B>$100</B> of the owners&apos; money in the bank earned <B>${(h.roeBps / 100).toFixed(2)}</B> over the last year (
            <Term k="return-on-equity">return on equity</Term>).
          </Line>
        )}
      </ul>
    );
  }

  const delta = h.revenueQ != null && h.revenueQYearAgo != null ? h.revenueQ - h.revenueQYearAgo : null;
  const cents = h.operatingMarginBps != null ? Math.round(h.operatingMarginBps / 100) : null;
  return (
    <ul>
      <Line spark={pick((q) => q.revenue)}>
        {symbol} sold <B>{bigMoney(h.revenueQ, c)}</B> in its latest quarter ({when}).
      </Line>
      {delta != null && h.revenueYoY?.kind === "ok" && (
        <Line spark={pick((q) => (q.revenueYoY?.kind === "ok" ? q.revenueYoY.bps : null))}>
          That&apos;s <B>{bigMoney(Math.abs(delta), c)}</B> {delta >= 0 ? "more" : "less"} than the same quarter a year ago:{" "}
          <span className={tone(h.revenueYoY)} title={nmReason(h.revenueYoY) ?? undefined}>
            {growthText(h.revenueYoY)}
          </span>
          {h.revenueAccelBps != null && Math.abs(h.revenueAccelBps) >= 300 && (
            <>, and growth is <Term k="growth-acceleration">{h.revenueAccelBps > 0 ? "speeding up" : "slowing"}</Term></>
          )}
          .
        </Line>
      )}
      {h.operatingIncomeQ != null && (
        <Line spark={pick((q) => q.operatingMarginBps)}>
          {h.operatingIncomeQ >= 0 ? (
            <>
              It kept <B>{bigMoney(h.operatingIncomeQ, c)}</B> as profit from running the business: <B>{cents}¢</B> of every dollar of sales (
              <Term k="operating-margin">operating margin</Term>).
            </>
          ) : (
            <>
              Running the business <B>lost {bigMoney(-h.operatingIncomeQ, c)}</B> this quarter (<Term k="operating-margin">operating margin</Term>{" "}
              {bpsText(h.operatingMarginBps)}).
            </>
          )}
        </Line>
      )}
      <Line spark={pick((q) => q.epsQ4)}>
        Per share it earned <B>{epsMoney(h.epsQ4, c)}</B>
        {h.epsQ4YearAgo != null && <>, against {epsMoney(h.epsQ4YearAgo, c)} a year ago</>} (<Term k="eps">EPS</Term>).
      </Line>
      {h.fcfTtm != null && (
        <Line spark={pick((q) => q.fcf)}>
          Over the last year it {h.fcfTtm >= 0 ? "had" : "burned"} <B>{bigMoney(Math.abs(h.fcfTtm), c)}</B> of{" "}
          <Term k="free-cash-flow">free cash</Term>
          {h.fcfTtm >= 0 ? ": money left after paying for everything, including new equipment" : ""}.
        </Line>
      )}
    </ul>
  );
}

type Row = { label: React.ReactNode; cells: (q: Q) => React.ReactNode; sub?: boolean };

export function HeadlineTable({ v }: { v: Company }) {
  const h = v.headline;
  const c = v.currency;
  const qs = v.quarters;
  const g = (x: Growth | null | undefined) => (
    <span className={tone(x)} title={nmReason(x) ?? undefined}>
      {growthText(x)}
    </span>
  );
  const rows: Row[] = h.preRevenue
    ? [
        { label: <Term k="free-cash-flow">Free cash flow</Term>, cells: (q) => bigMoney(q.fcf, c) },
        { label: <Term k="earnings">Profit</Term>, cells: (q) => bigMoney(q.netIncome, c) },
        { label: <Term k="eps">EPS</Term>, cells: (q) => epsMoney(q.epsQ4, c) },
      ]
    : v.financial
      ? [
          { label: <Term k="earnings">Profit</Term>, cells: (q) => bigMoney(q.netIncome, c) },
          { label: "vs a year ago", cells: (q) => g(q.netIncomeYoY), sub: true },
          { label: <Term k="eps">EPS</Term>, cells: (q) => epsMoney(q.epsQ4, c) },
          { label: "vs a year ago", cells: (q) => g(q.epsYoY), sub: true },
        ]
      : [
          { label: <Term k="revenue">Sales</Term>, cells: (q) => bigMoney(q.revenue, c) },
          { label: "vs a year ago", cells: (q) => g(q.revenueYoY), sub: true },
          { label: <Term k="eps">EPS</Term>, cells: (q) => epsMoney(q.epsQ4, c) },
          { label: "vs a year ago", cells: (q) => g(q.epsYoY), sub: true },
          { label: <Term k="operating-margin">Op. margin</Term>, cells: (q) => bpsText(q.operatingMarginBps) },
          { label: <Term k="free-cash-flow">Free cash flow</Term>, cells: (q) => bigMoney(q.fcf, c) },
        ];
  const last = qs.length - 1;
  return (
    <div className="grq-scroll overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-teal-200/40">
            <th className="py-1 pr-3 text-left font-normal">Quarter to</th>
            {qs.map((q, i) => (
              <th key={q.periodEnd} className={`py-1 text-right font-normal ${i === last ? "text-teal-200/70" : ""}`}>
                {monthLabel(q.periodEnd)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className={r.sub ? "" : "border-t border-teal-400/10"}>
              <td className={`py-1.5 pr-3 text-left ${r.sub ? "pl-3 text-[11px] text-teal-200/40" : "text-xs uppercase tracking-wider text-teal-200/55"}`}>{r.label}</td>
              {qs.map((q, i) => (
                <td
                  key={q.periodEnd}
                  className={`py-1.5 text-right tabular-nums ${r.sub ? "text-[11px]" : ""} ${i === last ? "bg-teal-400/[0.06] font-semibold text-teal-50" : "text-teal-100/75"}`}
                >
                  {r.cells(q)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[10px] text-teal-200/40">
        Oldest quarter on the left; the highlighted column is the latest. Figures in {c}, the currency the company reports in.
      </p>
    </div>
  );
}
