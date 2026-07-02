import { PageHeader, Card, StatCard, EmptyState, Pnl } from "@/components/ui";
import PanelHeader from "@/components/PanelHeader";
import { money } from "@/lib/money";
import { getSession } from "@/lib/session";
import { loadDayLab } from "@/lib/day/lab";
import BullChart from "@/components/bulls/BullChart";
import DayControls from "@/components/day/DayControls";
import DayEducation from "@/components/day/DayEducation";

// The Day-Trading Lab — prove it vs buy-and-hold (docs/DAY-TRADE-LAB.md, D103). A Trader arm (you,
// churning intraday) vs a Holder arm (buy once, hold), same name + day + cash. Modeled, never
// executable; the fund is code-blocked from same-day round trips (§6).
export const dynamic = "force-dynamic";

const retClass = (p: number) => (p > 0 ? "text-emerald-300" : p < 0 ? "text-red-300" : "text-teal-200/60");
const pctStr = (c: number, start: number) => `${c >= 0 ? "+" : ""}${start > 0 ? ((c / start) * 100).toFixed(2) : "0"}%`;

export default async function DayLabPage() {
  const [session, view] = await Promise.all([getSession(), loadDayLab()]);
  const isMember = session?.role === "member";
  const lab = view.lab;
  const traderWinning = lab ? lab.traderPlCents > lab.holderPlCents : false;

  return (
    <main>
      <PageHeader
        title="The Day-Trading Lab"
        sub="Day-trade a real name against a Holder who just buys once and sits — same stock, same day, and $50,000 of virtual buying power each. Watch whether frantic in-and-out beats patience after the spread and commissions. A pure sandbox: the fund can't day-trade, and nothing here is real."
      />

      {isMember ? (
        <Card className="mb-4 p-4">
          <DayControls open={lab?.status === "OPEN"} symbol={lab?.symbol ?? null} />
        </Card>
      ) : null}

      {!lab ? (
        <EmptyState title="No lab yet" body={isMember ? "Pick a ticker above and start a lab — then trade it against the buy-and-hold twin." : "No day-trading lab has been started yet."} />
      ) : (
        <>
          {/* buying-power / cash line — so the stake is never a mystery */}
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-teal-200/60">
            <span className="font-semibold text-teal-50">{lab.symbol}</span>
            <span>{money(lab.startingCashCents)} {lab.currency} per book</span>
            <span>·</span>
            <span>Trader: <span className="font-semibold text-teal-100">{money(lab.traderCashCents)}</span> cash + {lab.traderShares} sh (≈{money(lab.traderEquityCents)} equity)</span>
            <span>·</span>
            <span>Holder: {lab.holderShares} sh {lab.holderShares > 0 ? `@ ${money(lab.holderEntryCents ?? 0)}` : "(mirrors your first buy)"}</span>
          </div>

          {/* the verdict strip */}
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard compact label={`Trader — ${lab.symbol}`} value={<Pnl cents={lab.traderPlCents} />} valueClassName={retClass(lab.traderPlCents)} note={`${pctStr(lab.traderPlCents, lab.startingCashCents)} · ${lab.roundTrips} round trip${lab.roundTrips === 1 ? "" : "s"}`} />
            <StatCard compact label="Holder (buy & hold)" value={<Pnl cents={lab.holderPlCents} />} valueClassName={retClass(lab.holderPlCents)} note={pctStr(lab.holderPlCents, lab.startingCashCents)} />
            <StatCard compact label="Trader's cost to churn" value={money(lab.feesCents + lab.spreadCents)} valueClassName="text-amber-300" note={`${money(lab.feesCents)} fees + ${money(lab.spreadCents)} spread`} />
            <StatCard compact label="Who's ahead?" value={traderWinning ? "Trader" : "Holder"} valueClassName={traderWinning ? "text-emerald-300" : "text-teal-100"} note={traderWinning ? "churning is winning… for now" : "patience is winning"} />
          </div>

          {/* the honest verdict line */}
          <Card className={`mb-4 p-3 text-xs leading-relaxed ${traderWinning ? "border-teal-400/15" : "border-emerald-400/20 bg-emerald-400/[0.04]"}`}>
            {traderWinning ? (
              <span className="text-teal-100/75">The Trader is ahead of the Holder by {money(lab.traderPlCents - lab.holderPlCents)} right now — but they&apos;ve paid {money(lab.feesCents + lab.spreadCents)} in fees + spread to get there, and one bad exit can flip it. Keep going, or Flatten &amp; close for the final tally.</span>
            ) : (
              <span className="text-teal-100/80">The Holder — who bought {lab.holderShares > 0 ? `${lab.holderShares} ${lab.symbol}` : "the same lot"} once and did nothing — is ahead by <span className="font-semibold text-emerald-300">{money(lab.holderPlCents - lab.traderPlCents)}</span>. The Trader&apos;s {money(lab.feesCents + lab.spreadCents)} in fees + spread is the gap. This is the whole lesson: churn has to beat its own costs before it beats sitting still.</span>
            )}
          </Card>

          <div className="grid items-start gap-4 lg:grid-cols-3">
            {/* left: chart + trade log */}
            <div className="space-y-4 lg:col-span-2">
              <div className="space-y-2">
                <PanelHeader>Trader vs Holder — equity over the session</PanelHeader>
                <Card className="p-3">
                  {view.chart.length >= 2 ? (
                    <BullChart height={220} series={[
                      { label: "Trader (churning)", color: "#fbbf24", points: view.chart.map((c) => ({ at: c.at, returnPct: c.traderPct })) },
                      { label: "Holder (buy & hold)", color: "var(--spark-up)", points: view.chart.map((c) => ({ at: c.at, returnPct: c.holderPct })) },
                    ]} />
                  ) : (
                    <p className="p-4 text-center text-xs text-teal-200/40">Make your first buy to start the two equity lines.</p>
                  )}
                </Card>
              </div>

              <div className="space-y-2">
                <PanelHeader>Your trades — {lab.symbol} @ {money(lab.markCents)} {lab.currency} {lab.status === "OPEN" ? "(live)" : "(closed)"}</PanelHeader>
                {view.trades.length === 0 ? (
                  <Card className="p-4 text-sm text-teal-200/50">No trades yet. Buy some {lab.symbol} — the Holder will mirror your first buy and then sit.</Card>
                ) : (
                  <div className="space-y-1.5">
                    {view.trades.map((t, i) => (
                      <div key={i} className="rounded-lg border border-teal-400/10 bg-teal-400/[0.02] p-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`font-semibold ${t.side === "BUY" ? "text-emerald-300" : "text-red-300"}`}>{t.side} {t.shares} @ {money(t.priceCents)}</span>
                          {t.realizedPnlCents != null ? <Pnl cents={t.realizedPnlCents} className="text-[10px]" /> : <span className="text-[10px] text-teal-200/40">−{money(t.commissionCents)} fee</span>}
                        </div>
                        {t.card ? <div className="mt-0.5 text-teal-100/55">{t.card}</div> : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* right: education + prior verdicts */}
            <div className="space-y-4 lg:col-span-1">
              <DayEducation />
              {view.history.length > 0 ? (
                <div className="space-y-2">
                  <PanelHeader>Past rounds — did churning win?</PanelHeader>
                  <Card className="p-3">
                    <div className="space-y-1 text-[11px]">
                      {view.history.map((h) => {
                        const traderWon = h.traderPlCents > h.holderPlCents;
                        return (
                          <div key={h.id} className="flex items-center justify-between gap-2 border-b border-teal-400/5 pb-1 last:border-0">
                            <span className="text-teal-100/70">{h.symbol} <span className="text-teal-200/40">{h.tradingDate} · {h.roundTrips} trips</span></span>
                            <span className={`font-semibold ${traderWon ? "text-amber-300" : "text-emerald-300"}`}>{traderWon ? "Trader" : "Holder"} by {money(Math.abs(h.traderPlCents - h.holderPlCents))}</span>
                          </div>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-[10px] text-teal-200/40">Holder wins {view.history.filter((h) => h.holderPlCents >= h.traderPlCents).length}/{view.history.length} rounds so far.</p>
                  </Card>
                </div>
              ) : null}
            </div>
          </div>
        </>
      )}

      <p className="mt-4 text-[11px] text-teal-200/40">
        Sandbox · modeled, never executable · the fund is code-blocked from same-day round trips. Fills cross the live (delayed) bid/ask; commissions use the IBKR model. Single virtual book, no FX.
      </p>
    </main>
  );
}
