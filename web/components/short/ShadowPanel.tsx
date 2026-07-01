import { Card, Pnl } from "@/components/ui";
import PanelHeader from "@/components/PanelHeader";
import { money } from "@/lib/money";
import type { ShadowView } from "@/lib/short/shadow";

// "What if we'd shorted our exits?" (Phase 3) — every real-fund SELL, shadow-shorted at the sell price
// and marked over time. Teaches whether our exits keep falling. Modeled sandbox; the fund never shorts.
const retClass = (p: number) => (p > 0 ? "text-emerald-300" : p < 0 ? "text-red-300" : "text-teal-200/60");

export default function ShadowPanel({ view }: { view: ShadowView }) {
  return (
    <div className="space-y-2">
      <PanelHeader>Shadow shorts — what if we&apos;d shorted our exits?</PanelHeader>
      <Card className="p-4">
        <p className="text-xs leading-relaxed text-teal-100/70">
          Every time the fund <em>sells</em> a name, we open a modeled short at that price here — asking &ldquo;what if, instead of just exiting, we&apos;d flipped to short?&rdquo; It&apos;s a running lesson on whether our exits tend to keep falling. The fund never actually shorts (rule #3); this is pure observation.
        </p>

        {view.count === 0 ? (
          <p className="mt-3 text-sm text-teal-200/50">No exits shadowed yet — this fills in as the fund sells names.</p>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs">
              <span className="text-teal-200/50">Exits shadowed: <span className="font-semibold tabular-nums text-teal-100">{view.count}</span></span>
              <span className="text-teal-200/50">Avg return shorting them: <span className={`font-semibold tabular-nums ${retClass(view.avgReturnPct)}`}>{view.avgReturnPct >= 0 ? "+" : ""}{view.avgReturnPct.toFixed(1)}%</span></span>
              <span className="text-teal-200/50">Would&apos;ve profited: <span className="font-semibold tabular-nums text-teal-100">{view.winRatePct}%</span></span>
              <span className="text-teal-200/50">Modeled P&L: <Pnl cents={view.totalUnrealCents} className="text-xs font-semibold" /></span>
            </div>
            <p className="mt-1 text-[11px] text-teal-200/40">
              {view.avgReturnPct > 3 ? "Our exits have tended to keep falling — shorting them would've paid (a signal our sell discipline is timely)." : view.avgReturnPct < -3 ? "Our exits have tended to bounce — shorting them would've hurt, a caution against betting they keep dropping." : "Roughly a wash so far — our exits neither cratered nor bounced hard."}
            </p>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-[11px]">
                <thead className="text-[10px] uppercase tracking-wider text-teal-200/40">
                  <tr>
                    <th className="py-1 pr-3 font-semibold">Name</th>
                    <th className="py-1 pr-3 text-right font-semibold">Sold at</th>
                    <th className="py-1 pr-3 text-right font-semibold">Now</th>
                    <th className="py-1 pr-3 text-right font-semibold">Short P&L</th>
                    <th className="py-1 text-right font-semibold">Held</th>
                  </tr>
                </thead>
                <tbody>
                  {view.positions.slice(0, 14).map((p, i) => (
                    <tr key={i} className="border-t border-teal-400/5">
                      <td className="py-1 pr-3 font-semibold text-teal-100/80">{p.qty} {p.symbol}</td>
                      <td className="py-1 pr-3 text-right tabular-nums text-teal-200/60">{money(p.avgShortCents)}</td>
                      <td className="py-1 pr-3 text-right tabular-nums text-teal-200/60">{money(p.markCents)}</td>
                      <td className="py-1 pr-3 text-right tabular-nums"><Pnl cents={p.unrealCents} className="text-[11px]" /> <span className={`${retClass(p.returnPct)}`}>{p.returnPct >= 0 ? "+" : ""}{p.returnPct.toFixed(0)}%</span></td>
                      <td className="py-1 text-right tabular-nums text-teal-200/40">{p.daysHeld}d</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
