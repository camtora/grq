import Link from "next/link";
import { prisma } from "@/lib/db";
import { allUniverse } from "@/lib/universe";
import { getSession, displayName } from "@/lib/session";
import { fmtWhen } from "@/lib/money";
import { Card, PageHeader } from "@/components/ui";
import MarketTabs from "@/components/MarketTabs";
import AddTicker from "@/components/AddTicker";
import NoteForm from "@/components/NoteForm";
import Md from "@/components/Md";
import UniverseActions from "@/components/UniverseActions";

export const dynamic = "force-dynamic";

export default async function ResearchDesk() {
  const [session, universe, requests, notes] = await Promise.all([
    getSession(),
    allUniverse(),
    prisma.researchRequest.findMany({
      where: {
        OR: [{ status: { in: ["QUEUED", "RUNNING"] } }, { at: { gte: new Date(Date.now() - 24 * 60 * 60_000) } }],
      },
      orderBy: { at: "desc" },
      take: 60,
    }),
    prisma.note.findMany({ orderBy: { at: "desc" }, take: 50 }),
  ]);
  const me = displayName(session);
  const isMember = session?.role === "member";
  const retired = universe.filter((u) => u.status === "RETIRED");

  const running = requests.filter((r) => r.status === "RUNNING");
  const queued = requests.filter((r) => r.status === "QUEUED");
  const recentDone = requests.filter((r) => r.status === "DONE").slice(0, 8);
  const recentFailed = requests.filter((r) => r.status === "FAILED").slice(0, 4);

  return (
    <main>
      <PageHeader title="Market" sub="Discover names beyond GRQ's universe — the agent's ideas, the whole-market screener, and your research desk." />
      <MarketTabs />

      {isMember && (
        <section className="mb-8">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-teal-300/70">Look up a stock</h2>
          <AddTicker />
          <p className="mt-2 text-xs text-teal-200/40">
            Adding a name puts it on your{" "}
            <Link href="/universe" className="text-teal-300 hover:underline">
              watchlist
            </Link>{" "}
            and the agent dossiers it.
          </p>
        </section>
      )}

      <section className="mb-8">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-teal-300/70">Your research notes</h2>
        {isMember && <NoteForm />}
        {notes.length > 0 ? (
          <div className="mt-3 space-y-3">
            {notes.map((n) => (
              <Card key={n.id} className="p-4">
                <div className="mb-1 flex items-center gap-2 text-xs text-teal-200/40">
                  {n.symbol && (
                    <Link href={`/stocks/${n.symbol}`} className="font-bold text-teal-300 hover:underline">
                      {n.symbol}
                    </Link>
                  )}
                  <span>{n.author}</span>
                  <span className="ml-auto">{fmtWhen(n.at)}</span>
                </div>
                <Md text={n.body} />
              </Card>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-teal-200/40">No notes yet{isMember ? " — jot your first one above." : "."}</p>
        )}
      </section>

      <section className="mt-10 border-t border-teal-400/10 pt-6">
        <h2 className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-teal-300/70">Agent research pipeline</h2>
        <p className="mb-4 text-xs text-teal-200/40">
          What the agent is auto-researching — behind-the-scenes plumbing. Your watchlist candidates and their promote
          buttons live on the{" "}
          <Link href="/universe" className="text-teal-300 hover:underline">
            Universe
          </Link>{" "}
          tab.
        </p>

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
