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

export const dynamic = "force-dynamic";

// addedBy carries system sentinels for non-member adds (DB seed / migration
// backfill) — only surface it when it's an actual person who watched the name.
function watchedBy(addedBy: string | null): string | null {
  if (!addedBy || addedBy === "migration" || addedBy.startsWith("seed")) return null;
  return addedBy;
}

// The watchlist table carries the at-a-glance numbers inline (call, indicators,
// target upside, manage actions); clicking a row expands it for GRQ's call blurb +
// the dossier's plain-English "why" (Cam 2026-06-17). The full long-form dossier
// (business / bull / bear / sources) still lives one click away on the stock page.
const COLUMNS: StockColumn[] = ["last", "day", "signals", "call", "upside", "conf", "journal", "watcher"];

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
  const candidates = universe.filter((u) => u.status === "CANDIDATE");
  const retired = universe.filter((u) => u.status === "RETIRED");

  // Rich data for the watchlist candidates.
  const quotes = await getQuotes(candidates.map((c) => c.symbol));
  const stanceRows = await prisma.journalEntry.findMany({
    where: { stance: { not: null }, symbol: { not: null } },
    orderBy: { at: "desc" },
    select: { symbol: true, stance: true },
  });
  const stanceBy = new Map<string, string>();
  for (const s of stanceRows) if (s.symbol && !stanceBy.has(s.symbol)) stanceBy.set(s.symbol, s.stance as string);
  const sigList = await Promise.all(candidates.map((c) => computeSignals(c.symbol).catch(() => null)));
  const dirBy = new Map(directives.map((d) => [d.symbol, d]));
  const jc = await prisma.journalEntry.groupBy({
    by: ["symbol"],
    _count: { id: true },
    where: { symbol: { in: candidates.map((c) => c.symbol) } },
  });
  const jcBy = new Map(jc.map((j) => [j.symbol as string, j._count.id]));

  // Latest dossier per candidate — its price targets + confidence feed the table.
  const dossiers = await prisma.journalEntry.findMany({
    where: { kind: "RESEARCH", title: { startsWith: "Dossier" }, symbol: { in: candidates.map((c) => c.symbol) } },
    orderBy: { at: "desc" },
  });
  const dossierBy = new Map<string, (typeof dossiers)[number]>();
  for (const d of dossiers) if (d.symbol && !dossierBy.has(d.symbol)) dossierBy.set(d.symbol, d);

  const rows: StockRow[] = candidates
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
        addedBy: watchedBy(c.addedBy),
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
        manageStatus: "CANDIDATE" as const,
        promotionRequestedBy: c.promotionRequestedBy,
        proposedTier: c.proposedTier,
        researchInFlight: requests.some((r) => r.symbol === c.symbol && r.status === "RUNNING"),
      };
    })
    // Pinned (priority) names sort to the top; the rest alphabetical.
    .sort((a, b) => (a.pinnedBy ? -1 : b.pinnedBy ? 1 : a.symbol.localeCompare(b.symbol)));

  const running = requests.filter((r) => r.status === "RUNNING");
  const queued = requests.filter((r) => r.status === "QUEUED");
  const recentDone = requests.filter((r) => r.status === "DONE").slice(0, 8);
  const recentFailed = requests.filter((r) => r.status === "FAILED").slice(0, 4);

  return (
    <main>
      <PageHeader title="Watchlist" sub="Names GRQ is researching for you — promote one (both members) to let the agent trade it in the Universe." />

      <section className="mb-8">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-teal-300/70">Watchlist — {candidates.length} tracked</h2>
          <p className="text-xs text-teal-200/40">
            Names GRQ is researching — promote one (both members) to let the agent trade it in the Universe.
          </p>
        </div>

        {isMember && (
          <div className="mb-4">
            <AddTicker />
          </div>
        )}

        {rows.length === 0 ? (
          <EmptyState
            title="Nothing on the watchlist"
            body="Watch a name above, or find one on Browse / The Hunt — GRQ starts researching it the moment you do."
          />
        ) : (
          <StockTable rows={rows} columns={COLUMNS} isMember={isMember} currentUser={me} />
        )}

        <p className="mt-3 text-xs text-teal-200/40">
          <span className="font-semibold text-teal-200/60">Signals</span> are inputs (T trend · R rsi · M macd · V volatility);{" "}
          <span className="font-semibold text-teal-200/60">GRQ&apos;s call</span> is the verdict.{" "}
          <span className="font-semibold text-teal-200/60">12-mo</span> is the agent&apos;s target upside (hover for near-term).{" "}
          Click a row for GRQ&apos;s reasoning; open a name for the full dossier — business, bull &amp; bear case, sources.
        </p>
      </section>

      <section className="mt-10 border-t border-teal-400/10 pt-6">
        <h2 className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-teal-300/70">Agent research pipeline</h2>
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
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-teal-200/50">Retired ({retired.length}) — history kept</h3>
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
