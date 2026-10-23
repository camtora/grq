import PanelHeader from "@/components/PanelHeader";
import Term from "@/components/Term";
import { Card, Chip, StatCard } from "@/components/ui";
import QuarterBars from "./QuarterBars";
import HealthChecklist from "./HealthChecklist";
import type { FinancialsView } from "@/lib/financials/view";
import type { Growth } from "@/lib/financials/derive";
import { money } from "@/lib/money";
import {
  bigMoney, epsMoney, growthText, nmReason, bpsText, ptsText, growthTone, monthLabel, currencySymbol,
} from "@/lib/financials/format";

// D140 — "The business": the company-financials block on the stock page. ROUND 1 of the display loop
// (docs/COMPANY-FINANCIALS.md §5): a plain functional first cut on real data, members + viewers only
// until Cam and Graham pick a design. Dollars before percentages (Graham reads dollars). Every figure
// carries a Term so it can be explained (docs/LITERACY.md). The P0 display rules (banks, negative
// DCF, stale segments) are applied upstream in lib/financials/view.ts, not here.

type Company = Extract<FinancialsView, { kind: "company" }>;

const toneCls = (g: Growth | null | undefined) => {
  const t = growthTone(g);
  return t === "up" ? "text-emerald-400" : t === "down" ? "text-red-400" : "text-teal-200/50";
};

function G({ g }: { g: Growth | null | undefined }) {
  return (
    <span className={`tabular-nums ${toneCls(g)}`} title={nmReason(g) ?? undefined}>
      {growthText(g)}
    </span>
  );
}

function piotroskiWord(n: number): string {
  return n >= 7 ? "strong" : n >= 4 ? "middling" : "weak";
}
function altmanWord(z: number): { word: string; tone: "green" | "teal" | "red" } {
  return z >= 3 ? { word: "safe zone", tone: "green" } : z >= 1.8 ? { word: "grey zone", tone: "teal" } : { word: "danger zone", tone: "red" };
}

const FORM_MEANING: Record<string, string> = {
  "8-K": "something important happened",
  "8-K/A": "a correction to an 8-K",
  "10-Q": "quarterly report",
  "10-Q/A": "a corrected quarterly report",
  "10-K": "annual report",
  "10-K/A": "a corrected annual report",
  "6-K": "a foreign company's update",
  "20-F": "a foreign company's annual report",
  "40-F": "a Canadian company's annual report (US filing)",
  "S-1": "registering new shares",
  "DEF 14A": "notice of the shareholder meeting",
  "SC 13D": "an investor now owns 5%+ and may push for change",
  "SC 13D/A": "an update from a 5%+ activist holder",
};

export default function FinancialsSection({
  view,
  symbol,
  listingCurrency,
}: {
  view: FinancialsView | null;
  symbol: string;
  listingCurrency: string | null;
}) {
  if (!view || view.kind === "etf") return null; // a fund has no business to describe
  if (view.kind === "none") {
    return (
      <section className="mb-6 space-y-2">
        <PanelHeader fresh="quarterly">The business</PanelHeader>
        <Card className="p-5 text-sm text-teal-200/50">
          {view.reason === "not-fetched"
            ? "Fetching this company's financial statements. Refresh in a minute."
            : "No financial statements in our data feed for this listing (common for TSX Venture names and Canadian depositary receipts)."}
        </Card>
      </section>
    );
  }

  const v: Company = view;
  const h = v.headline;
  const ccy = v.currency;
  const revLabel = v.financial ? "Revenue" : "Sales";
  const revTerm = v.financial ? "bank-revenue" : "revenue";
  const niDelta = h.netIncomeQ != null && h.netIncomeQYearAgo != null ? h.netIncomeQ - h.netIncomeQYearAgo : null;
  const revDelta = h.revenueQ != null && h.revenueQYearAgo != null ? h.revenueQ - h.revenueQYearAgo : null;
  const otherCcy = listingCurrency && listingCurrency.toUpperCase() !== ccy.toUpperCase();

  return (
    <section className="mb-6 space-y-6">
      {/* ── Headline + trend ───────────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <PanelHeader fresh={`to ${monthLabel(h.asOf)}`} freshTitle="Company financial statements, refreshed after each quarterly report">
          The business
        </PanelHeader>
        <Card className="p-5">
          <div>
            <p className="text-sm leading-relaxed text-teal-100/85">
              {h.preRevenue ? (
                <>
                  <strong className="text-teal-50">No sales yet.</strong> {symbol} isn&apos;t earning revenue so far (common for explorers and drug developers).
                  {h.netIncomeTtm != null && (
                    <>
                      {" "}Over the last year it {h.netIncomeTtm < 0 ? "lost" : "made"} <strong className="text-teal-50">{bigMoney(Math.abs(h.netIncomeTtm), ccy)}</strong>
                    </>
                  )}
                  {h.fcfTtm != null && (
                    <>
                      {" "}and {h.fcfTtm < 0 ? "used" : "generated"} <strong className={h.fcfTtm < 0 ? "text-red-400" : "text-emerald-400"}>{bigMoney(Math.abs(h.fcfTtm), ccy)}</strong> of cash
                    </>
                  )}
                  .{h.netDebt != null && h.netDebt < 0 ? <> It holds {bigMoney(-h.netDebt, ccy)} more cash than debt: that runway is the number to watch.</> : null}
                </>
              ) : v.financial ? (
                <>
                  Profit was <strong className="text-teal-50">{bigMoney(h.netIncomeQ, ccy)}</strong> in the latest quarter ({h.label}, to {monthLabel(h.asOf)})
                  {niDelta != null && h.netIncomeYoY?.kind === "ok" ? (
                    <>
                      , {niDelta >= 0 ? "up" : "down"} <strong className={niDelta >= 0 ? "text-emerald-400" : "text-red-400"}>{bigMoney(Math.abs(niDelta), ccy)}</strong> (
                      <G g={h.netIncomeYoY} />) on the same quarter a year ago
                    </>
                  ) : null}
                  . Earnings per share {epsMoney(h.epsQ4, ccy)} (<G g={h.epsYoY} />).
                  {h.netIncomeTtm != null && <> Over the last year: <strong className="text-teal-50">{bigMoney(h.netIncomeTtm, ccy)}</strong> of profit.</>}
                  {h.revenueYoY?.kind === "nm" && (
                    <span className="text-teal-200/50">
                      {" "}Revenue growth isn&apos;t shown: our data feed changed how it counts this {v.sector?.match(/insur/i) ? "company" : "bank"}&apos;s revenue (
                      <Term k="bank-revenue">why</Term>).
                    </span>
                  )}
                </>
              ) : (
                <>
                  {revLabel} were <strong className="text-teal-50">{bigMoney(h.revenueQ, ccy)}</strong> in the latest quarter ({h.label}, to {monthLabel(h.asOf)})
                  {revDelta != null && h.revenueYoY?.kind === "ok" ? (
                    <>
                      , {revDelta >= 0 ? "up" : "down"} <strong className={revDelta >= 0 ? "text-emerald-400" : "text-red-400"}>{bigMoney(Math.abs(revDelta), ccy)}</strong> (
                      <G g={h.revenueYoY} />) on the same quarter a year ago
                    </>
                  ) : null}
                  .{" "}
                  {h.revenueTtm != null && (
                    <>
                      Over the last year: <strong className="text-teal-50">{bigMoney(h.revenueTtm, ccy)}</strong> of {revLabel.toLowerCase()}
                      {h.netIncomeTtm != null && <>, {bigMoney(h.netIncomeTtm, ccy)} of profit</>}
                      {h.fcfTtm != null && <>, {bigMoney(h.fcfTtm, ccy)} of free cash flow</>}.
                    </>
                  )}
                </>
              )}
              {otherCcy && (
                <span className="text-teal-200/50"> Figures are in {ccy}, the currency {symbol} reports in, not the {listingCurrency} it trades in.</span>
              )}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {v.financial ? (
                <StatCard
                  size="sm"
                  label="Profit (quarter)"
                  term="earnings"
                  value={bigMoney(h.netIncomeQ, ccy)}
                  note={
                    <>
                      <G g={h.netIncomeYoY} /> <Term k="yoy">YoY</Term>
                    </>
                  }
                />
              ) : h.preRevenue ? (
                <StatCard size="sm" label="Sales (12 mo)" term="revenue" value="none yet" valueClassName="text-teal-200/60" />
              ) : (
                <StatCard
                  size="sm"
                  label={`${revLabel} (12 mo)`}
                  term="ttm"
                  value={bigMoney(h.revenueTtm, ccy)}
                  note={
                    <>
                      <G g={h.revenueYoY} /> <Term k="yoy">YoY</Term>
                      {h.revenueAccelBps != null && (
                        <>
                          {" · "}
                          <Term k="growth-acceleration">{h.revenueAccelBps >= 0 ? "speeding up" : "slowing"}</Term>{" "}
                          {ptsText(Math.abs(h.revenueAccelBps)).replace(/^\+/, "")}
                        </>
                      )}
                    </>
                  }
                />
              )}
              <StatCard
                size="sm"
                label="EPS (quarter)"
                term="eps"
                value={epsMoney(h.epsQ4, ccy)}
                valueClassName={h.epsQ4 != null && h.epsQ4 < 0 ? "text-red-400" : "text-teal-50"}
                note={
                  <>
                    <G g={h.epsYoY} /> YoY{h.epsQ4YearAgo != null ? ` (was ${epsMoney(h.epsQ4YearAgo, ccy)})` : ""}
                  </>
                }
              />
              {v.financial ? (
                <StatCard size="sm" label="Return on equity" term="return-on-equity" value={bpsText(h.roeBps)} note="last year's profit ÷ shareholders' money" />
              ) : h.preRevenue ? (
                <StatCard
                  size="sm"
                  label="Profit (12 mo)"
                  term="earnings"
                  value={bigMoney(h.netIncomeTtm, ccy)}
                  valueClassName={h.netIncomeTtm != null && h.netIncomeTtm < 0 ? "text-red-400" : "text-teal-50"}
                />
              ) : (
                <StatCard
                  size="sm"
                  label="Operating margin"
                  term="operating-margin"
                  value={bpsText(h.operatingMarginBps)}
                  note={h.operatingMarginChangeBps != null ? `${ptsText(h.operatingMarginChangeBps)} vs a year ago` : undefined}
                  valueClassName={h.operatingMarginBps != null && h.operatingMarginBps < 0 ? "text-red-400" : "text-teal-50"}
                />
              )}
              {v.financial ? (
                <StatCard
                  size="sm"
                  label="Revenue (12 mo)"
                  term="bank-revenue"
                  value={h.revenueTtm != null ? bigMoney(h.revenueTtm, ccy) : "n/m"}
                  valueClassName={h.revenueTtm != null ? "text-teal-50" : "text-teal-200/50"}
                  note={h.revenueTtm != null ? <><G g={h.revenueYoY} /> YoY</> : "our feed changed how it counts it"}
                />
              ) : (
                <StatCard
                  size="sm"
                  label="Free cash flow (12 mo)"
                  term="free-cash-flow"
                  value={bigMoney(h.fcfTtm, ccy)}
                  valueClassName={h.fcfTtm != null && h.fcfTtm < 0 ? "text-red-400" : "text-teal-50"}
                  note={h.fcfMarginBps != null && !h.preRevenue ? `${bpsText(h.fcfMarginBps)} of sales` : h.preRevenue ? "cash used running the business" : undefined}
                />
              )}
            </div>

            {v.quarters.length >= 2 && (
              <div className="mt-5">
                <QuarterBars
                  points={v.quarters}
                  currency={ccy}
                  revenueLabel={revLabel}
                  metrics={v.financial ? ["profit", "eps"] : h.preRevenue ? ["fcf", "eps"] : ["revenue", "eps", "fcf", "margin"]}
                />
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* ── Health + scores · Analysts · Segments ───────────────────────────────────────────────── */}
      <div className="grid items-stretch gap-6 lg:grid-cols-2">
        <Health v={v} />
        <Scores v={v} listingCurrency={listingCurrency} />
      </div>
      <div className="grid items-stretch gap-6 lg:grid-cols-2">
        <Estimates v={v} />
        <Segments v={v} revTerm={revTerm} />
      </div>

      {/* ── The last call · filings + insiders ─────────────────────────────────────────── */}
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CallPanel v={v} />
        </div>
        <FilingsPanel v={v} />
      </div>
    </section>
  );
}

function revisionText(r: { kind: string; days?: number; daysOfHistory?: number; eps?: Growth | null; revenue?: Growth | null }, days: number) {
  if (r.kind === "building") {
    return <span className="text-teal-200/40">{days}-day: building history ({r.daysOfHistory ?? 0} of {days} days)</span>;
  }
  return (
    <span>
      {days}-day: EPS <G g={r.eps} />, sales <G g={r.revenue} />
    </span>
  );
}

function Estimates({ v }: { v: Company }) {
  const e = v.estimates;
  const ccy = v.currency;
  const rows = e ? ([["Next year", e.nextYear], ["Year after", e.followingYear], ["Next quarter", e.nextQuarter]] as const) : [];
  return (
    <div className="flex h-full flex-col space-y-2">
      <PanelHeader fresh="daily" freshTitle="Analyst consensus, snapshotted every morning; we keep the history ourselves">
        What analysts expect
      </PanelHeader>
      <Card className="flex-1 p-5 text-sm">
        {!e || rows.every(([, t]) => !t) ? (
          <p className="text-teal-200/40">No analyst forecasts in our feed for this company.</p>
        ) : (
          <div className="space-y-3">
            {rows.map(([label, t]) =>
              t ? (
                <div key={label} className="border-b border-teal-400/10 pb-2 last:border-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs uppercase tracking-wider text-teal-200/50">
                      {label} <span className="normal-case tracking-normal text-teal-200/35">to {monthLabel(t.targetEnd)}</span>
                    </span>
                    <span className="text-[10px] text-teal-200/40">
                      {t.analysts != null ? `${t.analysts} analyst${t.analysts === 1 ? "" : "s"}` : ""}
                      {t.analysts != null && t.analysts <= 2 ? " · thin" : ""}
                    </span>
                  </div>
                  <div className="mt-1 tabular-nums text-teal-100/85">
                    <Term k="consensus-estimate">EPS</Term> {epsMoney(t.epsAvg4, ccy)}{" "}
                    <span className="text-[11px] text-teal-200/40">
                      ({epsMoney(t.epsLow4, ccy)}–{epsMoney(t.epsHigh4, ccy)})
                    </span>
                  </div>
                  <div className="tabular-nums text-teal-100/85">
                    Sales {bigMoney(t.revenueAvg, ccy)}{" "}
                    <span className="text-[11px] text-teal-200/40">
                      ({bigMoney(t.revenueLow, ccy)}–{bigMoney(t.revenueHigh, ccy)})
                    </span>
                  </div>
                  {label !== "Next quarter" && (t.rev30.kind === "ok" || t.rev90.kind === "ok") && (
                    <div className="mt-1 space-y-0.5 text-[11px]">
                      <div>{revisionText(t.rev30, 30)}</div>
                      <div>{revisionText(t.rev90, 90)}</div>
                    </div>
                  )}
                </div>
              ) : null,
            )}
          </div>
        )}
        <p className="mt-3 text-[11px] text-teal-200/40">
          <Term k="estimate-revision">Revisions</Term> (how these forecasts move) appear once our own record is long enough: 30 days from {e?.historySince ?? "the first snapshot"}{" "}
          for the 30-day change, 90 for the 90-day. Our feed keeps no history of its own.
          {v.financial ? " For banks, the analysts' 'sales' may be counted differently from our feed's revenue." : ""}
        </p>
      </Card>
    </div>
  );
}

function Health({ v }: { v: Company }) {
  return (
    <div className="flex h-full flex-col space-y-2">
      <PanelHeader fresh="weekly">Financial health</PanelHeader>
      <Card className="flex-1 p-5 text-sm">
        <HealthChecklist v={v} />
      </Card>
    </div>
  );
}

/** The textbook scores beside the checklist (Cam, 2026-10-23: "I like them both"). Net cash and the
 *  share count live in the checklist, in dollars, so they aren't repeated here. */
function Scores({ v, listingCurrency }: { v: Company; listingCurrency: string | null }) {
  const s = v.health;
  const any = s && (s.piotroski != null || s.altmanZ != null || (s.freeFloatBps != null && s.freeFloatBps > 0) || s.fmpRating);
  return (
    <div className="flex h-full flex-col space-y-2">
      <PanelHeader fresh="weekly">Health scores</PanelHeader>
      <Card className="flex-1 p-5 text-sm">
        {!any ? (
          <p className="text-teal-200/50">No scores in our feed for this company.</p>
        ) : (
          <dl className="space-y-2.5">
            {s?.piotroski != null && (
              <Row label={<Term k="piotroski">Piotroski</Term>}>
                <span className="tabular-nums text-teal-50">{s.piotroski}/9</span>{" "}
                <Chip tone={s.piotroski >= 7 ? "green" : s.piotroski >= 4 ? "teal" : "red"}>{piotroskiWord(s.piotroski)}</Chip>
              </Row>
            )}
            {s?.piotroski != null && (
              <ScoreNote>
                Passes {s.piotroski} of 9 yes-or-no tests: is it profitable, is cash coming in, is debt falling, are margins and
                efficiency improving, has it avoided issuing shares. 7 or more is strong, 3 or less weak.
              </ScoreNote>
            )}
            {s?.altmanZ != null && (
              <Row label={<Term k="altman-z">Altman Z</Term>}>
                <span className="tabular-nums text-teal-50">{s.altmanZ.toFixed(1)}</span> <Chip tone={altmanWord(s.altmanZ).tone}>{altmanWord(s.altmanZ).word}</Chip>
              </Row>
            )}
            {s?.altmanZ != null && (
              <ScoreNote>
                A 1968 formula for the risk of going bust, from profit, assets, debt and market value. Above 3 is safe, below 1.8
                is the danger zone. Utilities and other heavy borrowers often sit low by design.
              </ScoreNote>
            )}
            {s?.freeFloatBps != null && s.freeFloatBps > 0 && (
              <Row label={<Term k="free-float">Free float</Term>}>
                <span className="tabular-nums text-teal-50">{bpsText(s.freeFloatBps, 0)}</span>
                {s.freeFloatBps < 2000 && <span className="text-[11px] text-amber-300/80"> small: can be jumpy</span>}
              </Row>
            )}
            {s?.freeFloatBps != null && s.freeFloatBps > 0 && (
              <ScoreNote>The share of stock that trades freely, not locked up by founders, insiders or governments.</ScoreNote>
            )}
          </dl>
        )}
        {s?.fmpRating && (
          <div className="mt-4 border-t border-teal-400/10 pt-3 text-[11px] text-teal-200/50">
            <span className="uppercase tracking-wider">FMP&apos;s own model, not ours:</span> grade {s.fmpRating}
            {s.fmpDcfCents != null && s.fmpDcfPriceCents != null && dcfShowable(s.fmpDcfCents, s.fmpDcfPriceCents, v, listingCurrency) && (
              <> · fair value {money(s.fmpDcfCents, listingCurrency)} vs price {money(s.fmpDcfPriceCents, listingCurrency)}</>
            )}
          </div>
        )}
        {v.financial && <p className="mt-3 text-[11px] text-teal-200/40">A bank&apos;s card skips the Altman Z-score: it doesn&apos;t fit a lender.</p>}
      </Card>
    </div>
  );
}

/** FMP's DCF is a black box; show it only where it can be read straight: a company that reports in the
 *  currency it trades in (SHOP reports US$ and trades C$ — FMP compared US$30 with C$245), has sales,
 *  trades above a dollar, and lands within 4× of the price either way. */
function dcfShowable(dcf: number, price: number, v: Company, listingCurrency: string | null): boolean {
  if (v.headline.preRevenue || price < 100) return false;
  if (listingCurrency && listingCurrency.toUpperCase() !== v.currency.toUpperCase()) return false;
  const r = dcf / price;
  return r >= 0.25 && r <= 4;
}

function ScoreNote({ children }: { children: React.ReactNode }) {
  return <dd className="-mt-1 pb-1 text-[11px] leading-snug text-teal-200/45">{children}</dd>;
}

function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs uppercase tracking-wider text-teal-200/50">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

/** FMP passes some region names in capitals ("TAIWAN, PROVINCE OF CHINA"); calm them down. */
function tidyName(n: string): string {
  if (n !== n.toUpperCase() || n.length <= 4) return n;
  return n.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\bOf\b/g, "of").replace(/\bAnd\b/g, "and");
}

const SEG_SHADES = ["bg-teal-400/80", "bg-teal-400/55", "bg-teal-400/35", "bg-emerald-400/50", "bg-amber-400/45", "bg-teal-400/20"];

function SegmentBar({ seg, title }: { seg: NonNullable<Company["segments"]["product"]>; title: string }) {
  const total = seg.parts.reduce((a, p) => a + p.cents, 0) || 1;
  const top = seg.parts.slice(0, 5);
  const rest = seg.parts.slice(5).reduce((a, p) => a + p.cents, 0);
  const parts = rest > 0 ? [...top, { name: "Other", cents: rest }] : top;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-[11px] text-teal-200/45">
        <span className="uppercase tracking-wider">{title}</span>
        <span>
          {seg.period === "FY" ? "year" : seg.period} to {monthLabel(seg.periodEnd)}
        </span>
      </div>
      <div className="flex h-3 w-full overflow-hidden rounded-full">
        {parts.map((p, i) => (
          <div key={p.name} className={SEG_SHADES[i % SEG_SHADES.length]} style={{ width: `${(p.cents / total) * 100}%` }} title={p.name} />
        ))}
      </div>
      <ul className="mt-2 space-y-1 text-xs">
        {parts.map((p, i) => (
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
    </div>
  );
}

function Segments({ v, revTerm }: { v: Company; revTerm: string }) {
  const { product, geographic } = v.segments;
  return (
    <div className="flex h-full flex-col space-y-2">
      <PanelHeader fresh="quarterly">Where the money comes from</PanelHeader>
      <Card className="flex-1 space-y-4 p-5">
        {!product && !geographic ? (
          <p className="text-sm text-teal-200/40">
            This company doesn&apos;t break its <Term k={revTerm}>sales</Term> into separate lines of business in our feed, or reports just one.
          </p>
        ) : (
          <>
            {product && <SegmentBar seg={product} title="By business" />}
            {geographic && <SegmentBar seg={geographic} title="By region" />}
          </>
        )}
        <p className="text-[11px] text-teal-200/40">
          <Term k="business-segment">Segments</Term> show which part of the company is doing the growing.
        </p>
      </Card>
    </div>
  );
}

const GUIDANCE_TONE: Record<string, "green" | "red" | "teal" | "dim"> = {
  raised: "green",
  introduced: "teal",
  maintained: "teal",
  lowered: "red",
  withdrawn: "red",
  none: "dim",
};

function CallPanel({ v }: { v: Company }) {
  const c = v.call;
  const s = c?.summary ?? null;
  return (
    <div className="flex h-full flex-col space-y-2">
      <PanelHeader fresh={c ? `call ${monthLabel(c.callDate)}` : "per quarter"} freshTitle="Summarized from the call transcript alone by Claude Haiku. Quotes are checked word for word against the transcript.">
        The last earnings call
      </PanelHeader>
      <Card className="flex-1 p-5 text-sm">
        {!c ? (
          <p className="text-teal-200/40">No <Term k="earnings-call">earnings-call</Term> transcript in our feed for this company.</p>
        ) : !s ? (
          <p className="text-teal-200/40">
            The {c.callDate} call (fiscal {c.fiscalYear} Q{c.fiscalQuarter}) isn&apos;t summarized yet. We summarize calls for names the fund holds, watches or
            trades, within about a day.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone={GUIDANCE_TONE[s.guidance.direction] ?? "dim"}>
                <Term k="guidance">guidance</Term> {s.guidance.direction === "none" ? "not given" : s.guidance.direction}
              </Chip>
              <Chip tone={s.tone === "confident" ? "green" : s.tone === "defensive" ? "red" : "teal"}>tone: {s.tone}</Chip>
              <span className="text-[11px] text-teal-200/40">
                fiscal {c.fiscalYear} Q{c.fiscalQuarter} · {c.callDate}
              </span>
            </div>
            <p className="font-semibold text-teal-50">{s.headline}</p>
            {s.guidance.detail && <p className="text-teal-100/75">{s.guidance.detail}</p>}
            {s.highlights.length > 0 && (
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.2em] text-teal-300/70">The numbers</div>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-teal-100/80">
                  {s.highlights.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </div>
            )}
            {s.dodged.length > 0 && (
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300/80">What they didn&apos;t answer</div>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-teal-100/80">
                  {s.dodged.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </div>
            )}
            {s.quotes.length > 0 && (
              <div className="space-y-2">
                {s.quotes.map((q, i) => (
                  <blockquote key={i} className="border-l-2 border-teal-400/30 pl-3 text-teal-100/75 italic">
                    “{q.text}” <span className="not-italic text-[11px] text-teal-200/45">— {q.speaker}</span>
                  </blockquote>
                ))}
              </div>
            )}
            <p className="text-[11px] text-teal-200/40">{s.toneWhy}</p>
          </div>
        )}
      </Card>
    </div>
  );
}

function FilingsPanel({ v }: { v: Company }) {
  const quarters = v.insider.slice(0, 4);
  return (
    <div className="flex h-full flex-col space-y-2">
      <PanelHeader fresh="daily">Filings &amp; insiders</PanelHeader>
      <Card className="flex-1 space-y-4 p-5 text-sm">
        {v.filings.length === 0 && quarters.length === 0 ? (
          <p className="text-teal-200/40">
            No US filings in our feed. Canadian companies file on SEDAR+, which our feed doesn&apos;t cover; insider trades for pure-TSX names come from Alfred&apos;s
            research.
          </p>
        ) : (
          <>
            {v.filings.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wider text-teal-200/50">
                  Recent <Term k="sec-filing">SEC filings</Term>
                </div>
                <ul className="mt-1.5 space-y-1">
                  {v.filings.slice(0, 6).map((f) => (
                    <li key={f.url} className="flex items-baseline justify-between gap-2 text-xs">
                      <a href={f.docUrl ?? f.url} target="_blank" rel="noreferrer" className="min-w-0 truncate">
                        <span className="font-mono font-semibold text-teal-200 hover:underline">{f.form}</span>{" "}
                        <span className="text-teal-100/60">{FORM_MEANING[f.form] ?? ""}</span>
                      </a>
                      <span className="shrink-0 tabular-nums text-teal-200/40">{f.filedAt}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {quarters.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wider text-teal-200/50">
                  <Term k="insider">Insider</Term> trades on the open market
                </div>
                <table className="mt-1.5 w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wider text-teal-200/40">
                      <th className="py-0.5 font-normal">Quarter</th>
                      <th className="py-0.5 text-right font-normal">Buys</th>
                      <th className="py-0.5 text-right font-normal">Sells</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quarters.map((q) => (
                      <tr key={`${q.year}-${q.quarter}`} className="border-t border-teal-400/10">
                        <td className="py-1 text-teal-100/70">
                          Q{q.quarter} {q.year}
                        </td>
                        <td className={`py-1 text-right tabular-nums ${q.buys > 0 ? "text-emerald-400" : "text-teal-200/40"}`}>{q.buys}</td>
                        <td className={`py-1 text-right tabular-nums ${q.sells > 0 ? "text-amber-300/80" : "text-teal-200/40"}`}>{q.sells}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-1.5 text-[10px] text-teal-200/40">Executives selling is common (pay comes in stock); executives buying with their own cash is the rarer signal.</p>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

