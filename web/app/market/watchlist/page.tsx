import Link from "next/link";
import { prisma } from "@/lib/db";
import { allUniverse } from "@/lib/universe";
import { getQuotes } from "@/lib/broker/quotes";
import { getSession, displayName } from "@/lib/session";
import { Card, PageHeader, EmptyState } from "@/components/ui";
import { computeSignals, overallSignal } from "@/agent/signals";
import AddTicker from "@/components/AddTicker";
import UniverseActions from "@/components/UniverseActions";
import StockTable, { type StockColumn, type StockRow } from "@/components/StockTable";
import WatchlistTabs from "@/components/WatchlistTabs";
import PanelHeader from "@/components/PanelHeader";
import { allWatches } from "@/lib/watch";
import { memberKeyForEmail } from "@/lib/users";

export const dynamic = "force-dynamic";

// The watchlist table carries the at-a-glance numbers inline (call, indicators,
// target upside, manage actions); clicking a row expands it for Alfred's call blurb +
// the dossier's plain-English "why" (Cam 2026-06-17). The full long-form dossier
// (business / bull / bear / sources) still lives one click away on the stock page.
const COLUMNS: StockColumn[] = ["last", "day", "call", "upside", "conf", "watcher"];

export default async function Watchlist() {
  const [session, universe, requests, directives] = await Promise.all([
    getSession(),
    allUniverse(),
    prisma.researchRequest.findMany({
      where: { OR: [{ status: { in: ["QUEUED", "RUNNING"] } }, { at: { gte: new Date(Date.now() - 24 * 60 * 60_000) } }] },
      orderBy: { at: "desc" },
      take: 60,
    }),
    prisma.symbolDirective.findMany(),
  ]);
  const me = displayName(session);
  const isMember = session?.role === "member";
  // The watchlist is WATCH-driven (D-watch): the names a member personally watches —
  // candidates being researched AND names already in the Universe (promotion no longer
  // un-watches a name). Tabs filter to each member's own watches. Agent-tracked names
  // nobody watches live on the Universe / Hunt / Browse pages, not here.
  const watchMap = await allWatches(); // symbol -> members watching it
  const bySym = new Map(universe.map((u) => [u.symbol, u]));
  const tracked = [...watchMap.keys()]
    .map((sym) => bySym.get(sym))
    .filter((u): u is (typeof universe)[number] => !!u && u.status !== "RETIRED");
  const retired = universe.filter((u) => u.status === "RETIRED");

  // Rich data for the watchlist tracked.
  const quotes = await getQuotes(tracked.map((c) => c.symbol));
  const stanceRows = await prisma.journalEntry.findMany({
    where: { stance: { not: null }, symbol: { not: null } },
    orderBy: { at: "desc" },
    select: { symbol: true, stance: true },
  });
  const stanceBy = new Map<string, string>();
  for (const s of stanceRows) if (s.symbol && !stanceBy.has(s.symbol)) stanceBy.set(s.symbol, s.stance as string);
  const sigList = await Promise.all(tracked.map((c) => computeSignals(c.symbol).catch(() => null)));
  const dirBy = new Map(directives.map((d) => [d.symbol, d]));
  const jc = await prisma.journalEntry.groupBy({
    by: ["symbol"],
    _count: { id: true },
    where: { symbol: { in: tracked.map((c) => c.symbol) } },
  });
  const jcBy = new Map(jc.map((j) => [j.symbol as string, j._count.id]));

  // Latest dossier per candidate — its price targets + confidence feed the table.
  const dossiers = await prisma.journalEntry.findMany({
    where: { kind: "RESEARCH", title: { startsWith: "Dossier" }, symbol: { in: tracked.map((c) => c.symbol) } },
    orderBy: { at: "desc" },
  });
  const dossierBy = new Map<string, (typeof dossiers)[number]>();
  for (const d of dossiers) if (d.symbol && !dossierBy.has(d.symbol)) dossierBy.set(d.symbol, d);

  const rows: StockRow[] = tracked
    .map((c, i) => {
      const q = quotes.get(c.symbol);
      const sig = sigList[i];
      const d = dirBy.get(c.symbol);
      const doss = dossierBy.get(c.symbol);
      const cur = q?.midCents ?? null;
      return {
        symbol: c.symbol,
        name: c.name,
        logoUrl: c.logoUrl,
        currency: c.currency,
        note: c.note,
        tier: c.tier,
        country: c.country,
        exchange: c.exchange,
        sector: c.sector,
        marketCapM: c.marketCapM,
        watchers: watchMap.get(c.symbol) ?? [],
        lastCents: cur,
        dayBps: q?.dayChangeBps ?? null,
        signals: sig,
        rec: sig ? overallSignal(sig) : null,
        stance: stanceBy.get(c.symbol) ?? null,
        pinnedBy: d?.directive === "PINNED" ? d.by : null,
        blocked: d?.directive === "BLOCKED",
        journal: jcBy.get(c.symbol) ?? 0,
        upsidePct: cur && doss?.targetFarCents != null ? (doss.targetFarCents - cur) / cur : null,
        nearPct: cur && doss?.targetNearCents != null ? (doss.targetNearCents - cur) / cur : null,
        nearDays: doss?.targetNearDays ?? null,
        confidence: doss?.confidence ?? null,
        bottomLine: doss?.bottomLine ?? null,
        held: null,
        mvCents: 0,
        upnlCents: 0,
        lastResearchedAt: null,
        manageStatus: c.status as "CANDIDATE" | "ACTIVE",
        promotionRequestedBy: c.promotionRequestedBy,
        proposedTier: c.proposedTier,
        researchInFlight: requests.some((r) => r.symbol === c.symbol && r.status === "RUNNING"),
      };
    })
    // Pinned (priority) names sort to the top; the rest alphabetical.
    .sort((a, b) => (a.pinnedBy ? -1 : b.pinnedBy ? 1 : a.symbol.localeCompare(b.symbol)));

  // Per-member tab counts (All / Cam / Graham). A name both members watch counts under
  // BOTH — watching is many-to-many now (D-watch).
  const ownerCounts: Record<"all" | "cam" | "graham", number> = { all: rows.length, cam: 0, graham: 0 };
  for (const r of rows) {
    const keys = new Set((r.watchers ?? []).map((w) => w.key));
    if (keys.has("cam")) ownerCounts.cam++;
    if (keys.has("graham")) ownerCounts.graham++;
  }

  // Open on the viewer's OWN watches by default (Cam 2026-06-25) — but only if they're a
  // member with at least one watch; otherwise fall back to "all" so a viewer (or a member
  // who hasn't watched anything yet) isn't met with an empty list.
  const myKey = memberKeyForEmail(session?.email);
  const defaultTab: "all" | "cam" | "graham" =
    (myKey === "cam" || myKey === "graham") && ownerCounts[myKey] > 0 ? myKey : "all";

  const running = requests.filter((r) => r.status === "RUNNING");
  const queued = requests.filter((r) => r.status === "QUEUED");
  const recentDone = requests.filter((r) => r.status === "DONE").slice(0, 8);
  const recentFailed = requests.filter((r) => r.status === "FAILED").slice(0, 4);

  return (
    <main>
      <PageHeader title="Watchlist" sub="The names you're watching — GRQ researches each one, and they stay here even after they're promoted into the Universe." />

      <section className="mb-8">
        {rows.length === 0 ? (
          <>
            {isMember && (
              <div className="mb-4">
                <AddTicker />
              </div>
            )}
            <EmptyState
              title="Nothing on the watchlist"
              body="Watch a name above, or find one on Browse / The Hunt — GRQ starts researching it the moment you do."
            />
          </>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <WatchlistTabs counts={ownerCounts} defaultTab={defaultTab} />
              {isMember && (
                <div className="ml-auto">
                  <AddTicker />
                </div>
              )}
            </div>
            <StockTable rows={rows} columns={COLUMNS} isMember={isMember} currentUser={me} inUniverseLink />
          </>
        )}

        <p className="mt-3 text-xs text-teal-200/40">
          <span className="font-semibold text-teal-200/60">Alfred&apos;s call</span> is the verdict.{" "}
          <span className="font-semibold text-teal-200/60">12-mo</span> is the agent&apos;s target upside (hover for near-term).{" "}
          Click a row for GRQ&apos;s reasoning; open a name for the full dossier — business, bull &amp; bear case, sources.
        </p>
      </section>

      <section className="mt-10 border-t border-teal-400/10 pt-6">
        <div className="mb-1"><PanelHeader>Agent research pipeline</PanelHeader></div>
        <p className="mb-4 text-xs text-teal-200/40">What the agent is auto-researching — behind-the-scenes plumbing.</p>

        <Card className="mb-6 border-teal-400/30 p-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-teal-300/70">Research queue</span>
            {running.length > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-400/15 px-2.5 py-0.5 text-sm font-semibold text-teal-200">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal-400" />
                researching {running.map((r) => r.symbol).join(", ")}…
              </span>
            )}
            {queued.length > 0 ? (
              <span className="text-sm text-teal-100/70">
                <b className="text-teal-50">{queued.length}</b> queued: {queued.slice(0, 12).map((r) => r.symbol).join(", ")}
                {queued.length > 12 ? ` +${queued.length - 12}` : ""}
              </span>
            ) : running.length === 0 ? (
              <span className="text-sm text-teal-200/40">Nothing queued — watch a name above, or hit &ldquo;research now&rdquo; on any stock page.</span>
            ) : null}
            <span className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-teal-200/40">
              {recentDone.length > 0 && <span>recent: {recentDone.map((r) => r.symbol).join(", ")}</span>}
              {recentFailed.length > 0 && <span className="text-red-300/70">failed: {recentFailed.map((r) => r.symbol).join(", ")}</span>}
            </span>
          </div>
        </Card>

        {retired.length > 0 && (
          <div className="mt-4">
            <div className="mb-3"><PanelHeader>Retired ({retired.length}) — history kept</PanelHeader></div>
            <div className="space-y-2">
              {retired.map((r) => (
                <Card key={r.symbol} className="flex flex-wrap items-center gap-4 p-3">
                  <Link href={`/stocks/${r.symbol}`} className="font-semibold text-teal-200/60 hover:underline">
                    {r.symbol}
                  </Link>
                  <span className="text-sm text-teal-200/40">{r.name}</span>
                  {isMember && (
                    <div className="ml-auto">
                      <UniverseActions symbol={r.symbol} status="RETIRED" pendingBy={null} proposedTier={null} currentUser={me} />
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
