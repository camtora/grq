import { Chip, Pnl } from "@/components/ui";
import Term from "@/components/Term";
import { money } from "@/lib/money";
import Sparkline from "@/components/race/Sparkline";
import { glossaryKeyForModel } from "@/lib/race/models";
import { dialTone, type BullStanding } from "@/lib/race/bulls";

const ret = (p: number) => `${p >= 0 ? "+" : ""}${p.toFixed(2)}%`;
const retClass = (p: number) => (p > 0 ? "text-emerald-300" : p < 0 ? "text-red-300" : "text-teal-200/60");

/** One bull's leaderboard row — click to expand its holdings + recent calls. The color dot ties it
 *  to its line on the chart. */
export default function BullRow({ b, rank, color }: { b: BullStanding; rank: number; color: string }) {
  return (
    <details className="rounded-xl border border-teal-400/10 bg-teal-400/[0.02]">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-3">
        <span className="w-5 text-center text-sm font-bold tabular-nums text-teal-200/50">{rank}</span>
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="min-w-0 text-sm font-semibold text-teal-50">
              {(() => {
                const gkey = glossaryKeyForModel(b.model);
                return gkey ? <Term k={gkey}>{b.label}</Term> : b.label;
              })()}
            </span>
            <Chip tone={dialTone(b.dial)}>{b.dial}</Chip>
          </div>
          <div className="text-[10px] tabular-nums text-teal-200/40">
            {money(b.navCadCents)} CAD · {Math.round(b.cashPct)}% cash · {b.tradeCount} trade{b.tradeCount === 1 ? "" : "s"}
          </div>
        </div>
        <div className="hidden h-7 w-20 sm:block">
          <Sparkline data={b.navHistory.map((h) => h.returnPct)} />
        </div>
        <div className={`w-20 text-right text-sm font-bold tabular-nums ${retClass(b.returnPct)}`}>{ret(b.returnPct)}</div>
      </summary>

      <div className="border-t border-teal-400/10 p-3 text-xs">
        <div className="mb-1 font-semibold uppercase tracking-wider text-teal-200/40">Holdings</div>
        {b.holdings.length === 0 ? (
          <div className="text-teal-200/40">All cash.</div>
        ) : (
          <div className="space-y-1">
            {b.holdings.map((h) => (
              <div key={h.symbol} className="flex items-center justify-between gap-2">
                <span className="text-teal-50">
                  {h.symbol} <span className="text-teal-200/40">{h.qty} @ {money(h.avgCostCents)} {h.currency}</span>
                </span>
                <span className="tabular-nums text-teal-100/70">
                  {money(h.mvCadCents)} CAD <Pnl cents={h.unrealCadCents} className="text-[10px]" />
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="mb-1 mt-3 font-semibold uppercase tracking-wider text-teal-200/40">Recent calls</div>
        {b.calls.length === 0 ? (
          <div className="text-teal-200/40">No calls yet.</div>
        ) : (
          <div className="space-y-1">
            {b.calls.map((c, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className={`w-9 shrink-0 font-semibold ${c.action === "BUY" ? "text-emerald-300" : c.action === "SELL" ? "text-red-300" : "text-teal-200/40"}`}>{c.action ?? "—"}</span>
                <span className="min-w-0 flex-1 text-teal-100/70">
                  {c.symbol ? (
                    <span className="font-semibold text-teal-50">
                      {c.symbol}
                      {c.qty ? ` ×${c.qty}` : ""}
                    </span>
                  ) : null}
                  {c.thesis ? ` ${c.thesis}` : ""}
                  {c.filled ? <span className="text-emerald-300/70"> · filled</span> : c.rejectReason ? <span className="text-amber-300/70"> · rejected: {c.rejectReason}</span> : null}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}
