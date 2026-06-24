import Link from "next/link";
import { getSession } from "@/lib/session";
import { greeting } from "@/lib/greetings";
import { getPortfolio } from "@/lib/portfolio";
import { prisma } from "@/lib/db";
import { money, signedMoney, pct, fmtWhen, pnlClass } from "@/lib/money";
import { Card, StatCard, Chip, Pnl, Money } from "@/components/ui";
import { soakStatus } from "@/lib/soak";
import ActivityFeed from "@/components/ActivityFeed";
import SortableTable from "@/components/SortableTable";
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
  const [session, pf, recentJournal, latestPlan, midday, checkin, latestEod, weekly, agenda] = await Promise.all([
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
    // Intraday trading check-ins (scheduled 10/11/13/14/15 ET + self-scheduled wakeups)
    // write a "Check-in — …" RESEARCH note. These are FUND-LEVEL reads, so they leave
    // `symbol` null. A held-position trigger escalation (evaluateTriggers → runMiddayCheckIn)
    // also writes a "Check-in — …" note but TAGS it with the holding (`symbol`) — e.g. an
    // ATD pop firing every 30 min. We deliberately EXCLUDE those here (symbol must be null)
    // so the briefing slot stays the fund-level narrative instead of one noisy holding; the
    // per-name notes still live on that stock's page and still push (Cam 2026-06-24).
    prisma.journalEntry.findFirst({
      where: { kind: "RESEARCH", title: { contains: "check-in", mode: "insensitive" }, symbol: null },
      orderBy: { at: "desc" },
    }),
    prisma.report.findFirst({ where: { kind: "EOD" }, orderBy: { createdAt: "desc" } }),
    // The Saturday 09:00 weekly review takes the briefing slot all weekend until
    // Monday's game plan (a newer brief) supersedes it (Cam 2026-06-21).
    prisma.report.findFirst({ where: { kind: "WEEKLY" }, orderBy: { createdAt: "desc" } }),
    // The agent's standing to-do list — follow-ups it parked for the next check-in.
    // Shown in the right rail when non-empty (Cam 2026-06-24).
    prisma.agentAgendaItem.findMany({ where: { status: "OPEN" }, orderBy: { createdAt: "desc" } }),
  ]);
  const hasAgenda = agenda.length > 0;
  const name = session?.user?.name ?? "friend";

  // One evolving "latest briefing" slot: the agent's most recent read replaces
  // the last — morning game plan → midday brief → EOD close → next morning. Show
  // only the single newest so a stale prior-day brief never lingers (Cam 2026-06-17).
  const dayHref = (at: Date) => `/reports/day/${etDateStr(at)}`;
  const briefs = [
    latestPlan && { kicker: "Morning Brief · the pre-market read", title: latestPlan.title, body: latestPlan.body, at: latestPlan.at, sourcesJson: latestPlan.sourcesJson, href: dayHref(latestPlan.at), cta: "View full day" },
    midday && { kicker: "Midday Review · the afternoon read", title: midday.title, body: midday.body, at: midday.at, sourcesJson: midday.sourcesJson, href: dayHref(midday.at), cta: "View full day" },
    checkin && { kicker: "Intraday Check-in · the latest read", title: checkin.title, body: checkin.body, at: checkin.at, sourcesJson: checkin.sourcesJson, href: dayHref(checkin.at), cta: "View full day" },
    latestEod && { kicker: "Evening Brief · the day's close", title: latestEod.title, body: latestEod.body, at: latestEod.createdAt, sourcesJson: null as string | null, href: dayHref(latestEod.createdAt), cta: "View full day" },
    weekly && { kicker: "Weekly Review · the week in receipts", title: weekly.title, body: weekly.body, at: weekly.createdAt, sourcesJson: null as string | null, href: `/reports/${weekly.id}`, cta: "View full review" },
  ].filter((b): b is NonNullable<typeof b> => Boolean(b));
  const latestBrief = briefs.sort((a, b) => b.at.getTime() - a.at.getTime())[0] ?? null;
  const pnlPct = pf.contributionsCents > 0 ? pf.totalPnlCents / pf.contributionsCents : 0;
  const feeFrac = pf.feeBudgetCentsMonth > 0 ? pf.feeSpentMonthCents / pf.feeBudgetCentsMonth : 0;

  // Currency split (D62 — the fund now holds CAD + USD). cashCents is the CAD total;
  // usdCashCents×fx is folded in, so the USD-in-CAD value = cashCents − cadCashCents.
  const cad = (c: number) => `CA$${(c / 100).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const usd = (c: number) => `US$${(c / 100).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const usdCashCadCents = pf.cashCents - pf.cadCashCents;
  const usdPositionsCadCents = pf.positions.filter((p) => p.currency === "USD").reduce((s, p) => s + p.marketValueCadCents, 0);
  const usdExposureCadCents = usdCashCadCents + usdPositionsCadCents;
  const usdPct = pf.navCents > 0 ? (usdExposureCadCents / pf.navCents) * 100 : 0;
  const holdsUsd = pf.usdCashCents > 0 || usdPositionsCadCents > 0;

  // Soak gate countdown (PROJECT_PLAN §9) — surfaced in the header so the road to
  // real money is visible. Paper is the binding constraint right now.
  const soak = soakStatus();
  const paperFrac = soak.paperRequired > 0 ? Math.min(1, soak.paperDays / soak.paperRequired) : 0;
  const totalFrac = soak.totalRequired > 0 ? Math.min(1, soak.totalDays / soak.totalRequired) : 0;

  // The main cards, factored out so the layout can be arranged two ways without
  // duplicating markup: with an agenda, Positions + Activity sit side-by-side in one
  // grid row (Activity matches the Positions height) and brief/journal + Agenda drop to
  // the row below; without one, the classic single-column-of-cards + full-height rail.
  const positionsCard = (
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
        <SortableTable
          className="mt-2 w-full text-sm"
          headRowClassName="text-left text-xs uppercase tracking-wider text-teal-200/40"
          initialSort={{ key: "symbol", dir: "asc" }}
          columns={[
            { key: "symbol", label: "Symbol", align: "left" },
            { key: "qty", label: "Qty", align: "right", numeric: true },
            { key: "avgCost", label: <Term k="acb" align="right">Avg cost</Term>, align: "right", numeric: true },
            { key: "last", label: "Last", align: "right", numeric: true },
            { key: "value", label: <Term k="market-value" align="right">Market value</Term>, align: "right", numeric: true },
            { key: "unrealized", label: <Term k="unrealized-pnl" align="right">Unrealized P&L</Term>, align: "right", numeric: true },
            { key: "weight", label: <Term k="weight" align="right">Weight</Term>, align: "right", numeric: true },
          ]}
          rows={pf.positions.map((p) => ({
            key: p.symbol,
            sort: {
              symbol: p.symbol,
              qty: p.qty,
              avgCost: p.avgCostCents,
              last: p.lastCents,
              // Market value + weight sort on the CAD-normalised value so a USD
              // holding sorts against a CAD one apples-to-apples.
              value: p.marketValueCadCents,
              unrealized: p.unrealizedPnlCents,
              weight: p.marketValueCadCents,
            },
            node: (
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
            ),
          }))}
          footer={
            <>
              <tr className="border-t border-teal-400/15 bg-teal-400/[0.03]">
                <td className="px-5 py-2.5 font-semibold text-teal-200/70">Cash · CAD</td>
                <td className="px-5 py-2.5" colSpan={3} />
                <td className="px-5 py-2.5 text-right tabular-nums text-teal-50">{money(pf.cadCashCents)}</td>
                <td className="px-5 py-2.5" />
                <td className="px-5 py-2.5 text-right tabular-nums text-teal-200/60">
                  {pf.navCents > 0 ? pct(pf.cadCashCents / pf.navCents) : "—"}
                </td>
              </tr>
              {pf.usdCashCents > 0 && (
                <tr className="bg-teal-400/[0.03]">
                  <td className="px-5 py-2.5 font-semibold text-teal-200/70">Cash · USD</td>
                  <td className="px-5 py-2.5" colSpan={3} />
                  <td className="px-5 py-2.5 text-right tabular-nums text-teal-50">
                    {usd(pf.usdCashCents)}
                    <span className="ml-1 text-[10px] text-teal-200/40">≈ {cad(usdCashCadCents)}</span>
                  </td>
                  <td className="px-5 py-2.5" />
                  <td className="px-5 py-2.5 text-right tabular-nums text-teal-200/60">
                    {pf.navCents > 0 ? pct(usdCashCadCents / pf.navCents) : "—"}
                  </td>
                </tr>
              )}
            </>
          }
        />
      )}
    </Card>
  );

  const briefCard = latestBrief && (
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
        <Link href={latestBrief.href} className="text-xs font-semibold text-teal-300 hover:underline">
          {latestBrief.cta} →
        </Link>
      </div>
    </Card>
  );

  const journalCard = (
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
  );

  const activityHeader = (
    <div className="flex shrink-0 items-baseline justify-between px-5 pt-4">
      <span className="text-xs font-semibold uppercase tracking-wider text-teal-200/50">Activity</span>
      <Link href="/settings#journal" className="text-xs text-teal-300 hover:underline">
        ledger →
      </Link>
    </div>
  );

  const agendaCard = (
    <Card className="overflow-hidden">
      <div className="flex items-baseline justify-between px-5 pt-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-teal-300/70">Agenda</span>
        <span className="shrink-0 text-xs text-teal-200/40">
          {agenda.length} open · what the agent's watching for
        </span>
      </div>
      <ul className="mt-2 divide-y divide-teal-400/10">
        {agenda.map((a) => (
          <li key={a.id} className="px-5 py-3">
            <div className="flex items-center gap-2">
              {a.symbol ? (
                <Link href={`/stocks/${a.symbol}`} className="text-sm font-bold text-teal-300 hover:underline">
                  {a.symbol}
                </Link>
              ) : (
                <span className="text-[10px] font-semibold uppercase tracking-wider text-teal-200/40">Fund-level</span>
              )}
              <span className="ml-auto shrink-0 text-[10px] text-teal-200/40">{fmtWhen(a.createdAt)}</span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-teal-100/70">{a.body}</p>
          </li>
        ))}
      </ul>
    </Card>
  );

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
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={pf.killSwitch ? "red" : "teal"}>
            {pf.killSwitch ? "Trading halted" : "Agent on duty"}
          </Chip>
          <div className="rounded-xl border border-teal-400/20 bg-teal-400/[0.04] px-3 py-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-teal-200/50">IBKR paper soak</div>
            <div className="text-sm font-semibold tabular-nums text-teal-50">
              {soak.paperDays} / {soak.paperRequired}
              <span className="ml-1 text-[10px] font-normal text-teal-200/40">days</span>
            </div>
            <div className="mt-1 h-1 w-20 overflow-hidden rounded-full bg-teal-400/10">
              <span className="block h-full rounded-full bg-teal-400/70" style={{ width: `${paperFrac * 100}%` }} />
            </div>
          </div>
          <div className="rounded-xl border border-teal-400/20 bg-teal-400/[0.04] px-3 py-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-teal-200/50">Total soak</div>
            <div className="text-sm font-semibold tabular-nums text-teal-50">
              {soak.totalDays} / {soak.totalRequired}
              <span className="ml-1 text-[10px] font-normal text-teal-200/40">days</span>
            </div>
            <div className="mt-1 h-1 w-20 overflow-hidden rounded-full bg-teal-400/10">
              <span className="block h-full rounded-full bg-teal-400/70" style={{ width: `${totalFrac * 100}%` }} />
            </div>
          </div>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard
          label="Net asset value"
          term="nav"
          value={money(pf.navCents)}
          note={
            <>
              invested <Money cents={pf.positionsCents} /> · {pf.positions.length} position{pf.positions.length === 1 ? "" : "s"}
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
        <Card className="p-5">
          <div className="text-xs uppercase tracking-wider text-teal-200/50">Cash</div>
          <div className="mt-2 space-y-0.5">
            <div className="text-xl font-semibold tabular-nums text-teal-50">{cad(pf.cadCashCents)}</div>
            <div className="text-xl font-semibold tabular-nums text-teal-50">{usd(pf.usdCashCents)}</div>
          </div>
          {holdsUsd ? (
            <div className="mt-1 text-xs text-teal-200/40">{usdPct.toFixed(1)}% of NAV in USD</div>
          ) : null}
        </Card>
      </section>

      {hasAgenda ? (
        // With an agenda: Positions and Activity share grid row 1 (so Activity stretches
        // to the Positions height and scrolls internally), and brief/journal + Agenda drop
        // to row 2 — putting the Agenda beside the agent's latest briefing.
        <section className="mt-6 grid items-start gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">{positionsCard}</div>

          {/* On lg: an absolutely-filled card so the grid row track is set by Positions
              alone; the Activity card fills that height and scrolls. On mobile it's a
              normal block (full feed). */}
          <div className="lg:relative lg:col-span-1 lg:self-stretch">
            <Card className="flex flex-col overflow-hidden lg:absolute lg:inset-0">
              {activityHeader}
              <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
                <ActivityFeed limit={12} compact />
              </div>
            </Card>
          </div>

          <div className="space-y-6 lg:col-span-2">
            {briefCard}
            {journalCard}
          </div>
          <aside className="lg:col-span-1">{agendaCard}</aside>
        </section>
      ) : (
        // No agenda: the classic layout — a single column of cards with the full-height
        // activity feed in the rail.
        <section className="mt-6 grid items-start gap-4 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {positionsCard}
            {briefCard}
            {journalCard}
          </div>
          <aside className="lg:col-span-1">
            <Card className="overflow-hidden">
              {activityHeader}
              <div className="mt-2">
                <ActivityFeed limit={15} compact />
              </div>
            </Card>
          </aside>
        </section>
      )}
    </main>
  );
}
