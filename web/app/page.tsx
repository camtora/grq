import Link from "next/link";
import { getSession } from "@/lib/session";
import { greeting } from "@/lib/greetings";
import { getPortfolio, getNavHistory } from "@/lib/portfolio";
import { prisma } from "@/lib/db";
import { money, signedMoney, pct, fmtWhen, pnlClass } from "@/lib/money";
import { Card, StatCard, Chip, Pnl, Money } from "@/components/ui";
import Sparkline from "@/components/Sparkline";
import KillSwitch from "@/components/KillSwitch";
import ActivityFeed from "@/components/ActivityFeed";

export default async function Overview() {
  const [session, pf, history, recentJournal, latestPlan] = await Promise.all([
    getSession(),
    getPortfolio(),
    getNavHistory(60),
    prisma.journalEntry.findMany({ orderBy: { at: "desc" }, take: 4 }),
    prisma.journalEntry.findFirst({
      where: { kind: "RESEARCH", title: { startsWith: "Game plan" } },
      orderBy: { at: "desc" },
    }),
  ]);
  const name = session?.user?.name ?? "friend";
  const pnlPct = pf.contributionsCents > 0 ? pf.totalPnlCents / pf.contributionsCents : 0;
  const feeFrac = pf.feeBudgetCentsMonth > 0 ? pf.feeSpentMonthCents / pf.feeBudgetCentsMonth : 0;

  return (
    <main>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-teal-50">
            {greeting(name, pf.totalPnlCents, pf.contributionsCents)}
          </h1>
          <p className="mt-1 text-sm text-teal-200/50">
            Live-fire sim on real delayed quotes
            {latestPlan && (
              <>
                {" · "}
                <Link href="/today" className="text-teal-300 hover:underline">
                  {latestPlan.title} →
                </Link>
              </>
            )}
          </p>
        </div>
        <Chip tone={pf.killSwitch ? "red" : "teal"}>
          {pf.killSwitch ? "Trading halted" : "Agent on duty"}
        </Chip>
      </div>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Net asset value"
          value={money(pf.navCents)}
          note={
            <>
              cash <Money cents={pf.cashCents} /> · invested <Money cents={pf.positionsCents} />
            </>
          }
        />
        <StatCard
          label="Total P&L"
          value={signedMoney(pf.totalPnlCents)}
          valueClassName={pnlClass(pf.totalPnlCents)}
          note={
            pf.benchmarkCents !== null
              ? `${pct(pnlPct, 2)} · vs XIC ${signedMoney(pf.navCents - pf.benchmarkCents)}`
              : `${pct(pnlPct, 2)} on contributions`
          }
        />
        <StatCard
          label="Contributions"
          value={money(pf.contributionsCents)}
          note="initial commitment"
        />
        <StatCard
          label="Fee budget"
          value={`${money(pf.feeSpentMonthCents)} / ${money(pf.feeBudgetCentsMonth)}`}
          note={
            <span className="block">
              <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-teal-400/10">
                <span
                  className={`block h-full rounded-full ${feeFrac > 0.8 ? "bg-red-400" : "bg-teal-400/70"}`}
                  style={{ width: `${Math.min(100, feeFrac * 100)}%` }}
                />
              </span>
            </span>
          }
        />
      </section>

      <section className="mt-6 grid items-start gap-4 lg:grid-cols-3">
        {/* Main column: NAV, positions, latest journal */}
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-xs uppercase tracking-wider text-teal-200/50">NAV history</span>
              <span className="text-xs text-teal-200/40">{history.length} snapshots</span>
            </div>
            <Sparkline values={history.map((h) => h.navCents)} />
          </Card>

          <Card className="overflow-x-auto">
            <div className="flex items-baseline justify-between px-5 pt-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-teal-200/50">
                Positions
              </span>
              <span className="text-xs text-teal-200/40">
                {pf.quotesAsOf
                  ? `quotes delayed ~15 min · as of ${pf.quotesAsOf.toLocaleTimeString("en-CA", { timeZone: "America/Toronto", hour: "numeric", minute: "2-digit" })} ET`
                  : "ACB includes commissions"}
              </span>
            </div>
            {pf.positions.length === 0 ? (
              <p className="px-5 py-6 text-sm text-teal-200/40">
                All cash — the agent researches at 9:00 ET and only buys when a thesis clears
                every guardrail. Patience is a position.
              </p>
            ) : (
              <table className="mt-2 w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-teal-200/40">
                    <th className="px-5 py-2">Symbol</th>
                    <th className="px-5 py-2 text-right">Qty</th>
                    <th className="px-5 py-2 text-right">Avg cost</th>
                    <th className="px-5 py-2 text-right">Last</th>
                    <th className="px-5 py-2 text-right">Market value</th>
                    <th className="px-5 py-2 text-right">Unrealized P&L</th>
                    <th className="px-5 py-2 text-right">Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {pf.positions.map((p) => (
                    <tr key={p.symbol} className="border-t border-teal-400/10">
                      <td className="px-5 py-2.5">
                        <Link href={`/stocks/${p.symbol}`} className="font-semibold text-teal-300 hover:underline">
                          {p.symbol}
                        </Link>
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-teal-100/80">{p.qty}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-teal-100/80">{money(p.avgCostCents)}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-teal-100/80">{money(p.lastCents)}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-teal-50">{money(p.marketValueCents)}</td>
                      <td className="px-5 py-2.5 text-right">
                        <Pnl cents={p.unrealizedPnlCents} className="text-sm" />
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-teal-200/60">
                        {pf.navCents > 0 ? pct(p.marketValueCents / pf.navCents) : "—"}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-teal-400/15 bg-teal-400/[0.03]">
                    <td className="px-5 py-2.5 font-semibold text-teal-200/70">Cash</td>
                    <td className="px-5 py-2.5" colSpan={3} />
                    <td className="px-5 py-2.5 text-right tabular-nums text-teal-50">{money(pf.cashCents)}</td>
                    <td className="px-5 py-2.5" />
                    <td className="px-5 py-2.5 text-right tabular-nums text-teal-200/60">
                      {pf.navCents > 0 ? pct(pf.cashCents / pf.navCents) : "—"}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-xs uppercase tracking-wider text-teal-200/50">Latest journal</span>
              <Link href="/journal" className="text-xs text-teal-300 hover:underline">
                journal →
              </Link>
            </div>
            {recentJournal.length === 0 ? (
              <p className="text-sm text-teal-200/40">Quiet so far.</p>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {recentJournal.map((j) => (
                  <li key={j.id} className="flex items-center gap-2">
                    <Chip tone="dim">{j.kind}</Chip>
                    <span className="truncate text-sm font-medium text-teal-50">{j.title}</span>
                    <span className="ml-auto shrink-0 text-xs text-teal-200/40">{fmtWhen(j.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Right rail: activity feed */}
        <aside className="lg:col-span-1">
          <Card className="overflow-hidden">
            <div className="flex items-baseline justify-between px-5 pt-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-teal-200/50">
                Activity
              </span>
              <Link href="/activity" className="text-xs text-teal-300 hover:underline">
                all orders →
              </Link>
            </div>
            <div className="mt-2">
              <ActivityFeed limit={15} compact />
            </div>
          </Card>
        </aside>
      </section>

      <section className="mt-6">
        <KillSwitch engaged={pf.killSwitch} engagedBy={pf.killSwitchBy} />
      </section>
    </main>
  );
}
