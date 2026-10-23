import Term from "@/components/Term";
import type { FinancialsView } from "@/lib/financials/view";
import { bigMoney, growthText } from "@/lib/financials/format";

// D140 display loop, round 2 — two alternatives to the score-led Financial health panel. Both say
// health in DOLLARS (Graham reads dollars, not scores): what it owes vs holds, whether profit covers
// the interest, whether cash comes in or goes out, what owners got back. PLAIN ANSWERS asks the four
// questions and answers each in a sentence; CHECKLIST grades the same facts green / amber / red
// (grades from derive.healthChecks, pure + tested) with a one-line reason. The scores move to a
// footer line in both.

type Company = Extract<FinancialsView, { kind: "company" }>;
type Tone = Company["checks"][number]["tone"];

const B = ({ children }: { children: React.ReactNode }) => <strong className="font-semibold text-teal-50">{children}</strong>;
const x10 = (v: number) => (v >= 1000 ? `${Math.round(v / 10)}` : (v / 10).toFixed(1).replace(/\.0$/, ""));

/** The one sentence per fact, shared by both layouts so they can't disagree. */
function lines(v: Company) {
  const f = v.facts;
  const h = v.headline;
  const c = v.currency;
  const out: Partial<Record<"debt" | "interest" | "cash" | "shares" | "profit" | "trend" | "returned", React.ReactNode>> = {};
  if (!f) return out;

  if (f.netDebt != null) {
    out.debt =
      f.netDebt <= 0 ? (
        <>
          It holds <B>{bigMoney(f.cash, c)}</B> of cash against <B>{bigMoney(f.debt, c)}</B> of debt: <B>{bigMoney(-f.netDebt, c)}</B> more than it owes.
        </>
      ) : f.debtYearsX10 != null ? (
        <>
          It owes <B>{bigMoney(f.netDebt, c)}</B> more than it holds in cash. A year&apos;s free cash ({bigMoney(f.fcfTtm, c)}) would clear that in about{" "}
          <B>{x10(f.debtYearsX10)} years</B>.
        </>
      ) : (
        <>
          It owes <B>{bigMoney(f.netDebt, c)}</B> more than it holds in cash, and it isn&apos;t bringing in free cash to pay it down.
        </>
      );
  }
  if (f.interestTtm != null && f.netDebt != null && f.netDebt <= 0 && !(f.interestCoverX10 != null && f.interestCoverX10 > 0)) {
    out.interest =
      f.interestTtm > 0 ? (
        <>
          It paid <B>{bigMoney(f.interestTtm, c)}</B> of interest last year. Not a worry: it holds more cash than all its debt and could repay the lot today.
        </>
      ) : (
        <>It has no meaningful interest bill.</>
      );
  } else if (f.interestCoverX10 != null && f.interestTtm != null) {
    out.interest =
      f.interestCoverX10 > 0 ? (
        <>
          It paid <B>{bigMoney(f.interestTtm, c)}</B> of interest last year and made <B>{bigMoney(f.operatingIncomeTtm, c)}</B> running the business:
          enough to cover the bill <B>{x10(f.interestCoverX10)} times</B> <span className="whitespace-nowrap">(<Term k="interest-cover">interest cover</Term>)</span>.
        </>
      ) : (
        <>
          It paid <B>{bigMoney(f.interestTtm, c)}</B> of interest last year while the business itself <B>lost money</B>: the interest comes out of its cash.
        </>
      );
  }
  if (f.fcfTtm != null) {
    out.cash =
      f.fcfTtm > 0 ? (
        <>
          Coming in: <B>{bigMoney(f.fcfTtm, c)}</B> of <Term k="free-cash-flow">free cash</Term> last year, after paying for everything including new equipment.
        </>
      ) : (
        <>
          Going out: it used <B>{bigMoney(-f.fcfTtm, c)}</B> last year.
          {f.runwayMonths != null && (
            <>
              {" "}
              Its cash lasts about <B>{f.runwayMonths} months</B> at that pace <span className="whitespace-nowrap">(<Term k="cash-runway">runway</Term>)</span>.
            </>
          )}
        </>
      );
  }
  if (f.financial && h.roeBps != null) {
    out.profit = (
      <>
        Every <B>$100</B> of the owners&apos; money in it earned <B>${(h.roeBps / 100).toFixed(2)}</B> last year <span className="whitespace-nowrap">(<Term k="return-on-equity">return on equity</Term>)</span>.
      </>
    );
  }
  if (f.financial && h.netIncomeYoY?.kind === "ok" && h.netIncomeQ != null && h.netIncomeQYearAgo != null) {
    const d = h.netIncomeQ - h.netIncomeQYearAgo;
    out.trend = (
      <>
        Latest quarter&apos;s profit was <B>{bigMoney(h.netIncomeQ, c)}</B>, {bigMoney(Math.abs(d), c)} {d >= 0 ? "more" : "less"} than a year earlier ({growthText(h.netIncomeYoY)}).
      </>
    );
  }
  const s = h.shareChangeYoY;
  if (s?.kind === "ok") {
    out.shares =
      s.bps <= -50 ? (
        <>
          The share count fell <B>{growthText(s).replace("−", "")}</B> over the year: it&apos;s <Term k="buyback">buying back stock</Term>, so each share owns a little more.
        </>
      ) : s.bps <= 200 ? (
        <>The share count is about flat over the year ({growthText(s)}): your slice isn&apos;t being shrunk.</>
      ) : (
        <>
          The share count rose <B>{growthText(s)}</B> over the year: new shares make each existing one a smaller slice <span className="whitespace-nowrap">(<Term k="dilution">dilution</Term>)</span>.
        </>
      );
  }
  // A payout under 1% of the company's scale (its cash, or a bank's yearly profit) is housekeeping, not a
  // return to owners: TN.CN's "$377 of buybacks" next to $895K of cash.
  const scale = Math.max(Math.abs(f.cash ?? 0), Math.abs(f.fcfTtm ?? 0), Math.abs(h.netIncomeTtm ?? 0));
  const tiny = (x: number) => x < scale / 100;
  const div = f.dividendsTtm != null && !tiny(f.dividendsTtm) ? f.dividendsTtm : 0;
  const bb = f.buybacksTtm != null && !tiny(f.buybacksTtm) ? f.buybacksTtm : 0;
  if (f.dividendsTtm != null || f.buybacksTtm != null) {
    out.returned =
      div + bb > 0 ? (
        <>
          {div > 0 && (
            <>
              <B>{bigMoney(div, c)}</B> in <Term k="dividend">dividends</Term>
            </>
          )}
          {div > 0 && bb > 0 && " and "}
          {bb > 0 && (
            <>
              <B>{bigMoney(bb, c)}</B> buying back its own shares
            </>
          )}{" "}
          over the last year.
          {f.stockCompTtm != null && f.stockCompTtm > 0 && (
            <>
              {" "}
              It also paid staff <B>{bigMoney(f.stockCompTtm, c)}</B> in <Term k="stock-based-pay">stock</Term>.
            </>
          )}
        </>
      ) : (
        <>Nothing paid out last year: it keeps its cash in the business.</>
      );
  }
  return out;
}

function Q({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-teal-400/10 pb-3 last:border-0 last:pb-0">
      <div className="mb-0.5 text-[11px] font-bold uppercase tracking-wider text-teal-300/70">{q}</div>
      <p className="leading-snug text-teal-100/85">{children}</p>
    </div>
  );
}

export function HealthAnswers({ v, footer }: { v: Company; footer: React.ReactNode }) {
  const L = lines(v);
  const qs: Array<[string, React.ReactNode]> = v.financial
    ? [
        ["Is it earning well on its capital?", L.profit],
        ["Is profit growing?", L.trend],
        ["What did owners get back?", L.returned],
        ["Is your slice shrinking?", L.shares],
      ]
    : [
        ["Could it pay off its debt?", L.debt],
        ["Can it afford the interest?", L.interest],
        ["Is cash coming in or going out?", L.cash],
        ["What did owners get back?", L.returned],
        ["Is your slice shrinking?", L.shares],
      ];
  const shown = qs.filter(([, a]) => a != null);
  return (
    <div className="space-y-3">
      {shown.length === 0 ? <p className="text-teal-200/50">Not enough in our feed to answer these yet.</p> : shown.map(([q, a]) => <Q key={q} q={q}>{a}</Q>)}
      {footer}
    </div>
  );
}

const DOT: Record<Tone, string> = { good: "bg-emerald-400", ok: "bg-amber-300", bad: "bg-red-400" };
const TITLE: Record<Company["checks"][number]["key"], string> = {
  debt: "Debt",
  interest: "Interest",
  cash: "Cash flow",
  shares: "Your slice",
  profit: "Earning power",
  trend: "Profit trend",
};

export function HealthChecklist({ v, footer }: { v: Company; footer: React.ReactNode }) {
  const L = lines(v);
  const checks = v.checks.filter((k) => L[k.key] != null);
  const good = checks.filter((k) => k.tone === "good").length;
  const bad = checks.filter((k) => k.tone === "bad").length;
  return (
    <div className="space-y-3">
      {checks.length > 0 && (
        <p className="text-teal-100/85">
          <B>
            {good} of {checks.length}
          </B>{" "}
          checks look healthy
          {bad > 0 ? (
            <>
              ; <span className="text-red-400">{bad} to worry about</span>
            </>
          ) : (
            ""
          )}
          .
        </p>
      )}
      <ul className="space-y-3">
        {checks.map((k) => (
          <li key={k.key} className="flex gap-2.5">
            <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${DOT[k.tone]}`} aria-label={k.tone} />
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-teal-300/70">{TITLE[k.key]}</div>
              <p className="leading-snug text-teal-100/85">{L[k.key]}</p>
            </div>
          </li>
        ))}
      </ul>
      {L.returned && (
        <p className="border-t border-teal-400/10 pt-3 leading-snug text-teal-100/75">
          <span className="text-[11px] font-bold uppercase tracking-wider text-teal-300/70">Handed back · </span>
          {L.returned}
        </p>
      )}
      {checks.length === 0 && <p className="text-teal-200/50">Not enough in our feed to grade this yet.</p>}
      {footer}
    </div>
  );
}
