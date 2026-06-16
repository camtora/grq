import Link from "next/link";
import { prisma } from "@/lib/db";
import { allUniverse, type UniverseRow } from "@/lib/universe";
import { getQuotes } from "@/lib/broker/quotes";
import { getSession, displayName } from "@/lib/session";
import { money, pct, fmtWhen } from "@/lib/money";
import { Card, PageHeader, Chip, EmptyState } from "@/components/ui";
import { computeSignals, overallSignal, type Signals, type Recommendation } from "@/agent/signals";
import SignalStrip from "@/components/SignalStrip";
import { stanceMeta, STANCE_TONE_CLASSES } from "@/lib/stance";
import MarketTabs from "@/components/MarketTabs";
import AddTicker from "@/components/AddTicker";
import NoteForm from "@/components/NoteForm";
import Md from "@/components/Md";
import UniverseActions from "@/components/UniverseActions";

export const dynamic = "force-dynamic";

function StanceCell({ stance, rec }: { stance: string | null; rec: Recommendation | null }) {
  if (stance) {
    const sm = stanceMeta(stance)!;
    return (
      <span className={`text-xs font-bold ${STANCE_TONE_CLASSES[sm.tone].text}`} title={`GRQ's call: ${sm.blurb}`}>
        {sm.label}
      </span>
    );
  }
  if (rec) {
    return (
      <span className="text-xs text-teal-200/40" title="No GRQ call yet — technical lean only (an input, not a verdict)">
        {rec.label} <span className="text-[9px] text-teal-200/30">tech</span>
      </span>
    );
  }
  return <span className="text-xs text-teal-200/25">—</span>;
}

type Row = UniverseRow & {
  lastCents: number | null;
  dayBps: number | null;
  signals: Signals | null;
  rec: Recommendation | null;
  stance: string | null;
  pinnedBy: string | null;
  journal: number;
};

export default async function Watchlist() {
  const [session, universe, requests, notes, directives] = await Promise.all([
    getSession(),
    allUniverse(),
    prisma.researchRequest.findMany({
      where: { OR: [{ status: { in: ["QUEUED", "RUNNING"] } }, { at: { gte: new Date(Date.now() - 24 * 60 * 60_000) } }] },
      orderBy: { at: "desc" },
      take: 60,
    }),
    prisma.note.findMany({ orderBy: { at: "desc" }, take: 50 }),
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

  const rows: Row[] = candidates
    .map((c, i) => {
      const q = quotes.get(c.symbol);
      const sig = sigList[i];
      const d = dirBy.get(c.symbol);
      return {
        ...c,
        lastCents: q?.midCents ?? null,
        dayBps: q?.dayChangeBps ?? null,
        signals: sig,
        rec: sig ? overallSignal(sig) : null,
        stance: stanceBy.get(c.symbol) ?? null,
        pinnedBy: d?.directive === "PINNED" ? d.by : null,
        journal: jcBy.get(c.symbol) ?? 0,
      };
    })
    .sort((a, b) => (a.pinnedBy ? -1 : b.pinnedBy ? 1 : a.symbol.localeCompare(b.symbol)));

  const running = requests.filter((r) => r.status === "RUNNING");
  const queued = requests.filter((r) => r.status === "QUEUED");
  const recentDone = requests.filter((r) => r.status === "DONE").slice(0, 8);
  const recentFailed = requests.filter((r) => r.status === "FAILED").slice(0, 4);

  return (
    <main>
      <PageHeader title="Market" sub="Discover names beyond GRQ's universe — the agent's ideas, the whole-market screener, and your watchlist." />
      <MarketTabs />

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
            body="Watch a name above, or find one on Browse / Ideas — GRQ starts researching it the moment you do."
          />
        ) : (
          <div className="space-y-3">
            {rows.map((c) => (
              <Card key={c.symbol} className="p-4">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <Link href={`/stocks/${c.symbol}`} className="text-lg font-bold text-teal-300 hover:underline">
                    {c.symbol}
                  </Link>
                  <span className="text-sm text-teal-100/70">{c.name}</span>
                  {c.pinnedBy && <Chip tone="teal">priority · {c.pinnedBy}</Chip>}
                  {c.lastCents !== null && (
                    <span className="text-sm tabular-nums text-teal-100/80">
                      {money(c.lastCents)}{" "}
                      <span className={(c.dayBps ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}>{pct((c.dayBps ?? 0) / 10_000, 2)}</span>
                    </span>
                  )}
                  <SignalStrip signals={c.signals} />
                  <StanceCell stance={c.stance} rec={c.rec} />
                  <span className="ml-auto text-xs text-teal-200/40">
                    {c.journal > 0 ? `${c.journal} journal` : "no dossier yet"}
                    {c.addedBy ? ` · added by ${c.addedBy}` : ""}
                  </span>
                </div>
                {c.note && <p className="mt-2 text-xs text-teal-200/50">{c.note}</p>}
                {isMember && (
                  <div className="mt-3">
                    <UniverseActions symbol={c.symbol} status="CANDIDATE" pendingBy={c.promotionRequestedBy} proposedTier={c.proposedTier} currentUser={me} />
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>

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
