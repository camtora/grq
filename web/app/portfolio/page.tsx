import Link from "next/link";
import { getSession } from "@/lib/session";
import { greeting } from "@/lib/greetings";
import { getPortfolio } from "@/lib/portfolio";
import { prisma } from "@/lib/db";
import { money, signedMoney, pct, fmtWhen, pnlClass } from "@/lib/money";
import { Card, StatCard, Chip, Pnl, Money } from "@/components/ui";
import ActivityFeed from "@/components/ActivityFeed";
import SortableTable from "@/components/SortableTable";
import Term from "@/components/Term";
import CollapsibleMd from "@/components/CollapsibleMd";
import PersonalLane, { type PersonalRow } from "@/components/PersonalLane";
import ConnectSplash from "@/components/accounts/ConnectSplash";
import PanelHeader from "@/components/PanelHeader";
import { allUniverse } from "@/lib/universe";
import { toCadCents, usdCadRate } from "@/lib/fx";
import { accountsForMembers, snaptradeConfiguredFor } from "@/lib/external/store";
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
  const [session, pf, recentJournal, premorning, latestPlan, midday, checkin, latestEod, weekly, agenda] = await Promise.all([
    getSession(),
    getPortfolio(),
    prisma.journalEntry.findMany({ orderBy: { at: "desc" }, take: 4 }),
    // The 6:00 ET pre-morning read — owns the briefing slot from dawn until the 9:00
    // game plan (a newer brief) supersedes it (Cam 2026-06-25).
    prisma.journalEntry.findFirst({
      where: { kind: "RESEARCH", title: { startsWith: "Pre-morning read" } },
      orderBy: { at: "desc" },
    }),
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

  // ── "Yours" lane: the logged-in member's OWN external holdings, stamped with
  // GRQ's existing call + fund hold/track status. User-specific (Graham sees his,
  // Cam sees his), members-only, UI-only contrast — the agent never reads these.
  let personalRows: PersonalRow[] = [];
  let personalTotal = "";
  let personalCadCents = 0; // external holdings summed in CAD (USD valued at fx)
  const personalConfigured = session?.role === "member" && (await snaptradeConfiguredFor(session.email));
  if (session?.role === "member") {
    const [meView] = await accountsForMembers([session.email]);
    const holdings = (meView?.accounts ?? []).flatMap((a) =>
      a.holdings.map((h) => ({ ...h, account: a.name })),
    );
    if (holdings.length > 0) {
      const bareKey = (s: string) => s.toUpperCase().replace(/\.(TO|V|NE|CN|US)$/, "");
      // Join personal holdings to GRQ's view by BARE ticker — the universe can carry
      // both a bare and a `.TO` row for one name, so key on bare and prefer ACTIVE.
      const uni = (await allUniverse()).filter((u) => u.status !== "RETIRED");
      const statusByBare = new Map<string, "ACTIVE" | "CANDIDATE">();
      for (const u of [...uni].sort((a, b) => (a.status === "ACTIVE" ? 0 : 1) - (b.status === "ACTIVE" ? 0 : 1))) {
        const k = bareKey(u.symbol);
        if (!statusByBare.has(k)) statusByBare.set(k, u.status as "ACTIVE" | "CANDIDATE");
      }
      const stanceRows = await prisma.journalEntry.findMany({
        where: { stance: { not: null }, symbol: { not: null } },
        orderBy: { at: "desc" },
        select: { symbol: true, stance: true },
      });
      const stanceByBare = new Map<string, string>();
      for (const s of stanceRows) {
        if (!s.symbol) continue;
        const k = bareKey(s.symbol);
        if (!stanceByBare.has(k)) stanceByBare.set(k, s.stance as string);
      }
      const fundBare = new Set(pf.positions.map((p) => bareKey(p.symbol)));

      personalRows = holdings.map((h) => {
        const k = bareKey(h.symbol);
        return {
          symbol: h.symbol,
          dossierHref: h.dossierHref,
          description: h.description,
          account: h.account,
          qty: h.qty,
          marketValueCents: h.marketValueCents,
          currency: h.currency,
          stance: stanceByBare.get(k) ?? null,
          fundHolds: fundBare.has(k),
          tracked: statusByBare.get(k) ?? null,
        };
      });
      const byCur = new Map<string, number>();
      for (const h of holdings) byCur.set(h.currency, (byCur.get(h.currency) ?? 0) + h.marketValueCents);
      personalTotal = [...byCur.entries()].map(([c, cents]) => money(cents, c)).join(" · ");
      const fxUsdCad = await usdCadRate();
      personalCadCents = holdings.reduce((s, h) => s + toCadCents(h.marketValueCents, h.currency, fxUsdCad), 0);
    }
  }

  // One evolving "latest briefing" slot: the agent's most recent read replaces
  // the last — morning game plan → midday brief → EOD close → next morning. Show
  // only the single newest so a stale prior-day brief never lingers (Cam 2026-06-17).
  const dayHref = (at: Date) => `/reports/day/${etDateStr(at)}`;
  const briefs = [
    premorning && { kicker: "Pre-Morning Read · what changed overnight", title: premorning.title, body: premorning.body, at: premorning.at, sourcesJson: premorning.sourcesJson, href: dayHref(premorning.at), cta: "View full day" },
    latestPlan && { kicker: "Morning Brief · the pre-market read", title: latestPlan.title, body: latestPlan.body, at: latestPlan.at, sourcesJson: latestPlan.sourcesJson, href: dayHref(latestPlan.at), cta: "View full day" },
    midday && { kicker: "Midday Review · the afternoon read", title: midday.title, body: midday.body, at: midday.at, sourcesJson: midday.sourcesJson, href: dayHref(midday.at), cta: "View full day" },
    checkin && { kicker: "Intraday Check-in · the latest read", title: checkin.title, body: checkin.body, at: checkin.at, sourcesJson: checkin.sourcesJson, href: dayHref(checkin.at), cta: "View full day" },
    latestEod && { kicker: "Evening Brief · the day's close", title: latestEod.title, body: latestEod.body, at: latestEod.createdAt, sourcesJson: null as string | null, href: dayHref(latestEod.createdAt), cta: "View full day" },
    weekly && { kicker: "Weekly Review · the week in receipts", title: weekly.title, body: weekly.body, at: weekly.createdAt, sourcesJson: null as string | null, href: `/reports/${weekly.id}`, cta: "View full review" },
  ].filter((b): b is NonNullable<typeof b> => Boolean(b));
  const latestBrief = briefs.sort((a, b) => b.at.getTime() - a.at.getTime())[0] ?? null;
  const pnlPct = pf.contributionsCents > 0 ? pf.totalPnlCents / pf.contributionsCents : 0;
  const feeFrac = pf.feeBudgetCentsMonth > 0 ? pf.feeSpentMonthCents / pf.feeBudgetCentsMonth : 0;

  // Currency split (D62 — the fund now holds CAD + USD). The Cash card shows the raw
  // CAD and USD balances side by side; usdCashCadCents is the USD cash valued in CAD
  // (cashCents folds it into the CAD total) — used for the USD cash row's NAV weight.
  const usd = (c: number) => `US$${(c / 100).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const usdCashCadCents = pf.cashCents - pf.cadCashCents;

  // "Outside GRQ" stat tile — the member's external (read-only) holdings, summed in
  // CAD. Only shown when they actually hold something outside the fund.
  const showExternal = session?.role === "member" && personalCadCents > 0;

  // The main cards, factored out so the layout can be arranged two ways without
  // duplicating markup: with an agenda, Positions + Activity sit side-by-side in one
  // grid row (Activity matches the Positions height) and brief/journal + Agenda drop to
  // the row below; without one, the classic single-column-of-cards + full-height rail.
  const positionsPanel = (
    <div className="space-y-2">
      <PanelHeader
        right={
          <span className="text-teal-200/40">
            {pf.quotesAsOf
              ? `quotes delayed ~15 min · as of ${pf.quotesAsOf.toLocaleTimeString("en-CA", { timeZone: "America/Toronto", hour: "numeric", minute: "2-digit" })} ET`
              : "ACB includes commissions"}
          </span>
        }
      >
        Positions
      </PanelHeader>
      <Card className="overflow-x-auto">
        {pf.positions.length === 0 ? (
          <p className="px-5 py-6 text-sm text-teal-200/40">
            All cash — the agent researches at 9:00 ET and only buys when a thesis clears
            every guardrail. Patience is a position.
          </p>
        ) : (
          <SortableTable
            className="w-full text-sm"
          headRowClassName="text-left text-xs uppercase tracking-wider text-teal-200/40"
          initialSort={{ key: "symbol", dir: "asc" }}
          groups={[
            { key: "CAD", label: "Canada · CAD" },
            { key: "USD", label: "United States · USD" },
          ]}
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
            group: p.currency === "USD" ? "USD" : "CAD",
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
                  {money(p.marketValueCents, p.currency)}
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
    </div>
  );

  const briefPanel = latestBrief && (
    <div className="space-y-2">
      <PanelHeader right={<span className="text-teal-200/40">{fmtWhen(latestBrief.at)}</span>}>
        {latestBrief.kicker}
      </PanelHeader>
      <Card className="p-5">
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
    </div>
  );

  const journalPanel = (
    <div className="space-y-2">
      <PanelHeader
        right={
          <Link href="/journal" className="text-teal-300 hover:underline">
            journal →
          </Link>
        }
      >
        Latest journal
      </PanelHeader>
      <Card className="p-5">
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
  );

  const agendaPanel = (
    <div className="space-y-2">
      <PanelHeader
        right={
          <span className="text-teal-200/40">
            {agenda.length} open · what the agent&apos;s watching for
          </span>
        }
      >
        Agenda
      </PanelHeader>
      <Card className="overflow-hidden">
      <ul className="divide-y divide-teal-400/10">
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
    </div>
  );

  // "Your accounts" — external (read-only) holdings. Sits under Positions in the
  // left column (Activity fills the rail beside both): the linked lane when
  // connected, otherwise the guided steps to connect — the panel never disappears.
  const personalSection = session?.role === "member" && (
    <div className="space-y-2">
      <PanelHeader>
        Your accounts{" "}
        <span className="font-normal normal-case text-teal-200/40">
          · outside the fund · read-only · GRQ can&apos;t trade these
        </span>
      </PanelHeader>
      {personalRows.length > 0 ? (
        <PersonalLane rows={personalRows} total={personalTotal} />
      ) : personalConfigured ? (
        <Card className="p-5 text-sm text-teal-200/50">
          Linked — waiting on your first holdings sync. They&apos;ll appear here automatically.
        </Card>
      ) : (
        <ConnectSplash />
      )}
    </div>
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
        </div>
      </div>

      <section className={`grid grid-cols-2 gap-4 ${showExternal ? "lg:grid-cols-6" : "lg:grid-cols-5"}`}>
        <StatCard
          label="Net asset value (CAD)"
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
          label="Contributions (CAD)"
          term="contributions"
          value={money(pf.contributionsCents)}
          note="initial commitment"
        />
        <Card className="p-5">
          <div className="text-xs uppercase tracking-wider text-teal-200/50">
            <Term k="fee-budget">Fee budget</Term>
          </div>
          <div className="mt-2 space-y-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs uppercase tracking-wider text-teal-200/40">Spent</span>
              <span className="text-xl font-semibold tabular-nums text-teal-50">{money(pf.feeSpentMonthCents)}</span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs uppercase tracking-wider text-teal-200/40">Budget</span>
              <span className="text-xl font-semibold tabular-nums text-teal-50">{money(pf.feeBudgetCentsMonth)}</span>
            </div>
          </div>
          <span className="mt-2 block h-1.5 w-full overflow-hidden rounded-full bg-teal-400/10">
            <span
              className={`block h-full rounded-full ${feeFrac > 0.8 ? "bg-red-400" : "bg-teal-400/70"}`}
              style={{ width: `${Math.min(100, feeFrac * 100)}%` }}
            />
          </span>
        </Card>
        <Card className="p-5">
          <div className="text-xs uppercase tracking-wider text-teal-200/50">Cash</div>
          <div className="mt-2 space-y-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs uppercase tracking-wider text-teal-200/40">CAD</span>
              <span className="text-xl font-semibold tabular-nums text-teal-50">{money(pf.cadCashCents)}</span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs uppercase tracking-wider text-teal-200/40">USD</span>
              <span className="text-xl font-semibold tabular-nums text-teal-50">{usd(pf.usdCashCents)}</span>
            </div>
          </div>
        </Card>
        {showExternal && (
          <StatCard
            label="Outside GRQ (CAD)"
            value={money(personalCadCents)}
            note="your external accounts · read-only"
          />
        )}
      </section>

      {/* Positions + Your accounts stack in the left column; Activity fills the
          rail across the height of BOTH (on lg it's absolutely-filled so the row
          track is set by the left column, then scrolls internally; on mobile it's
          a normal block under them). */}
      <section className="mt-6 grid items-start gap-4 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {positionsPanel}
          {personalSection}
        </div>

        <div className="lg:relative lg:col-span-1 lg:self-stretch">
          <div className="flex flex-col space-y-2 lg:absolute lg:inset-0">
            <PanelHeader
              right={
                <Link href="/journal" className="text-teal-300 hover:underline">
                  ledger →
                </Link>
              }
            >
              Activity
            </PanelHeader>
            <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="min-h-0 flex-1 overflow-y-auto">
                <ActivityFeed limit={20} compact />
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* The agent's latest briefing + journal, with the Agenda alongside when open. */}
      <section className="mt-6 grid items-start gap-4 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {briefPanel}
          {journalPanel}
        </div>
        {hasAgenda ? <aside className="lg:col-span-1">{agendaPanel}</aside> : null}
      </section>
    </main>
  );
}
