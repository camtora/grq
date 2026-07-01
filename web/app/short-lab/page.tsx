import { PageHeader, Card, StatCard, EmptyState, Pnl } from "@/components/ui";
import PanelHeader from "@/components/PanelHeader";
import { money } from "@/lib/money";
import { getSession } from "@/lib/session";
import { loadShortLab } from "@/lib/short/lab";
import { loadShortDesk } from "@/lib/short/desk";
import { loadShadow } from "@/lib/short/shadow";
import ShortDeskPanel from "@/components/short/ShortDeskPanel";
import ShadowPanel from "@/components/short/ShadowPanel";
import BullChart from "@/components/bulls/BullChart";
import Sparkline from "@/components/Sparkline";
import OpenShortForm from "@/components/short/OpenShortForm";
import ShortControls from "@/components/short/ShortControls";
import ShortPositionCard from "@/components/short/ShortPositionCard";
import ShortEducation from "@/components/short/ShortEducation";

// The Short Lab — a permanently sandboxed study of short selling (docs/SHORT-LAB.md, D101). Modeled,
// never executable; the fund never shorts (rule #3). You open modeled shorts on real names and watch
// them evolve — P&L, borrow carry, and the forced-cover margin call.
export const dynamic = "force-dynamic";

const retClass = (p: number) => (p > 0 ? "text-emerald-300" : p < 0 ? "text-red-300" : "text-teal-200/60");

export default async function ShortLabPage() {
  const [session, view, deskView, shadowView] = await Promise.all([getSession(), loadShortLab(), loadShortDesk(), loadShadow()]);
  const isMember = session?.role === "member";
  const h = view.health;

  return (
    <main>
      <PageHeader
        title="The Short Lab"
        sub="Short selling is the one bet the fund can't make — and the only one with unbounded loss. Open modeled shorts on real names, watch them evolve, and learn why shorts blow up. A pure sandbox: nothing here ever trades a real short."
        right={isMember ? <ShortControls /> : null}
      />

      {/* book stat strip */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard compact label="Equity" value={money(view.equityCents)} note={`${view.lab.status.toLowerCase()} · $${(view.lab.startingCashCents / 100 / 1000).toFixed(0)}k start`} />
        <StatCard compact label="Cash" value={money(view.lab.cashCents)} note="incl. short proceeds" />
        <StatCard compact label="Short exposure" value={money(view.shortMktValCents)} valueClassName="text-red-300" note={`${view.open.length} open short${view.open.length === 1 ? "" : "s"}`} />
        <StatCard compact label="Realized P&L" value={<Pnl cents={view.realizedCents} />} note="closed + called" />
      </div>

      {/* margin health */}
      <Card className={`mb-4 p-4 ${h.call ? "border-red-400/40 bg-red-400/[0.05]" : ""}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-teal-300/70">Margin health</div>
          <div className="text-[11px] tabular-nums text-teal-200/60">
            equity {money(h.equityCents)} · maintenance needs {money(h.requiredCents)} ({view.lab.maintMarginPct}%) ·{" "}
            <span className={h.call ? "font-bold text-red-300" : "text-teal-200/60"}>{h.call ? "MARGIN CALL — force-covering" : `${money(h.cushionCents)} cushion`}</span>
          </div>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-teal-400/10">
          <div className={`h-full rounded-full ${h.usedPct >= 100 ? "bg-red-400" : h.usedPct >= 70 ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${Math.min(100, h.usedPct)}%` }} />
        </div>
        <div className="mt-1 text-[10px] text-teal-200/40">Margin used {Math.min(999, h.usedPct)}% of equity — at 100% the lab force-covers your worst short (a modeled margin call).</div>
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        {/* left: open a short + the positions */}
        <div className="space-y-4 lg:col-span-2">
          {isMember ? (
            <div className="space-y-2">
              <PanelHeader>Open a short</PanelHeader>
              <Card className="p-4"><OpenShortForm /></Card>
            </div>
          ) : null}

          <div className="space-y-2">
            <PanelHeader>Open shorts</PanelHeader>
            {view.open.length === 0 ? (
              <EmptyState title="No open shorts" body={isMember ? "Short a real name above and watch it play out — for the lesson, not the money." : "No modeled shorts are open right now."} />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {view.open.map((o) => <ShortPositionCard key={o.id} h={o} isMember={isMember} />)}
              </div>
            )}
          </div>

          {view.history.length > 0 ? (
            <div className="space-y-2">
              <PanelHeader>Resolved — the lessons</PanelHeader>
              <div className="space-y-2">
                {view.history.map((r) => (
                  <div key={r.id} className={`rounded-lg border p-3 ${r.side === "MARGIN_CALL" ? "border-red-400/25 bg-red-400/[0.05]" : "border-teal-400/10 bg-teal-400/[0.02]"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-teal-50/90">
                        {r.qty} {r.symbol} @ {money(r.avgShortCents)} → {money(r.exitCents)}
                        <span className={`ml-1.5 text-[10px] uppercase tracking-wider ${r.side === "MARGIN_CALL" ? "text-red-300" : "text-teal-200/40"}`}>{r.side === "MARGIN_CALL" ? "margin call" : "covered"}</span>
                      </span>
                      <span className="tabular-nums"><Pnl cents={r.realizedPnlCents} className="text-[11px]" /> <span className={`text-[10px] ${retClass(r.returnPct)}`}>{r.returnPct >= 0 ? "+" : ""}{r.returnPct.toFixed(0)}%</span></span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-teal-100/60">{r.card}</p>
                    {r.decay.length >= 2 ? <div className="mt-1.5 text-teal-200/15"><Sparkline values={r.decay} height={32} area className="h-8 w-full max-w-xs" /></div> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* right rail: equity curve + education */}
        <div className="space-y-4 lg:col-span-1">
          <div className="space-y-2">
            <PanelHeader>Equity over time</PanelHeader>
            <Card className="p-3">
              {view.navHistory.length >= 2 ? (
                <BullChart height={180} series={[{ label: "Short Lab", color: "var(--spark-down)", points: view.navHistory }]} />
              ) : (
                <p className="p-4 text-center text-xs text-teal-200/40">Open a short to start the equity curve.</p>
              )}
            </Card>
          </div>
          <ShortEducation />
        </div>
      </div>

      <div className="mt-6">
        <ShadowPanel view={shadowView} />
      </div>

      <div className="mt-6">
        <ShortDeskPanel view={deskView} isMember={isMember} />
      </div>

      <p className="mt-4 text-[11px] text-teal-200/40">
        Sandbox · modeled, never executable · the fund never shorts (a hard guardrail). Prices are live/delayed quotes; borrow cost + margin are modeled. Single virtual book, no FX.
      </p>
    </main>
  );
}
