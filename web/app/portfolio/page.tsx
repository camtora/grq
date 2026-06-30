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
import PersonalLane, { type PersonalRow, type PersonalTotal, type PersonalOwner } from "@/components/PersonalLane";
import ConnectSplash from "@/components/accounts/ConnectSplash";
import ResearchQueueCard from "@/components/ResearchQueueCard";
import Avatar from "@/components/Avatar";
import PanelHeader from "@/components/PanelHeader";
import { LiveQuotesProvider } from "@/components/LiveQuotes";
import { LiveTotal, LivePnlValue, LivePosLast, LivePosValue, LivePosUnrealized, type LivePos } from "@/components/portfolio/LiveNumbers";
import { allUniverse } from "@/lib/universe";
import { toCadCents, usdCadRate } from "@/lib/fx";
import { accountsForMembers, snaptradeConfiguredFor } from "@/lib/external/store";
import { personByEmail } from "@/lib/people";
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

  // ── Personal accounts: each member's external holdings in a SEPARATE lane (Graham first,
  // then Cam — Cam 2026-06-29), stamped with GRQ's existing call + fund hold/track status.
  // External accounts are "both see both" (same as /accounts), members-only, UI-only contrast —
  // the agent never reads these. The viewer's own connection state drives the connect prompt.
  const personalGroups: { key: string; owner: PersonalOwner; rows: PersonalRow[]; totals: PersonalTotal[]; cadTotalCents: number; cadChangeCents: number; cadChangeFrac: number | null }[] = [];
  let myCadCents = 0; // the VIEWER's own external holdings, summed in CAD (the "Outside GRQ" tile)
  let myCadChangeCents = 0; // the VIEWER's own external open P&L in CAD (the "Outside GRQ change" tile)
  let myCadChangeFrac: number | null = null; // null = no cost basis reported → hide the change tile
  // Personal external accounts show for ANY authenticated user — their OWN holdings (Cam &
  // Graham see their TD, a viewer like Jose sees his IBKR). Read-only display either way.
  const personalConfigured = !!session?.email && (await snaptradeConfiguredFor(session.email));
  if (session?.email) {
    const fxUsdCad = await usdCadRate();
    // Show ONLY the logged-in user's own accounts (Cam 2026-06-29 — was both members).
    const views = await accountsForMembers([session.email]);
    // GRQ-view join maps, computed once (member-independent): universe status, latest stance,
    // and what the fund holds — all keyed on the BARE ticker.
    const bareKey = (s: string) => s.toUpperCase().replace(/\.(TO|V|NE|CN|US)$/, "");
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

    // Build one group per member. Graham's lane first, then Cam's (Cam 2026-06-29).
    const ORDER: Record<string, number> = { graham: 0, cam: 1 };
    for (const v of views) {
      const person = personByEmail(v.email);
      const holdings = (v.accounts ?? []).flatMap((a) => a.holdings.map((h) => ({ ...h, account: a.name })));
      if (holdings.length === 0) continue;

      const rows: PersonalRow[] = holdings
        .map((h) => {
          const k = bareKey(h.symbol);
          return {
            symbol: h.symbol,
            dossierHref: h.dossierHref,
            description: h.description,
            account: h.account,
            qty: h.qty,
            marketValueCents: h.marketValueCents,
            bookCostCents: h.openPnlCents == null ? null : h.marketValueCents - h.openPnlCents,
            openPnlCents: h.openPnlCents,
            currency: h.currency,
            stance: stanceByBare.get(k) ?? null,
            fundHolds: fundBare.has(k),
            tracked: statusByBare.get(k) ?? null,
          };
        })
        .sort((a, b) => toCadCents(b.marketValueCents, b.currency, fxUsdCad) - toCadCents(a.marketValueCents, a.currency, fxUsdCad));

      // Per-currency totals, keyed by ACCOUNT currency so everything reconciles even when an
      // account holds mixed-currency positions (e.g. a CAD TFSA holding a USD name): holdings
      // are converted INTO the account currency, the account TOTAL comes straight from the
      // brokerage, and cash = total − converted-holdings (TD-via-SnapTrade reports the explicit
      // cash field as 0, so we derive it — Cam 2026-06-29). holdings + cash = total.
      const toAcctCents = (cents: number, fromCcy: string, acctCcy: string) => {
        if (fromCcy === acctCcy) return cents;
        const cad = toCadCents(cents, fromCcy, fxUsdCad);
        return acctCcy === "CAD" ? cad : Math.round(cad / (fxUsdCad || 1)); // CAD → USD
      };
      const byCur = new Map<string, { holdingsCents: number; cashCents: number; totalCents: number; changeCents: number; haveCost: boolean }>();
      for (const a of v.accounts ?? []) {
        const cur = a.currency;
        const t = byCur.get(cur) ?? { holdingsCents: 0, cashCents: 0, totalCents: 0, changeCents: 0, haveCost: false };
        let held = 0;
        for (const h of a.holdings ?? []) {
          held += toAcctCents(h.marketValueCents, h.currency, cur);
          if (h.openPnlCents != null) {
            t.changeCents += toAcctCents(h.openPnlCents, h.currency, cur);
            t.haveCost = true;
          }
        }
        t.holdingsCents += held;
        t.totalCents += a.totalValueCents;
        t.cashCents += Math.max(0, a.totalValueCents - held);
        byCur.set(cur, t);
      }
      const totals: PersonalTotal[] = [...byCur.entries()]
        .map(([currency, t]) => {
          const cost = t.holdingsCents - t.changeCents;
          return {
            currency,
            holdingsCents: t.holdingsCents,
            cashCents: t.cashCents,
            totalCents: t.totalCents,
            changeCents: t.haveCost ? t.changeCents : null,
            changeFrac: t.haveCost && cost > 0 ? t.changeCents / cost : null,
          };
        })
        .sort((a, b) => a.currency.localeCompare(b.currency)); // CAD before USD

      // CAD header total = the brokerage's account totals (holdings + cash) valued in CAD.
      const cadTotalCents = (v.accounts ?? []).reduce((s, a) => s + toCadCents(a.totalValueCents, a.currency, fxUsdCad), 0);
      // External open P&L (unrealized vs cost), summed in CAD — drives the "Outside GRQ change" tile.
      let cadChangeCents = 0;
      let cadCostCents = 0;
      let haveCost = false;
      for (const a of v.accounts ?? [])
        for (const h of a.holdings ?? []) {
          if (h.openPnlCents != null) {
            cadChangeCents += toCadCents(h.openPnlCents, h.currency, fxUsdCad);
            cadCostCents += toCadCents(h.marketValueCents - h.openPnlCents, h.currency, fxUsdCad);
            haveCost = true;
          }
        }
      const cadChangeFrac = haveCost && cadCostCents > 0 ? cadChangeCents / cadCostCents : null;
      const key = person?.key ?? v.email;
      personalGroups.push({ key, owner: { name: person?.name ?? v.email, photo: person?.photo ?? null }, rows, totals, cadTotalCents, cadChangeCents: haveCost ? cadChangeCents : 0, cadChangeFrac });
    }
    personalGroups.sort((a, b) => (ORDER[a.key] ?? 9) - (ORDER[b.key] ?? 9));
    // The "Outside GRQ" stat tiles show the VIEWER's own external total + change, not the combined.
    const myKey = personByEmail(session.email)?.key ?? session.email;
    const myGroup = personalGroups.find((g) => g.key === myKey);
    myCadCents = myGroup?.cadTotalCents ?? 0;
    myCadChangeCents = myGroup?.cadChangeCents ?? 0;
    myCadChangeFrac = myGroup?.cadChangeFrac ?? null;
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

  // Currency split (D62 — the fund now holds CAD + USD). The Cash card shows the raw
  // CAD and USD balances side by side; usdCashCadCents is the USD cash valued in CAD
  // (cashCents folds it into the CAD total) — used for the USD cash row's NAV weight.
  const usd = (c: number) => `US$${(c / 100).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const usdCashCadCents = pf.cashCents - pf.cadCashCents;

  // "Outside GRQ" stat tiles — the member's external (read-only) holdings, summed in
  // CAD. The value tile shows whenever they hold something outside the fund; the change
  // tile additionally needs a reported cost basis (myCadChangeFrac != null).
  const showExternal = session?.role === "member" && myCadCents > 0;
  const showExternalChange = showExternal && myCadChangeFrac !== null;
  // Top stat-row column count: 5 base tiles + the external value tile + the external change tile.
  const topCols = 5 + (showExternal ? 1 : 0) + (showExternalChange ? 1 : 0);
  const topColsClass = topCols >= 7 ? "lg:grid-cols-7" : topCols === 6 ? "lg:grid-cols-6" : "lg:grid-cols-5";

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
        <span className="inline-flex items-center gap-2">
          {/* Alfred's face — the GRQ bull, matching how the chat represents the agent —
              so the fund's panel has an avatar like the members' lanes (Cam 2026-06-29). */}
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-400/15 ring-1 ring-teal-400/25">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/bull-splash.png" alt="Alfred" className="h-5 w-5 object-contain" />
          </span>
          Alfred&apos;s positions
        </span>
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
                <td className="px-5 py-2.5 text-right tabular-nums text-teal-100/80">
                  <LivePosLast symbol={p.symbol} lastCents={p.lastCents} currency={p.currency} />
                </td>
                <td className="px-5 py-2.5 text-right tabular-nums text-teal-50">
                  <LivePosValue symbol={p.symbol} qty={p.qty} lastCents={p.lastCents} currency={p.currency} />
                </td>
                <td className="px-5 py-2.5 text-right text-sm">
                  <LivePosUnrealized symbol={p.symbol} qty={p.qty} avgCostCents={p.avgCostCents} lastCents={p.lastCents} currency={p.currency} />
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

  // Personal accounts — external (read-only) holdings, ONE panel per member, each titled
  // with the member's name OUTSIDE the panel and their total value (CAD) top-right (Cam
  // 2026-06-29). No umbrella header. The connect prompt shows for the viewer when nobody's
  // linked yet.
  const personalSection = session?.email && (
    personalGroups.length > 0 ? (
      <div className="space-y-6">
        {personalGroups.map((g) => (
          <div key={g.key} className="space-y-2">
            <PanelHeader
              right={
                <span className="tabular-nums text-teal-200/50">
                  {money(g.cadTotalCents)} <span className="text-teal-200/35">total</span>
                </span>
              }
            >
              <span className="inline-flex items-center gap-2">
                <Avatar src={g.owner.photo} name={g.owner.name} size="h-6 w-6" />
                {g.owner.name}&apos;s positions
                <span className="font-normal normal-case text-teal-200/40">· outside the fund · read-only · Alfred can&apos;t trade these</span>
              </span>
            </PanelHeader>
            <PersonalLane rows={g.rows} totals={g.totals} />
          </div>
        ))}
      </div>
    ) : session.role === "member" ? (
      // Onboarding (connect prompt) is members-only — a viewer with no linked accounts
      // simply sees nothing here, not a "connect your accounts" splash.
      personalConfigured ? (
        <Card className="p-5 text-sm text-teal-200/50">
          Linked — waiting on your first holdings sync. They&apos;ll appear here automatically.
        </Card>
      ) : (
        <ConnectSplash />
      )
    ) : null
  );

  // Live, rolling numbers (Cam 2026-06-29): the held symbols feed one LiveQuotesProvider; the
  // NAV/holdings/P&L tiles + position cells recompute off the live quote map and roll on a move.
  const fxLive = pf.fxUsdCad ?? 1;
  const livePositions: LivePos[] = pf.positions.map((p) => ({
    symbol: p.symbol,
    qty: p.qty,
    currency: p.currency,
    lastCents: p.lastCents,
    avgCostCents: p.avgCostCents,
  }));
  const posSymbols = pf.positions.map((p) => p.symbol);

  return (
    <main>
      <LiveQuotesProvider symbols={posSymbols}>
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

      <section className={`grid grid-cols-2 gap-3 ${topColsClass}`}>
        {/* Portfolio value — total NAV, shown in BOTH CAD and USD, live + rolling (Cam 2026-06-29). */}
        <StatCard
          label="Portfolio value (CAD)"
          term="nav"
          value={<LiveTotal positions={livePositions} cashCents={pf.cashCents} fx={fxLive} base="nav" currency="CAD" />}
          note={
            <>
              = <LiveTotal positions={livePositions} cashCents={pf.cashCents} fx={fxLive} base="nav" currency="USD" /> ·{" "}
              {pf.positions.length} position{pf.positions.length === 1 ? "" : "s"}
            </>
          }
        />
        {/* Total holdings — positions only, CAD + USD, live. */}
        <StatCard
          label="Total holdings (CAD)"
          term="market-value"
          value={<LiveTotal positions={livePositions} cashCents={pf.cashCents} fx={fxLive} base="holdings" currency="CAD" />}
          note={<>= <LiveTotal positions={livePositions} cashCents={pf.cashCents} fx={fxLive} base="holdings" currency="USD" /></>}
        />
        {/* Total cash — the CAD-valued total, split by currency. */}
        <StatCard
          label="Total cash (CAD)"
          value={money(pf.cashCents)}
          note={
            <>
              {money(pf.cadCashCents)} CAD · {usd(pf.usdCashCents)}
            </>
          }
        />
        {/* Total P&L — live value; the %/vs-XIC note is the server snapshot. */}
        <StatCard
          label="Total P&L"
          term="total-pnl"
          value={<LivePnlValue positions={livePositions} cashCents={pf.cashCents} contributionsCents={pf.contributionsCents} fx={fxLive} />}
          note={
            pf.benchmarkCents !== null
              ? `${pct(pnlPct, 2)} · vs XIC ${signedMoney(pf.navCents - pf.benchmarkCents)}`
              : `${pct(pnlPct, 2)} on contributions`
          }
        />
        <StatCard label="Contributions (CAD)" term="contributions" value={money(pf.contributionsCents)} note="initial commitment" />
        {showExternal && (
          <StatCard label="Outside GRQ (CAD)" value={money(myCadCents)} note="your external accounts · read-only" />
        )}
        {showExternalChange && (
          <StatCard
            label="Outside GRQ change (CAD)"
            value={<Pnl cents={myCadChangeCents} />}
            note={`${pct(myCadChangeFrac ?? 0, 2)} · unrealized vs cost`}
          />
        )}
      </section>

      {/* Positions + Your accounts stack in the left column; Activity fills the
          rail across the height of BOTH (on lg it's absolutely-filled so the row
          track is set by the left column, then scrolls internally; on mobile it's
          a normal block under them). */}
      <section className="mt-6 grid items-start gap-4 lg:grid-cols-4">
        <div className="space-y-6 lg:col-span-3">
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

      {/* The agent's latest briefing + journal, with the Agenda alongside when open.
          Pending research sits under the Agenda and above the intraday check-in/brief
          (Cam 2026-06-29). */}
      <section className="mt-6 grid items-start gap-4 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <ResearchQueueCard />
          {briefPanel}
          {journalPanel}
        </div>
        {hasAgenda ? <aside className="lg:col-span-1">{agendaPanel}</aside> : null}
      </section>
      </LiveQuotesProvider>
    </main>
  );
}
