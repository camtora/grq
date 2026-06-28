import { Chip, Pnl } from "@/components/ui";
import { money } from "@/lib/money";
import Sparkline from "@/components/race/Sparkline";
import type { DeskStanding } from "@/lib/options-desk/desk";

const ret = (p: number) => `${p >= 0 ? "+" : ""}${p.toFixed(2)}%`;
const retClass = (p: number) => (p > 0 ? "text-emerald-300" : p < 0 ? "text-red-300" : "text-teal-200/60");

/** One arm's row — control (stock-only) or treatment (stock + options). Expands to its holdings (with
 *  the plain-English option teaching cards) + recent calls. The dot color ties it to the NAV chart. */
export default function DeskRow({ a, color }: { a: DeskStanding; color: string }) {
  const stocks = a.holdings.filter((h) => h.kind === "STOCK");
  const options = a.holdings.filter((h) => h.kind !== "STOCK");
  const isTreatment = a.arm === "treatment";
  return (
    <details className="rounded-xl border border-teal-400/10 bg-teal-400/[0.02]" open>
      <summary className="flex cursor-pointer list-none items-center gap-3 p-3">
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: color }} title={a.label} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="min-w-0 text-sm font-semibold text-teal-50">{a.label}</span>
            <Chip tone={isTreatment ? "teal" : "dim"}>{isTreatment ? "options" : "stock-only"}</Chip>
          </div>
          <div className="text-[10px] tabular-nums text-teal-200/40">
            {money(a.navCadCents)} CAD · {Math.round(a.cashPct)}% cash · {a.tradeCount} trade{a.tradeCount === 1 ? "" : "s"}
            {isTreatment ? ` · ${a.openOptionCount} open option${a.openOptionCount === 1 ? "" : "s"}` : ""}
          </div>
        </div>
        <div className="hidden h-7 w-20 sm:block">
          <Sparkline data={a.navHistory.map((h) => h.returnPct)} />
        </div>
        <div className={`w-20 text-right text-sm font-bold tabular-nums ${retClass(a.returnPct)}`}>{ret(a.returnPct)}</div>
      </summary>

      <div className="border-t border-teal-400/10 p-3 text-xs">
        {options.length > 0 ? (
          <>
            <div className="mb-1 font-semibold uppercase tracking-wider text-amber-300/60">Option positions</div>
            <div className="mb-3 space-y-2">
              {options.map((h, i) => (
                <div key={i} className="rounded-lg border border-amber-400/15 bg-amber-400/[0.03] p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-teal-50">
                      {h.underlying} {h.expiry} {money(h.strikeCents ?? 0)} {h.kind} <span className="text-teal-200/40">×{h.qty}</span>
                    </span>
                    <span className="tabular-nums text-teal-100/70">
                      {money(h.mvCadCents)} CAD <Pnl cents={h.unrealCadCents} className="text-[10px]" />
                    </span>
                  </div>
                  <div className="mt-1 leading-relaxed text-teal-100/60">{h.card}</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] tabular-nums text-teal-200/40">
                    <span>paid {money(h.avgCostCents)}/sh</span>
                    <span>mark {money(h.markCents)}/sh</span>
                    <span>breakeven {money(h.breakevenCents ?? 0)}</span>
                    <span>max loss {money(h.maxLossCadCents ?? 0)} CAD</span>
                    <span>{h.daysLeft}d left</span>
                  </div>
                  {h.decay && h.decay.length >= 2 ? (
                    <div className="mt-1.5">
                      <div className="h-6 w-full max-w-[200px] text-teal-200/15">
                        <Sparkline data={h.decay} />
                      </div>
                      <div className="text-[9px] text-teal-200/30">premium vs entry — drifting below the line is time decay at work</div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </>
        ) : null}

        {a.resolved.length > 0 ? (
          <>
            <div className="mb-1 font-semibold uppercase tracking-wider text-teal-200/40">Resolved options</div>
            <div className="mb-3 space-y-2">
              {a.resolved.map((r, i) => (
                <div key={i} className="rounded-lg border border-teal-400/10 bg-teal-400/[0.02] p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-teal-50/90">
                      {r.underlying} {r.expiry} {money(r.strikeCents ?? 0)} {r.kind} <span className="text-teal-200/40">×{r.qty}</span>
                      <span className="ml-1.5 text-[10px] uppercase tracking-wider text-teal-200/40">{r.side === "EXPIRE" ? "expired" : "closed"}</span>
                    </span>
                    <span className="tabular-nums">
                      <Pnl cents={r.realizedPnlCents ?? 0} className="text-[10px]" /> <span className={`text-[10px] ${retClass(r.returnPct)}`}>{ret(r.returnPct)}</span>
                    </span>
                  </div>
                  <div className="mt-1 leading-relaxed text-teal-100/60">{r.card}</div>
                </div>
              ))}
            </div>
          </>
        ) : null}

        <div className="mb-1 font-semibold uppercase tracking-wider text-teal-200/40">Stock holdings</div>
        {stocks.length === 0 ? (
          <div className="text-teal-200/40">No stock positions.</div>
        ) : (
          <div className="space-y-1">
            {stocks.map((h) => (
              <div key={h.underlying} className="flex items-center justify-between gap-2">
                <span className="text-teal-50">
                  {h.underlying} <span className="text-teal-200/40">{h.qty} @ {money(h.avgCostCents)} {h.currency}</span>
                </span>
                <span className="tabular-nums text-teal-100/70">
                  {money(h.mvCadCents)} CAD <Pnl cents={h.unrealCadCents} className="text-[10px]" />
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="mb-1 mt-3 font-semibold uppercase tracking-wider text-teal-200/40">Recent calls</div>
        {a.calls.length === 0 ? (
          <div className="text-teal-200/40">No calls yet.</div>
        ) : (
          <div className="space-y-1">
            {a.calls.map((c, i) => {
              const isOpt = c.action === "BUY_OPTION" || c.action === "SELL_OPTION";
              const verb = c.action === "BUY" ? "BUY" : c.action === "SELL" ? "SELL" : c.action === "BUY_OPTION" ? "BUY OPT" : c.action === "SELL_OPTION" ? "CLOSE" : c.action ?? "—";
              const tone = c.action === "BUY" || c.action === "BUY_OPTION" ? "text-emerald-300" : c.action === "SELL" || c.action === "SELL_OPTION" ? "text-red-300" : "text-teal-200/40";
              return (
                <div key={i} className="flex items-start gap-2">
                  <span className={`w-14 shrink-0 font-semibold ${tone}`}>{verb}</span>
                  <span className="min-w-0 flex-1 text-teal-100/70">
                    {c.underlying ? (
                      <span className="font-semibold text-teal-50">
                        {c.underlying}
                        {isOpt && c.right ? ` ${c.strikeCents ? money(c.strikeCents) + " " : ""}${c.right}` : ""}
                        {c.qty ? ` ×${c.qty}` : ""}
                      </span>
                    ) : null}
                    {c.thesis ? ` ${c.thesis}` : ""}
                    {c.filled ? <span className="text-emerald-300/70"> · filled</span> : c.rejectReason ? <span className="text-amber-300/70"> · rejected: {c.rejectReason}</span> : null}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </details>
  );
}
