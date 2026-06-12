import Link from "next/link";
import { getSession } from "@/lib/session";
import { getPortfolio, getNavHistory } from "@/lib/portfolio";
import { prisma } from "@/lib/db";
import { money, signedMoney, pct, fmtWhen, pnlClass } from "@/lib/money";
import { Card, StatCard, Chip, Pnl, Money } from "@/components/ui";
import Sparkline from "@/components/Sparkline";
import KillSwitch from "@/components/KillSwitch";

export default async function Overview() {
  const [session, pf, history, recentJournal] = await Promise.all([
    getSession(),
    getPortfolio(),
    getNavHistory(60),
    prisma.journalEntry.findMany({ orderBy: { at: "desc" }, take: 3 }),
  ]);
  const name = session?.user?.name ?? "friend";
  const other = name === "Cam" ? "Graham" : "Cam";
  const pnlPct = pf.contributionsCents > 0 ? pf.totalPnlCents / pf.contributionsCents : 0;
  const feeFrac = pf.feeBudgetCentsMonth > 0 ? pf.feeSpentMonthCents / pf.feeBudgetCentsMonth : 0;
  const topPositions = [...pf.positions]
    .sort((a, b) => b.marketValueCents - a.marketValueCents)
    .slice(0, 5);

  return (
    <main>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-teal-50">Welcome back, {name}.</h1>
          <p className="mt-1 text-sm text-teal-200/50">
            {name} &amp; {other}&rsquo;s autonomous fund · live-fire sim on real delayed quotes
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

      <section className="mt-6">
        <Card className="p-5">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-xs uppercase tracking-wider text-teal-200/50">NAV history</span>
            <span className="text-xs text-teal-200/40">{history.length} snapshots</span>
          </div>
          <Sparkline values={history.map((h) => h.navCents)} />
        </Card>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-xs uppercase tracking-wider text-teal-200/50">Top positions</span>
            <Link href="/portfolio" className="text-xs text-teal-300 hover:underline">
              portfolio →
            </Link>
          </div>
          {topPositions.length === 0 ? (
            <p className="text-sm text-teal-200/40">All cash — no positions yet.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {topPositions.map((p) => (
                  <tr key={p.symbol} className="border-t border-teal-400/10 first:border-0">
                    <td className="py-2 font-semibold text-teal-50">{p.symbol}</td>
                    <td className="py-2 text-right tabular-nums text-teal-200/60">{p.qty} sh</td>
                    <td className="py-2 text-right tabular-nums text-teal-100/80">
                      {money(p.marketValueCents)}
                    </td>
                    <td className="py-2 text-right">
                      <Pnl cents={p.unrealizedPnlCents} className="text-sm" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-xs uppercase tracking-wider text-teal-200/50">
              Latest journal
            </span>
            <Link href="/journal" className="text-xs text-teal-300 hover:underline">
              journal →
            </Link>
          </div>
          {recentJournal.length === 0 ? (
            <p className="text-sm text-teal-200/40">Quiet so far.</p>
          ) : (
            <ul className="space-y-3">
              {recentJournal.map((j) => (
                <li key={j.id} className="border-t border-teal-400/10 pt-3 first:border-0 first:pt-0">
                  <div className="flex items-center gap-2">
                    <Chip tone="dim">{j.kind}</Chip>
                    <span className="truncate text-sm font-medium text-teal-50">{j.title}</span>
                  </div>
                  <div className="mt-1 text-xs text-teal-200/40">{fmtWhen(j.at)}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <section className="mt-6">
        <KillSwitch engaged={pf.killSwitch} engagedBy={pf.killSwitchBy} />
      </section>
    </main>
  );
}
