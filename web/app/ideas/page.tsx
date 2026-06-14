import Link from "next/link";
import { prisma } from "@/lib/db";
import { allUniverse } from "@/lib/universe";
import { getQuotes } from "@/lib/broker/quotes";
import { computeSignals, overallSignal, type Recommendation } from "@/agent/signals";
import { money, pct, signedMoney, fmtWhen } from "@/lib/money";
import { Card, PageHeader, EmptyState, Chip } from "@/components/ui";
import StockLogo from "@/components/StockLogo";
import RatingDial from "@/components/RatingDial";
import CollapsibleMd from "@/components/CollapsibleMd";

// Household names get deprioritised — "stocks you should look at" should lead
// with names you do not already know (candidates / mid-caps over the big banks).
const HOUSEHOLD = new Set(["RY", "TD", "BNS", "BMO", "CM", "NA", "ENB", "SHOP", "CNR", "CP", "BCE", "T", "SU", "CNQ", "XIC", "XIU", "BN", "ATD", "CSU"]);

function SourceChips({ sourcesJson }: { sourcesJson: string | null }) {
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

type Idea = {
  sym: string;
  name: string;
  logoUrl: string | null;
  cur: number | null;
  near: number | null;
  far: number | null;
  nearDays: number | null;
  confidence: number | null;
  rec: Recommendation | null;
  body: string;
  sourcesJson: string | null;
  obscurity: number;
};

function IdeaCard({ idea }: { idea: Idea }) {
  return (
    <Card className="p-5">
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="flex items-center gap-3">
            <StockLogo symbol={idea.sym} logoUrl={idea.logoUrl} className="h-10 w-10 text-xs" />
            <div className="min-w-0">
              <Link href={`/stocks/${idea.sym}`} className="text-lg font-bold text-teal-200 hover:underline">
                {idea.sym}
              </Link>
              <div className="truncate text-sm text-teal-200/50">{idea.name}</div>
            </div>
            {idea.far !== null && (
              <div className="ml-auto shrink-0 text-right">
                <div className={`text-2xl font-black tabular-nums ${idea.far > 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {idea.far > 0 ? "+" : ""}
                  {pct(idea.far, 0)}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-teal-200/40">12-mo upside</div>
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-teal-200/60">
            {idea.cur !== null && <span>now {money(idea.cur)}</span>}
            {idea.near !== null && (
              <span>
                near{idea.nearDays ? ` ~${Math.max(1, Math.round(idea.nearDays / 5))}w` : ""}{" "}
                <b className={idea.near > 0 ? "text-emerald-400" : "text-red-400"}>
                  {idea.near > 0 ? "+" : ""}
                  {pct(idea.near, 0)}
                </b>
              </span>
            )}
            {idea.far !== null && <span>≈ {signedMoney(Math.round(idea.far * 100_000))} on $1k</span>}
            {idea.confidence != null && <span>conf {idea.confidence}%</span>}
          </div>

          <div className="mt-3">
            <CollapsibleMd text={idea.body} threshold={280}>
              <SourceChips sourcesJson={idea.sourcesJson} />
            </CollapsibleMd>
          </div>
        </div>

        <div className="lg:border-l lg:border-teal-400/10 lg:pl-5">
          {idea.rec ? (
            <RatingDial rec={idea.rec} />
          ) : (
            <p className="text-sm text-teal-200/40">No signal read yet.</p>
          )}
          <Link href={`/stocks/${idea.sym}`} className="mt-4 inline-block text-xs text-teal-300 hover:underline">
            full dossier →
          </Link>
        </div>
      </div>
    </Card>
  );
}

export default async function Ideas() {
  const dossiers = await prisma.journalEntry.findMany({
    where: {
      kind: "RESEARCH",
      title: { startsWith: "Dossier" },
      symbol: { not: null },
      OR: [{ targetNearCents: { not: null } }, { targetFarCents: { not: null } }],
    },
    orderBy: { at: "desc" },
    take: 80,
  });

  // Latest dossier-with-a-target per symbol.
  const seen = new Set<string>();
  const latest = dossiers.filter((d) => {
    if (!d.symbol || seen.has(d.symbol)) return false;
    seen.add(d.symbol);
    return true;
  });

  const universe = await allUniverse();
  const uBy = new Map(universe.map((u) => [u.symbol, u]));
  const quotes = await getQuotes(latest.map((d) => d.symbol as string));

  const ideas: Idea[] = await Promise.all(
    latest.map(async (d) => {
      const sym = d.symbol as string;
      const u = uBy.get(sym);
      const cur = quotes.get(sym)?.midCents ?? null;
      const sig = await computeSignals(sym).catch(() => null);
      const tier = u?.tier ?? null;
      return {
        sym,
        name: u?.name ?? sym,
        logoUrl: u?.logoUrl ?? null,
        cur,
        near: cur && d.targetNearCents != null ? (d.targetNearCents - cur) / cur : null,
        far: cur && d.targetFarCents != null ? (d.targetFarCents - cur) / cur : null,
        nearDays: d.targetNearDays ?? null,
        confidence: d.confidence,
        rec: sig ? overallSignal(sig) : null,
        body: d.body,
        sourcesJson: d.sourcesJson,
        obscurity: HOUSEHOLD.has(sym) ? 3 : tier === "etf" || tier === "large" ? 2 : tier === "mid" ? 1 : 0,
      };
    }),
  );
  ideas.sort((a, b) => a.obscurity - b.obscurity || (b.far ?? -9) - (a.far ?? -9));

  const hunt = await prisma.journalEntry.findFirst({
    where: { kind: "RESEARCH", title: { startsWith: "Hunt —" } },
    orderBy: { at: "desc" },
  });

  return (
    <main>
      <PageHeader
        title="Stocks you should look at"
        sub="Under-the-radar names the agent has researched, ranked by expected upside — unfamiliar names first."
      />

      {hunt && (
        <Card className="mb-6 border-teal-400/30 p-5">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <Chip tone="teal">the hunt</Chip>
            <span className="text-sm font-medium text-teal-50">{hunt.title}</span>
            <span className="ml-auto text-xs text-teal-200/40">{fmtWhen(hunt.at)}</span>
          </div>
          <CollapsibleMd text={hunt.body}>
            <SourceChips sourcesJson={hunt.sourcesJson} />
          </CollapsibleMd>
          <p className="mt-2 text-[11px] text-teal-200/40">
            The agent proposes these — add the promising ones as research candidates on the Research tab.
          </p>
        </Card>
      )}

      {ideas.length === 0 ? (
        <EmptyState
          title="No ideas with targets yet"
          body="Ideas appear here once the agent files dossiers with price targets — it's re-running them now. Add a name on the Research tab to point it somewhere specific."
        />
      ) : (
        <div className="space-y-4">
          {ideas.map((idea) => (
            <IdeaCard key={idea.sym} idea={idea} />
          ))}
        </div>
      )}

      <p className="mt-4 text-xs text-teal-200/40">
        The agent surfaces ideas; it does not auto-trade anything outside the guardrailed universe. Targets are the
        agent's hypotheses, not promises — a track record builds as they resolve. Hunting further down-cap
        (small-cap / high-growth) is a planned expansion of the research scope.
      </p>
    </main>
  );
}
