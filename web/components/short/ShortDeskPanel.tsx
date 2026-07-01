import { Card, Chip, Pnl } from "@/components/ui";
import PanelHeader from "@/components/PanelHeader";
import { money } from "@/lib/money";
import BullChart from "@/components/bulls/BullChart";
import ShortDeskControls from "./ShortDeskControls";
import type { ShortDeskView, ShortDeskArmView } from "@/lib/short/desk";

// The Short Lab agent A/B (Phase 2): control (long-only) vs treatment (long + short), same $100k stake.
// Which compounds better — does the power to bet against names help or hurt? Sandbox; the fund never shorts.
const ARM_COLOR: Record<string, string> = { control: "var(--spark-up)", treatment: "#fbbf24" };
const ret = (p: number) => `${p >= 0 ? "+" : ""}${p.toFixed(2)}%`;
const retClass = (p: number) => (p > 0 ? "text-emerald-300" : p < 0 ? "text-red-300" : "text-teal-200/60");

function ArmCard({ a }: { a: ShortDeskArmView }) {
  const treatment = a.arm === "treatment";
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: ARM_COLOR[a.arm] }} />
          <span className="text-sm font-semibold text-teal-50">{a.label}</span>
          <Chip tone={treatment ? "teal" : "dim"}>{treatment ? "long + short" : "long only"}</Chip>
        </div>
        <div className="text-right">
          <div className="text-sm font-bold tabular-nums text-teal-50">{money(a.equityCents)}</div>
          <div className={`text-xs font-bold tabular-nums ${retClass(a.returnPct)}`}>{ret(a.returnPct)}</div>
        </div>
      </div>
      <div className="mt-1 text-[10px] tabular-nums text-teal-200/40">{Math.round((a.cashCents / Math.max(1, a.equityCents)) * 100)}% cash · {a.tradeCount} trades · realized <Pnl cents={a.realizedCents} className="text-[10px]" /></div>

      {a.longs.length > 0 ? (
        <div className="mt-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300/50">Long</div>
          {a.longs.map((p) => (
            <div key={p.symbol} className="flex items-center justify-between text-[11px]">
              <span className="text-teal-100/80">{p.qty} {p.symbol} <span className="text-teal-200/40">@ {money(p.avgCostCents)}</span></span>
              <Pnl cents={p.unrealCents} className="text-[10px]" />
            </div>
          ))}
        </div>
      ) : null}
      {a.shorts.length > 0 ? (
        <div className="mt-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-red-300/50">Short</div>
          {a.shorts.map((p) => (
            <div key={p.symbol} className="flex items-center justify-between text-[11px]">
              <span className="text-teal-100/80">SHORT {p.qty} {p.symbol} <span className="text-teal-200/40">@ {money(p.avgCostCents)}</span></span>
              <Pnl cents={p.unrealCents} className="text-[10px]" />
            </div>
          ))}
        </div>
      ) : null}

      {a.calls.length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wider text-teal-200/40">Recent calls</summary>
          <div className="mt-1 space-y-1">
            {a.calls.slice(0, 6).map((c, i) => (
              <div key={i} className="text-[11px] text-teal-100/70">
                <span className={`font-semibold ${c.action === "SHORT" ? "text-red-300" : c.action === "BUY" ? "text-emerald-300" : "text-teal-200/50"}`}>{c.action ?? "—"}</span> {c.symbol ?? ""}
                {c.thesis ? <span className="text-teal-200/50"> — {c.thesis}</span> : null}
                {c.filled ? <span className="text-emerald-300/60"> · filled</span> : c.rejectReason ? <span className="text-amber-300/60"> · {c.rejectReason}</span> : null}
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </Card>
  );
}

export default function ShortDeskPanel({ view, isMember }: { view: ShortDeskView; isMember: boolean }) {
  const hasHistory = view.arms.some((a) => a.navHistory.length >= 2);
  const off = !view.agentEnabled;
  return (
    <div className="space-y-2">
      <PanelHeader right={isMember ? <ShortDeskControls status={view.desk.status} /> : undefined}>
        Agent A/B — {view.desk.name}
      </PanelHeader>

      <Card className={`p-4 ${off || view.desk.status !== "RUNNING" ? "border-amber-400/20" : ""}`}>
        <p className="text-xs leading-relaxed text-teal-100/70">
          Two Opus agents, same ${(view.desk.startingStakeCents / 100 / 1000).toFixed(0)}k stake and menu, one difference: the <span className="font-semibold text-amber-300">treatment</span> may also <em>short</em> names it thinks will fall (the <span className="font-semibold text-emerald-300">control</span> is long-only, like the fund). Which compounds better — does betting against names help, or does the unbounded downside + borrow cost + margin calls drag it? Modeled sandbox; the fund never shorts.
        </p>
        {off ? (
          <p className="mt-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.05] p-2 text-[11px] text-amber-200/80">
            The A/B is <span className="font-semibold">off</span> — it runs Opus sessions on Cam&apos;s quota. Set <code className="text-amber-300">GRQ_SHORTLAB_AGENT=true</code> and Start it to run. It won&apos;t place any sessions until then.
          </p>
        ) : view.desk.status !== "RUNNING" ? (
          <p className="mt-2 text-[11px] text-amber-200/70">Enabled but {view.desk.status.toLowerCase()} — a member hits Start to run it {view.desk.cadence}.</p>
        ) : (
          <p className="mt-2 text-[11px] text-emerald-200/70">Running {view.desk.cadence} during market hours.</p>
        )}

        {hasHistory ? (
          <div className="mt-3 max-w-2xl">
            <BullChart height={180} series={view.arms.map((a) => ({ label: a.label, color: ARM_COLOR[a.arm] ?? "var(--spark-up)", points: a.navHistory }))} />
          </div>
        ) : null}

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {view.arms.map((a) => <ArmCard key={a.id} a={a} />)}
        </div>
      </Card>
    </div>
  );
}
