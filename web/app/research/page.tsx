import Link from "next/link";
import { prisma } from "@/lib/db";
import { allUniverse } from "@/lib/universe";
import { getQuotes } from "@/lib/broker/quotes";
import { getSession, displayName } from "@/lib/session";
import { money, pct, fmtDay } from "@/lib/money";
import { Card, PageHeader, Chip } from "@/components/ui";
import AddTicker from "@/components/AddTicker";
import UniverseActions from "@/components/UniverseActions";

export default async function Research() {
  const [session, universe, requests] = await Promise.all([
    getSession(),
    allUniverse(),
    prisma.researchRequest.findMany({
      where: {
        OR: [{ status: { in: ["QUEUED", "RUNNING"] } }, { at: { gte: new Date(Date.now() - 24 * 60 * 60_000) } }],
      },
      orderBy: { at: "desc" },
      take: 60,
    }),
  ]);
  const me = displayName(session);
  const isMember = session?.role === "member";
  const candidates = universe.filter((u) => u.status === "CANDIDATE");
  const retired = universe.filter((u) => u.status === "RETIRED");

  const running = requests.filter((r) => r.status === "RUNNING");
  const queued = requests.filter((r) => r.status === "QUEUED");
  const recentDone = requests.filter((r) => r.status === "DONE").slice(0, 8);
  const recentFailed = requests.filter((r) => r.status === "FAILED").slice(0, 4);
  const inFlight = new Set([...running, ...queued].map((r) => r.symbol));

  const quotes = await getQuotes(candidates.map((c) => c.symbol));
  const dossierBy = new Map<string, Date>();
  for (const c of candidates) {
    const latest = await prisma.journalEntry.findFirst({
      where: { symbol: c.symbol, kind: "RESEARCH", title: { startsWith: "Dossier —" } },
      orderBy: { at: "desc" },
      select: { at: true },
    });
    if (latest) dossierBy.set(c.symbol, latest.at);
  }

  return (
    <main>
      <PageHeader
        title="Research"
        sub="The agent researches continuously. Candidates are signal-tracked and dossier'd but NOT tradeable — promotion takes both members + the automated screen."
        right={
          <Link href="/stocks">
            <Chip tone="teal">← universe</Chip>
          </Link>
        }
      />

      {/* Research queue — front and centre, never dig for it */}
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
            <span className="text-sm text-teal-200/40">
              Nothing queued — add a name below, or hit “research now” on any stock page.
            </span>
          ) : null}
          <span className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-teal-200/40">
            {recentDone.length > 0 && <span>recent: {recentDone.map((r) => r.symbol).join(", ")}</span>}
            {recentFailed.length > 0 && <span className="text-red-300/70">failed: {recentFailed.map((r) => r.symbol).join(", ")}</span>}
          </span>
        </div>
      </Card>

      {isMember && (
        <div className="mb-6">
          <AddTicker />
        </div>
      )}

      {candidates.length === 0 ? (
        <Card className="p-8 text-center text-sm text-teal-200/40">
          No candidates — add a ticker above and the agent researches it.
        </Card>
      ) : (
        <div className="space-y-3">
          {candidates.map((c) => {
            const q = quotes.get(c.symbol);
            const dossierAt = dossierBy.get(c.symbol);
            return (
              <Card key={c.symbol} className="p-4">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <Link href={`/stocks/${c.symbol}`} className="text-lg font-bold text-teal-300 hover:underline">
                    {c.symbol}
                  </Link>
                  <span className="text-sm text-teal-100/70">{c.name}</span>
                  <Chip tone="dim">candidate</Chip>
                  {q && (
                    <span className="text-sm tabular-nums text-teal-100/80">
                      {money(q.midCents)}{" "}
                      <span className={(q.dayChangeBps ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}>
                        {pct((q.dayChangeBps ?? 0) / 10_000, 2)}
                      </span>
                    </span>
                  )}
                  <span className="ml-auto text-xs text-teal-200/40">
                    {dossierAt ? `dossier ${fmtDay(dossierAt)}` : inFlight.has(c.symbol) ? "dossier in progress…" : "no dossier yet"}
                    {c.addedBy ? ` · added by ${c.addedBy}` : ""}
                  </span>
                </div>
                {isMember && (
                  <div className="mt-3">
                    <UniverseActions
                      symbol={c.symbol}
                      status="CANDIDATE"
                      pendingBy={c.promotionRequestedBy}
                      proposedTier={c.proposedTier}
                      currentUser={me}
                      researchInFlight={inFlight.has(c.symbol)}
                    />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {retired.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-teal-200/50">
            Retired ({retired.length}) — history kept
          </h2>
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
    </main>
  );
}
