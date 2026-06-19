import Link from "next/link";
import { getSession } from "@/lib/session";
import { greeting } from "@/lib/greetings";
import { getPortfolio } from "@/lib/portfolio";
import { prisma } from "@/lib/db";
import { money, signedMoney, pct, fmtWhen, pnlClass } from "@/lib/money";
import { Card, StatCard, Chip, Pnl, Money } from "@/components/ui";
import ActivityFeed from "@/components/ActivityFeed";
import Term from "@/components/Term";
import CollapsibleMd from "@/components/CollapsibleMd";
import { etDateStr } from "@/agent/calendar";

// The agent cites sources in its briefs — show them as chips (moved here with the
// midday review from the Today page, Cam 2026-06-16).
function Sources({ sourcesJson }: { sourcesJson: string | null }) {
  if (!sourcesJson) return null;
  let sources: string[] = [];
  try {
    sources = JSON.parse(sourcesJson);
  } catch {
    return null;
  }
  if (sources.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {sources.map((s, i) => (
        <span key={i} className="rounded-full border border-teal-400/15 bg-teal-400/5 px-2 py-0.5 text-[10px] text-teal-200/60">
          {s}
        </span>
      ))}
    </div>
  );
}

export default async function Portfolio() {
  const [session, pf, recentJournal, latestPlan, midday, checkin, latestEod] = await Promise.all([
    getSession(),
    getPortfolio(),
    prisma.journalEntry.findMany({ orderBy: { at: "desc" }, take: 4 }),
    prisma.journalEntry.findFirst({
      where: { kind: "RESEARCH", title: { startsWith: "Game plan" } },
      orderBy: { at: "desc" },
    }),
    prisma.journalEntry.findFirst({
      where: { kind: "RESEARCH", title: { startsWith: "Midday brief" } },
      orderBy: { at: "desc" },
    }),
    // Intraday trading check-ins (10:00/12:30/15:00 + self-scheduled) write a
    // "Check-in — …" RESEARCH note; match loosely so any check-in phrasing counts.
    prisma.journalEntry.findFirst({
      where: { kind: "RESEARCH", title: { contains: "check-in", mode: "insensitive" } },
      orderBy: { at: "desc" },
    }),
    prisma.report.findFirst({ where: { kind: "EOD" }, orderBy: { createdAt: "desc" } }),
  ]);
  const name = session?.user?.name ?? "friend";

  // One evolving "latest briefing" slot: the agent's most recent read replaces
  // the last — morning game plan → midday brief → EOD close → next morning. Show
  // only the single newest so a stale prior-day brief never lingers (Cam 2026-06-17).
  const briefs = [
    latestPlan && { kicker: "Morning Brief · the pre-market read", title: latestPlan.title, body: latestPlan.body, at: latestPlan.at, sourcesJson: latestPlan.sourcesJson },
    midday && { kicker: "Midday Review · the afternoon read", title: midday.title, body: midday.body, at: midday.at, sourcesJson: midday.sourcesJson },
    checkin && { kicker: "Intraday Check-in · the latest read", title: checkin.title, body: checkin.body, at: checkin.at, sourcesJson: checkin.sourcesJson },
    latestEod && { kicker: "Evening Brief · the day's close", title: latestEod.title, body: latestEod.body, at: latestEod.createdAt, sourcesJson: null as string | null },
  ].filter((b): b is NonNullable<typeof b> => Boolean(b));
  const latestBrief = briefs.sort((a, b) => b.at.getTime() - a.at.getTime())[0] ?? null;
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
          </p>
        </div>
        <Chip tone={pf.killSwitch ? "red" : "teal"}>
          {pf.killSwitch ? "Trading halted" : "Agent on duty"}
        </Chip>
      </div>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Net asset value"
          term="nav"
          value={money(pf.navCents)}
          note={
            <>
              cash <Money cents={pf.cashCents} /> · invested <Money cents={pf.positionsCents} />
            </>
          }
        />
        <StatCard
          label="Total P&L"
          term="total-pnl"
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
          term="contributions"
          value={money(pf.contributionsCents)}
          note="initial commitment"
        />
        <StatCard
          label="Fee budget"
          term="fee-budget"
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
        {/* Main column: positions, latest briefing, latest journal */}
        <div className="space-y-6 lg:col-span-2">
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
                    <th className="px-5 py-2 text-right"><Term k="acb" align="right">Avg cost</Term></th>
                    <th className="px-5 py-2 text-right">Last</th>
                    <th className="px-5 py-2 text-right"><Term k="market-value" align="right">Market value</Term></th>
                    <th className="px-5 py-2 text-right"><Term k="unrealized-pnl" align="right">Unrealized P&L</Term></th>
                    <th className="px-5 py-2 text-right"><Term k="weight" align="right">Weight</Term></th>
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
                      <td className="px-5 py-2.5 text-right tabular-nums text-teal-50">
                        {money(p.marketValueCents)}
                        {p.currency !== "CAD" ? <span className="ml-1 text-[10px] text-teal-200/40">{p.currency}</span> : null}
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        <Pnl cents={p.unrealizedPnlCents} className="text-sm" />
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-teal-200/60">
                        {pf.navCents > 0 ? pct(p.marketValueCadCents / pf.navCents) : "—"}
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

          {latestBrief && (
            <Card className="p-5">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-teal-300/70">
                  {latestBrief.kicker}
                </span>
                <span className="shrink-0 text-xs text-teal-200/40">{fmtWhen(latestBrief.at)}</span>
              </div>
              <div className="mb-2 text-base font-semibold text-teal-50">{latestBrief.title}</div>
              <CollapsibleMd text={latestBrief.body} threshold={600} defaultOpen>
                <Sources sourcesJson={latestBrief.sourcesJson} />
              </CollapsibleMd>
              <div className="mt-3 border-t border-teal-400/10 pt-2 text-right">
                <Link href={`/reports/day/${etDateStr(latestBrief.at)}`} className="text-xs font-semibold text-teal-300 hover:underline">
                  View full day →
                </Link>
              </div>
            </Card>
          )}

          <Card className="p-5">
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-xs uppercase tracking-wider text-teal-200/50">Latest journal</span>
              <Link href="/settings#journal" className="text-xs text-teal-300 hover:underline">
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
              <Link href="/settings#journal" className="text-xs text-teal-300 hover:underline">
                ledger →
              </Link>
            </div>
            <div className="mt-2">
              <ActivityFeed limit={15} compact />
            </div>
          </Card>
        </aside>
      </section>
    </main>
  );
}
