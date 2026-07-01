import Link from "next/link";
import { Card, Pnl, Chip } from "@/components/ui";
import PanelHeader from "@/components/PanelHeader";
import Sparkline from "@/components/Sparkline";
import { money } from "@/lib/money";
import type { DeskView, DeskHolding, DeskResolved } from "@/lib/options-desk/desk";

// The Experiment tab (Phase 3, docs/OPTIONS-PORTAL.md): surface the Options Desk's ACTUAL fake option
// contracts — the treatment Opus's open calls/puts — with their plain-English card, break-even/max-loss,
// the value-over-time (decay) line, and a one-click "load into calculator." Read-only; reuses loadDesk()
// so the numbers always match the desk board. Modeled, never executable.

// A held option → the calculator deep link (sym + strat + the exact strike/expiry so the chain selects
// that contract and prices it live).
function calcHref(h: DeskHolding): string {
  const strat = h.kind === "CALL" ? "long-call" : "long-put";
  const strikeDollars = ((h.strikeCents ?? 0) / 100).toString();
  const q = new URLSearchParams({ tab: "calculator", sym: h.underlying, strat, strike: strikeDollars });
  if (h.expiry) q.set("exp", h.expiry);
  return `/options?${q.toString()}`;
}

function OpenOption({ h }: { h: DeskHolding }) {
  return (
    <div className="rounded-lg border border-amber-400/15 bg-amber-400/[0.03] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-teal-50">
          {h.underlying} {h.expiry} {money(h.strikeCents ?? 0)} {h.kind} <span className="text-teal-200/40">×{h.qty}</span>
        </span>
        <span className="shrink-0 tabular-nums text-xs text-teal-100/70">
          {money(h.mvCadCents)} CAD <Pnl cents={h.unrealCadCents} className="text-[10px]" />
        </span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-teal-100/65">{h.card}</p>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] tabular-nums text-teal-200/40">
        <span>paid {money(h.avgCostCents)}/sh</span>
        <span>mark {money(h.markCents)}/sh</span>
        <span>breakeven {money(h.breakevenCents ?? 0)}</span>
        <span>max loss {money(h.maxLossCadCents ?? 0)} CAD</span>
        <span>{h.daysLeft}d left</span>
      </div>
      {h.decay && h.decay.length >= 2 ? (
        <div className="mt-2">
          <div className="text-teal-200/15">
            <Sparkline values={h.decay} height={40} area className="h-10 w-full max-w-xs" />
          </div>
          <div className="text-[9px] text-teal-200/35">premium vs entry over time — drifting below the line is time decay at work</div>
        </div>
      ) : null}
      <Link href={calcHref(h)} className="mt-2 inline-block text-xs text-teal-300 hover:underline">
        Load into calculator →
      </Link>
    </div>
  );
}

function ResolvedOption({ r }: { r: DeskResolved }) {
  const ret = `${r.returnPct >= 0 ? "+" : ""}${r.returnPct.toFixed(0)}%`;
  return (
    <div className="rounded-lg border border-teal-400/10 bg-teal-400/[0.02] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-teal-50/90">
          {r.underlying} {r.expiry} {money(r.strikeCents ?? 0)} {r.kind} <span className="text-teal-200/40">×{r.qty}</span>
          <span className="ml-1.5 text-[10px] uppercase tracking-wider text-teal-200/40">{r.side === "EXPIRE" ? "expired" : "closed"}</span>
        </span>
        <span className="shrink-0 tabular-nums">
          <Pnl cents={r.realizedPnlCents ?? 0} className="text-[10px]" /> <span className={`text-[10px] ${r.returnPct >= 0 ? "text-emerald-300" : "text-red-300"}`}>{ret}</span>
        </span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-teal-100/65">{r.card}</p>
      {r.decay && r.decay.length >= 2 ? (
        <div className="mt-2">
          <div className="text-teal-200/15">
            <Sparkline values={r.decay} height={40} area className="h-10 w-full max-w-xs" />
          </div>
          <div className="text-[9px] text-teal-200/35">premium vs entry over its life — how the value bled (or ran) to the finish</div>
        </div>
      ) : null}
    </div>
  );
}

export default function ExperimentOptions({ view }: { view: DeskView | null }) {
  const arms = view?.arms ?? [];
  const armsWithOptions = arms
    .map((a) => ({ a, open: a.holdings.filter((h) => h.kind !== "STOCK"), resolved: a.resolved }))
    .filter((x) => x.open.length > 0 || x.resolved.length > 0);

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-teal-300/70">The Options Desk experiment</div>
        <p className="max-w-2xl text-sm leading-relaxed text-teal-100/75">
          The fund runs a live A/B sandbox: one Opus only buys and sells stocks (exactly what the fund does today); the other can{" "}
          <em>also</em> buy calls and puts. Below are the treatment&apos;s actual option positions — the same fake contracts on the{" "}
          <Link href="/options-desk" className="text-teal-300 hover:underline">desk board</Link> — each one you can drop into the calculator to
          poke at its payoff and watch the premium decay over time.
        </p>
      </Card>

      {armsWithOptions.length === 0 ? (
        <Card className="p-8 text-center">
          <div className="text-base font-semibold text-teal-50">No option positions on the desk right now</div>
          <p className="mx-auto mt-2 max-w-md text-sm text-teal-200/50">
            The treatment hasn&apos;t opened any contracts yet (or they&apos;ve all resolved). Check the{" "}
            <Link href="/options-desk" className="text-teal-300 hover:underline">Options Desk</Link> for the full board, or try a hypothetical on the{" "}
            <Link href="/options?tab=calculator" className="text-teal-300 hover:underline">calculator</Link>.
          </p>
        </Card>
      ) : (
        armsWithOptions.map(({ a, open, resolved }) => (
          <div key={a.entrantId} className="space-y-2">
            <PanelHeader>
              {a.label} <Chip tone="teal">options</Chip>
            </PanelHeader>
            <div className="space-y-2">
              {open.length > 0 ? (
                <>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-300/60">Open</div>
                  {open.map((h, i) => <OpenOption key={i} h={h} />)}
                </>
              ) : null}
              {resolved.length > 0 ? (
                <>
                  <div className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-teal-200/40">Resolved — the punchline</div>
                  {resolved.map((r, i) => <ResolvedOption key={i} r={r} />)}
                </>
              ) : null}
            </div>
          </div>
        ))
      )}

      <p className="text-[11px] text-teal-200/40">
        Pure sandbox — these contracts never touch the real fund, the order gate, or the broker, and they&apos;re never real options. Prices are modeled (CBOE delayed mid, or Black-Scholes from implied volatility).
      </p>
    </div>
  );
}
