import { prisma } from "@/lib/db";
import { allUniverse } from "@/lib/universe";
import { getQuotes } from "@/lib/broker/quotes";
import { getSession } from "@/lib/session";
import { computeSignals, overallSignal } from "@/agent/signals";
import { PageHeader } from "@/components/ui";
import { type WatchState } from "@/components/WatchButton";
import RefreshHuntButton from "@/components/RefreshHuntButton";
import DismissButton from "@/components/DismissButton";
import IdeaCard, { type Idea } from "@/components/IdeaCard";
import HuntBar from "@/components/HuntBar";

export const dynamic = "force-dynamic";

export default async function Market() {
  const session = await getSession();
  const isMember = session?.role === "member";
  const state = await prisma.agentState.findUnique({ where: { id: 1 } });

  const universe = await allUniverse();
  const uBy = new Map(universe.map((u) => [u.symbol, u]));
  const statusBy = new Map(universe.map((u) => [u.symbol, u.status]));
  const watchOf = (sym: string): WatchState => {
    const s = statusBy.get(sym);
    return s === "ACTIVE" ? "universe" : s === "CANDIDATE" ? "watching" : "none";
  };

  const huntRaw = await prisma.journalEntry.findMany({
    where: { kind: "RESEARCH", title: { startsWith: "Hunt dossier" }, symbol: { not: null } },
    orderBy: { at: "desc" },
    take: 24,
  });
  const huntSeen = new Set<string>();
  const huntFinds = huntRaw
    .filter((d) => {
      if (!d.symbol || huntSeen.has(d.symbol)) return false;
      huntSeen.add(d.symbol);
      return true;
    })
    .slice(0, 12);

  // The hunt names render through the IdeaCard (compact + discovery: these are
  // leads, not positions, so we lead with upside + conviction, not a Buy/Hold/Sell
  // verdict). Smart money is a roundup, styled apart.
  const quotes = await getQuotes(huntFinds.map((d) => d.symbol as string));
  const toIdea = async (d: (typeof huntFinds)[number]): Promise<Idea> => {
    const sym = d.symbol as string;
    const u = uBy.get(sym);
    const cur = quotes.get(sym)?.midCents ?? null;
    const sig = await computeSignals(sym).catch(() => null);
    return {
      sym,
      name: u?.name ?? sym,
      logoUrl: u?.logoUrl ?? null,
      currency: u?.currency ?? null,
      cur,
      near: cur && d.targetNearCents != null ? (d.targetNearCents - cur) / cur : null,
      far: cur && d.targetFarCents != null ? (d.targetFarCents - cur) / cur : null,
      nearDays: d.targetNearDays ?? null,
      confidence: d.confidence,
      rec: sig ? overallSignal(sig) : null,
      stance: d.stance,
      body: d.body,
      sourcesJson: d.sourcesJson,
      obscurity: d.obscurity ?? null,
      watch: watchOf(sym),
    };
  };
  const huntIdeas: Idea[] = await Promise.all(huntFinds.map(toIdea));
  // Surface obscurity — lead with the deepest cuts (agent's 1–5 score). Stable sort
  // keeps the newest-first order as the tiebreak; unscored names sink to the bottom.
  huntIdeas.sort((a, b) => (b.obscurity ?? -1) - (a.obscurity ?? -1));

  return (
    <main>
      <PageHeader
        title="The Hunt"
        sub="The agent's search for under-the-radar names — earlier-stage leads, often before a price target. Proposals only: watch the ones you like, dismiss the ones you don't."
        right={isMember ? <RefreshHuntButton /> : undefined}
      />

      {isMember && <HuntBar />}

      {state?.huntBrief && (
        <div className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-teal-400/25 bg-teal-400/[0.06] px-3 py-2 text-sm">
          <span aria-hidden>🎯</span>
          <span className="text-teal-100/80">
            Directed hunt: <b className="text-teal-50">{state.huntBrief}</b>
          </span>
          <span className="text-xs text-teal-200/40">— focused results below; hit ↻ refresh hunt to go broad again.</span>
        </div>
      )}

      {huntIdeas.length > 0 && (
        <section className="mb-8">
          <div className="grid items-start gap-4 sm:grid-cols-2">
            {huntIdeas.map((idea) => (
              <div key={idea.sym} className="flex flex-col gap-1.5">
                <IdeaCard idea={idea} isMember={isMember} compact discovery />
                {isMember && (
                  <div className="flex justify-end px-1">
                    <DismissButton symbol={idea.sym} name={idea.name} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="mt-4 text-xs text-teal-200/40">
        The agent can&apos;t add or trade these itself — nothing trades outside the guardrailed universe. Targets are the
        agent&apos;s hypotheses, not promises; a track record builds as they resolve.
      </p>
    </main>
  );
}
