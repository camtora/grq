import { getPortfolio } from "@/lib/portfolio";
import { getBroker } from "@/lib/broker";
import { money, pct } from "@/lib/money";
import { Card, PageHeader, StatCard, Pnl, EmptyState } from "@/components/ui";
import OrderTicket from "@/components/OrderTicket";

export default async function Portfolio() {
  const [pf, symbols] = await Promise.all([getPortfolio(), getBroker().listSymbols()]);

  return (
    <main>
      <PageHeader
        title="Portfolio"
        sub={`Marked to real delayed quotes (~15 min)${
          pf.quotesAsOf
            ? ` · as of ${pf.quotesAsOf.toLocaleTimeString("en-CA", { timeZone: "America/Toronto", hour: "numeric", minute: "2-digit" })} ET`
            : ""
        } · ACB includes commissions.`}
      />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Invested" value={money(pf.positionsCents)} />
        <StatCard label="Cash" value={money(pf.cashCents)} />
        <StatCard label="Positions" value={String(pf.positions.length)} />
        <StatCard
          label="Cash weight"
          value={pf.navCents > 0 ? pct(pf.cashCents / pf.navCents) : "—"}
          note="Balanced floor: 15%"
        />
      </section>

      <section className="mt-6">
        {pf.positions.length === 0 ? (
          <EmptyState
            title="All cash"
            body="No open positions. Use the manual sim ticket below to exercise the engine, or wait for the agent in Phase 2."
          />
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-teal-200/40">
                  <th className="px-5 py-3">Symbol</th>
                  <th className="px-5 py-3 text-right">Qty</th>
                  <th className="px-5 py-3 text-right">Avg cost</th>
                  <th className="px-5 py-3 text-right">Last</th>
                  <th className="px-5 py-3 text-right">Market value</th>
                  <th className="px-5 py-3 text-right">Unrealized P&L</th>
                  <th className="px-5 py-3 text-right">Weight</th>
                </tr>
              </thead>
              <tbody>
                {pf.positions.map((p) => (
                  <tr key={p.symbol} className="border-t border-teal-400/10">
                    <td className="px-5 py-3 font-semibold text-teal-50">{p.symbol}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-teal-100/80">{p.qty}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-teal-100/80">
                      {money(p.avgCostCents)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-teal-100/80">
                      {money(p.lastCents)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-teal-50">
                      {money(p.marketValueCents)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Pnl cents={p.unrealizedPnlCents} className="text-sm" />
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-teal-200/60">
                      {pf.navCents > 0 ? pct(p.marketValueCents / pf.navCents) : "—"}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-teal-400/15 bg-teal-400/[0.03]">
                  <td className="px-5 py-3 font-semibold text-teal-200/70">Cash</td>
                  <td className="px-5 py-3" colSpan={3} />
                  <td className="px-5 py-3 text-right tabular-nums text-teal-50">
                    {money(pf.cashCents)}
                  </td>
                  <td className="px-5 py-3" />
                  <td className="px-5 py-3 text-right tabular-nums text-teal-200/60">
                    {pf.navCents > 0 ? pct(pf.cashCents / pf.navCents) : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </Card>
        )}
      </section>

      <section className="mt-6">
        <OrderTicket symbols={symbols} />
      </section>
    </main>
  );
}
