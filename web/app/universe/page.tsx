import Link from "next/link";
import { prisma } from "@/lib/db";
import { activeUniverse, allUniverse, type UniverseRow } from "@/lib/universe";
import { getQuotes } from "@/lib/broker/quotes";
import { money, fmtWhen } from "@/lib/money";
import { Card, PageHeader, Chip } from "@/components/ui";
import { computeSignals, overallSignal } from "@/agent/signals";
import { capTier, CAP_LABEL, type CapTier } from "@/lib/fundamentals";
import { getSession, displayName } from "@/lib/session";
import StockFilters from "@/components/StockFilters";
import UniverseActions from "@/components/UniverseActions";
import UniverseTabs from "@/components/UniverseTabs";
import Term from "@/components/Term";
import StockTable, { type StockColumn, type StockRow } from "@/components/StockTable";
import AvatarStack from "@/components/AvatarStack";
import PanelHeader from "@/components/PanelHeader";
import { watchersFor } from "@/lib/watch";

export const dynamic = "force-dynamic";

const COLUMNS: StockColumn[] = ["tier", "last", "day", "call", "conf", "position", "unrealized", "researched", "watcher"];
// Researched tab is a lean catalogue — call + the dossier's confidence + when it was
// last researched (no per-name quote/signal fetches).
const RESEARCHED_COLUMNS: StockColumn[] = ["tier", "call", "conf", "researched"];

function sortActive(rows: StockRow[]): StockRow[] {
  return rows.sort((a, b) => {
    if (!!a.held !== !!b.held) return a.held ? -1 : 1;
    if (a.held && b.held) return b.mvCents - a.mvCents;
    if (!!a.pinnedBy !== !!b.pinnedBy) return a.pinnedBy ? -1 : 1;
    return a.symbol.localeCompare(b.symbol);
  });
}

export default async function Universe() {
  const [session, active, positions, directives, journalCounts] = await Promise.all([
    getSession(),
    activeUniverse(),
    prisma.position.findMany(),
    prisma.symbolDirective.findMany(),
    prisma.journalEntry.groupBy({ by: ["symbol"], _count: { id: true }, where: { symbol: { not: null } } }),
  ]);
  const me = displayName(session);
  const isMember = session?.role === "member";

  // Demoted shelf — CANDIDATEs that were pulled out of the universe (they carry a
  // demote journal). Shown below the active table for reference; they're back on
  // the watchlist and the agent won't buy them (Cam 2026-06-16).
  const [allRows, demoteJournals] = await Promise.all([
    allUniverse(),
    prisma.journalEntry.findMany({
      where: { kind: "SYSTEM", title: { contains: "demoted" } },
      orderBy: { at: "desc" },
      select: { symbol: true, title: true, at: true },
    }),
  ]);
  const demotedBy = new Map<string, { at: Date; by: string }>();
  for (const j of demoteJournals) {
    if (j.symbol && !demotedBy.has(j.symbol)) demotedBy.set(j.symbol, { at: j.at, by: j.title.split(" demoted ")[0] ?? "" });
  }
  const demoted = allRows.filter((u) => u.status === "CANDIDATE" && demotedBy.has(u.symbol));

  const allSyms = [...active.map((u) => u.symbol), ...demoted.map((u) => u.symbol)];
  const quotes = await getQuotes(allSyms);
  // Who's watching each name (D-watch) — independent of universe membership, so an
  // ACTIVE name can still carry its watchers' faces.
  const watchersMap = await watchersFor(allSyms);

  const stanceRows = await prisma.journalEntry.findMany({
    where: { stance: { not: null }, symbol: { not: null } },
    orderBy: { at: "desc" },
    select: { symbol: true, stance: true },
  });
  const stanceBy = new Map<string, string>();
  for (const s of stanceRows) if (s.symbol && !stanceBy.has(s.symbol)) stanceBy.set(s.symbol, s.stance as string);

  // Latest dossier per name — its plain-English "why" + price targets feed the
  // expandable row detail (Cam 2026-06-17).
  const dossiers = await prisma.journalEntry.findMany({
    where: { kind: "RESEARCH", title: { startsWith: "Dossier" }, symbol: { in: allSyms } },
    orderBy: { at: "desc" },
    select: { symbol: true, bottomLine: true, confidence: true, targetNearCents: true, targetNearDays: true, targetFarCents: true, at: true },
  });
  const dossierBy = new Map<string, (typeof dossiers)[number]>();
  for (const d of dossiers) if (d.symbol && !dossierBy.has(d.symbol)) dossierBy.set(d.symbol, d);

  const signalsList = await Promise.all(allSyms.map((s) => computeSignals(s).catch(() => null)));
  const sigBy = new Map(allSyms.map((s, i) => [s, signalsList[i]] as const));

  const posBy = new Map(positions.map((p) => [p.symbol, p]));
  const dirBy = new Map(directives.map((d) => [d.symbol, d]));
  const jcBy = new Map(journalCounts.map((j) => [j.symbol as string, j._count.id]));

  // When each name was last researched (latest completed research request) — shown
  // as the "Researched" column (the "research now" control lives on the stock page).
  const researchedAgg = await prisma.researchRequest.groupBy({
    by: ["symbol"],
    where: { status: "DONE", completedAt: { not: null } },
    _max: { completedAt: true },
  });
  const researchedBy = new Map(researchedAgg.map((r) => [r.symbol, r._max.completedAt]));

  const toRow = (u: UniverseRow): StockRow => {
    const q = quotes.get(u.symbol);
    const p = posBy.get(u.symbol);
    const d = dirBy.get(u.symbol);
    const sig = sigBy.get(u.symbol) ?? null;
    const doss = dossierBy.get(u.symbol);
    const cur = q?.midCents ?? null;
    return {
      symbol: u.symbol,
      name: u.name,
      logoUrl: u.logoUrl,
      currency: u.currency,
      note: u.note,
      tier: u.tier,
      country: u.country,
      exchange: u.exchange,
      sector: u.sector,
      marketCapM: u.marketCapM,
      watchers: watchersMap.get(u.symbol) ?? [],
      lastCents: q?.midCents ?? null,
      dayBps: q?.dayChangeBps ?? null,
      signals: sig,
      rec: sig ? overallSignal(sig) : null,
      stance: stanceBy.get(u.symbol) ?? null,
      pinnedBy: d?.directive === "PINNED" ? d.by : null,
      blocked: d?.directive === "BLOCKED",
      journal: jcBy.get(u.symbol) ?? 0,
      upsidePct: cur && doss?.targetFarCents != null ? (doss.targetFarCents - cur) / cur : null,
      nearPct: cur && doss?.targetNearCents != null ? (doss.targetNearCents - cur) / cur : null,
      nearDays: doss?.targetNearDays ?? null,
      confidence: doss?.confidence ?? null,
      bottomLine: doss?.bottomLine ?? null,
      held: p ? { qty: p.qty } : null,
      mvCents: p && q ? p.qty * q.midCents : 0,
      upnlCents: p && q ? p.qty * (q.midCents - p.avgCostCents) : 0,
      // Prefer a completed research request; fall back to the dossier's own timestamp
      // so a name researched without a tracked request (older dossiers, hunt finds)
      // still shows when it was last looked at, not "—" (Cam 2026-06-19).
      lastResearchedAt: researchedBy.get(u.symbol) ?? doss?.at ?? null,
      manageStatus: "ACTIVE",
      promotionRequestedBy: null,
      proposedTier: null,
      researchInFlight: false,
    };
  };

  const activeRows = sortActive(active.map(toRow));

  const heldCount = activeRows.filter((r) => r.held).length;
  const investedCents = activeRows.reduce((s, r) => s + r.mvCents, 0);

  // Filter options from whatever fundamentals are populated so far.
  const COUNTRY_LABEL: Record<string, string> = { CA: "Canada", US: "United States" };
  const distinct = (vals: (string | null)[]) => [...new Set(vals.filter((v): v is string => !!v))].sort();
  const countryOpts = distinct(activeRows.map((r) => r.country)).map((v) => ({ value: v, label: COUNTRY_LABEL[v] ?? v }));
  const exchangeOpts = distinct(activeRows.map((r) => r.exchange)).map((v) => ({ value: v, label: v }));
  const sectorOpts = distinct(activeRows.map((r) => r.sector)).map((v) => ({ value: v, label: v }));
  const capPresent = new Set(activeRows.map((r) => capTier(r.marketCapM)).filter((c): c is CapTier => !!c));
  const capOrder: CapTier[] = ["mega", "large", "mid", "small", "micro"];
  const capOpts = capOrder.filter((c) => capPresent.has(c)).map((c) => ({ value: c, label: CAP_LABEL[c] }));

  // Researched tab — every name with a dossier (tradeable or not: universe,
  // watchlist candidates, hunt finds, movers). Joins universe metadata where we have
  // it, falls back to the bare ticker otherwise. Newest research first.
  const allDossiers = await prisma.journalEntry.findMany({
    where: { kind: "RESEARCH", title: { startsWith: "Dossier" }, symbol: { not: null } },
    orderBy: { at: "desc" },
    select: { symbol: true, bottomLine: true, confidence: true, targetNearCents: true, targetNearDays: true, targetFarCents: true, at: true },
  });
  const latestDossierBy = new Map<string, (typeof allDossiers)[number]>();
  for (const d of allDossiers) if (d.symbol && !latestDossierBy.has(d.symbol)) latestDossierBy.set(d.symbol, d);
  const metaBy = new Map(allRows.map((u) => [u.symbol, u]));
  const researchedRows: StockRow[] = [...latestDossierBy.values()]
    .map((doss): StockRow => {
      const sym = doss.symbol as string;
      const u = metaBy.get(sym);
      return {
        symbol: sym,
        name: u?.name ?? sym,
        logoUrl: u?.logoUrl ?? null,
        currency: u?.currency ?? null,
        note: null,
        tier: u?.tier ?? null,
        country: u?.country ?? null,
        exchange: u?.exchange ?? null,
        sector: u?.sector ?? null,
        marketCapM: u?.marketCapM ?? null,
        lastCents: null,
        dayBps: null,
        signals: null,
        rec: null,
        stance: stanceBy.get(sym) ?? null,
        pinnedBy: null,
        blocked: false,
        journal: jcBy.get(sym) ?? 0,
        upsidePct: null,
        nearPct: null,
        nearDays: doss.targetNearDays ?? null,
        confidence: doss.confidence ?? null,
        bottomLine: doss.bottomLine ?? null,
        held: null,
        mvCents: 0,
        upnlCents: 0,
        lastResearchedAt: researchedBy.get(sym) ?? doss.at,
        manageStatus: null,
        promotionRequestedBy: null,
        proposedTier: null,
        researchInFlight: false,
      };
    })
    .sort((a, b) => (b.lastResearchedAt?.getTime() ?? 0) - (a.lastResearchedAt?.getTime() ?? 0));

  return (
    <main>
      <PageHeader
        title="Universe"
        sub="The names GRQ can invest in. New names start on the Watchlist and get promoted in."
        right={
          <Link href="/market/watchlist">
            <Chip tone="teal">watchlist →</Chip>
          </Link>
        }
      />

      <UniverseTabs
        universeCount={active.length}
        researchedCount={researchedRows.length}
        researched={
          <section>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <PanelHeader>
                Researched — {researchedRows.length} with a dossier
              </PanelHeader>
              <p className="text-xs text-teal-200/40">
                Every name GRQ has written a dossier on — tradeable or not. Sorted by most recently researched.
              </p>
            </div>
            {researchedRows.length === 0 ? (
              <Card className="p-6 text-sm text-teal-200/40">No dossiers on file yet.</Card>
            ) : (
              <StockTable rows={researchedRows} columns={RESEARCHED_COLUMNS} isMember={false} currentUser={me} initialSort={null} />
            )}
          </section>
        }
        universe={
          <>
      <section>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <PanelHeader>
            <Term k="universe">The universe</Term> — {active.length} investable
          </PanelHeader>
          <p className="text-xs text-teal-200/40">
            What the agent is allowed to buy. {heldCount > 0 ? `You hold ${heldCount} · ${money(investedCents)} invested.` : "No positions yet."}
          </p>
        </div>
        <StockFilters countries={countryOpts} exchanges={exchangeOpts} sectors={sectorOpts} caps={capOpts} />
        <StockTable rows={activeRows} columns={COLUMNS} isMember={isMember} currentUser={me} />
      </section>

      {demoted.length > 0 && (
        <section className="mt-8 border-t border-teal-400/10 pt-6">
          <div className="mb-1"><PanelHeader>Demoted ({demoted.length})</PanelHeader></div>
          <p className="mb-3 text-xs text-teal-200/40">
            Pulled out of the universe — back on the watchlist, the agent won&apos;t buy them. Re-promote or retire below.
          </p>
          <div className="space-y-2">
            {demoted.map((u) => {
              const q = quotes.get(u.symbol);
              const info = demotedBy.get(u.symbol);
              return (
                <Card key={u.symbol} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
                  <Link href={`/stocks/${u.symbol}`} className="font-semibold text-teal-300 hover:underline">
                    {u.symbol}
                  </Link>
                  <span className="text-sm text-teal-200/60">{u.name}</span>
                  {q && <span className="text-sm tabular-nums text-teal-100/70">{money(q.midCents, u.currency)}</span>}
                  {info && (
                    <span className="text-xs text-teal-200/40">
                      demoted{info.by ? ` by ${info.by}` : ""} · {fmtWhen(info.at)}
                    </span>
                  )}
                  <AvatarStack people={watchersMap.get(u.symbol) ?? []} />
                  {isMember && (
                    <div className="ml-auto">
                      <UniverseActions symbol={u.symbol} status="CANDIDATE" pendingBy={u.promotionRequestedBy} proposedTier={u.proposedTier} currentUser={me} hideResearch />
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </section>
      )}

      <p className="mt-6 text-xs text-teal-200/40">
        <span className="font-semibold text-teal-200/60">Alfred&apos;s call</span> is the rating — its own judgment from its latest dossier.{" "}
        Click any row to read GRQ&apos;s reasoning. quotes delayed ~15 min · the risk dial gates which tiers the agent may buy.
      </p>
          </>
        }
      />
    </main>
  );
}
