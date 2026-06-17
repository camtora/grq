import { prisma } from "@/lib/db";
import { allUniverse } from "@/lib/universe";
import { getQuotes } from "@/lib/broker/quotes";
import { getSession } from "@/lib/session";
import { computeSignals, overallSignal } from "@/agent/signals";
import { PageHeader, Chip } from "@/components/ui";
import { type WatchState } from "@/components/WatchButton";
import RefreshHuntButton from "@/components/RefreshHuntButton";
import DismissButton from "@/components/DismissButton";
import IdeaCard, { type Idea } from "@/components/IdeaCard";

export const dynamic = "force-dynamic";

// Household names get deprioritised — "stocks you should look at" should lead
// with names you do not already know (candidates / mid-caps over the big banks).
const HOUSEHOLD = new Set(["RY", "TD", "BNS", "BMO", "CM", "NA", "ENB", "SHOP", "CNR", "CP", "BCE", "T", "SU", "CNQ", "XIC", "XIU", "BN", "ATD", "CSU"]);

export default async function Market() {
  const session = await getSession();
  const isMember = session?.role === "member";

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
    const tier = u?.tier ?? null;
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
      obscurity: HOUSEHOLD.has(sym) ? 3 : tier === "etf" || tier === "large" ? 2 : tier === "mid" ? 1 : 0,
      watch: watchOf(sym),
    };
  };
  const huntIdeas: Idea[] = await Promise.all(huntFinds.map(toIdea));

  return (
    <main>
      <PageHeader
        title="Discover"
        sub="The agent's hunt for under-the-radar names — earlier-stage leads, often before a price target. (Smart money moved to its own page.)"
      />

      {huntIdeas.length > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Chip tone="teal">the hunt</Chip>
            <span className="text-sm text-teal-200/50">under-the-radar names the agent flagged — earlier-stage finds, often before a price target</span>
            {isMember && (
              <span className="ml-auto">
                <RefreshHuntButton />
              </span>
            )}
          </div>
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
          <p className="mt-2 text-[11px] text-teal-200/40">Proposals only — the agent can&apos;t add these itself. Watch the ones you like, or dismiss the ones you don&apos;t.</p>
        </section>
      )}

      <p className="mt-4 text-xs text-teal-200/40">
        The agent surfaces ideas; it does not auto-trade anything outside the guardrailed universe. Targets are the agent&apos;s
        hypotheses, not promises — a track record builds as they resolve.
      </p>
    </main>
  );
}
