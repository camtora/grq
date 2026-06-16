import Link from "next/link";
import { prisma } from "@/lib/db";
import { allUniverse } from "@/lib/universe";
import { getQuotes } from "@/lib/broker/quotes";
import { getSession } from "@/lib/session";
import { computeSignals, overallSignal, type Recommendation } from "@/agent/signals";
import { money, pct, signedMoney, fmtWhen } from "@/lib/money";
import { Card, PageHeader, EmptyState, Chip } from "@/components/ui";
import StockLogo from "@/components/StockLogo";
import { stanceMeta, STANCE_TONE_CLASSES } from "@/lib/stance";
import CollapsibleMd from "@/components/CollapsibleMd";
import Term from "@/components/Term";
import MarketTabs from "@/components/MarketTabs";
import WatchButton, { type WatchState } from "@/components/WatchButton";
import { fmpEnabled, fmpNews } from "@/lib/fmp";

export const dynamic = "force-dynamic";

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
  stance: string | null;
  body: string;
  sourcesJson: string | null;
  obscurity: number;
  watch: WatchState;
};

function IdeaCard({ idea, isMember }: { idea: Idea; isMember: boolean }) {
  const sm = stanceMeta(idea.stance);
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
                <div className="text-[10px] uppercase tracking-wider text-teal-200/40">
                  <Term k="expected-return" align="right">12-mo upside</Term>
                </div>
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
            {idea.confidence != null && (
              <span>
                <Term k="confidence">conf</Term> {idea.confidence}%
              </span>
            )}
          </div>

          <div className="mt-3">
            <CollapsibleMd text={idea.body} threshold={280}>
              <SourceChips sourcesJson={idea.sourcesJson} />
            </CollapsibleMd>
          </div>
        </div>

        <div className="lg:border-l lg:border-teal-400/10 lg:pl-5">
          <div className="text-[10px] uppercase tracking-wider text-teal-200/50">
            <Term k="agent-call">The agent&apos;s call</Term>
          </div>
          {sm ? (
            <div className="mt-1">
              <span className={`text-2xl font-black ${STANCE_TONE_CLASSES[sm.tone].text}`}>{sm.label}</span>
              <p className="mt-1 text-xs text-teal-200/50">{sm.blurb}</p>
            </div>
          ) : (
            <p className="mt-1 text-sm text-teal-200/40">Not yet rated by the agent.</p>
          )}
          {idea.rec && <p className="mt-3 text-[11px] text-teal-200/40">technicals lean {idea.rec.label} — an input, not the call</p>}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link href={`/stocks/${idea.sym}`} className="text-xs text-teal-300 hover:underline">
              full dossier →
            </Link>
            {isMember && idea.watch === "universe" ? (
              <span className="text-[11px] font-semibold text-emerald-300/70">✓ in your universe</span>
            ) : isMember ? (
              <WatchButton symbol={idea.sym} state={idea.watch} />
            ) : null}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default async function Market() {
  const session = await getSession();
  const isMember = session?.role === "member";

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

  const seen = new Set<string>();
  const latest = dossiers.filter((d) => {
    if (!d.symbol || seen.has(d.symbol)) return false;
    seen.add(d.symbol);
    return true;
  });

  const universe = await allUniverse();
  const uBy = new Map(universe.map((u) => [u.symbol, u]));
  const statusBy = new Map(universe.map((u) => [u.symbol, u.status]));
  const watchOf = (sym: string): WatchState => {
    const s = statusBy.get(sym);
    return s === "ACTIVE" ? "universe" : s === "CANDIDATE" ? "watching" : "none";
  };

  const [huntRaw, smartMoney, news] = await Promise.all([
    prisma.journalEntry.findMany({
      where: { kind: "RESEARCH", title: { startsWith: "Hunt dossier" }, symbol: { not: null } },
      orderBy: { at: "desc" },
      take: 16,
    }),
    prisma.journalEntry.findFirst({ where: { kind: "RESEARCH", title: { startsWith: "Smart money" } }, orderBy: { at: "desc" } }),
    fmpEnabled() ? fmpNews(8).catch(() => []) : Promise.resolve([]),
  ]);
  const huntSeen = new Set<string>();
  const huntFinds = huntRaw
    .filter((d) => {
      if (!d.symbol || huntSeen.has(d.symbol)) return false;
      huntSeen.add(d.symbol);
      return true;
    })
    .slice(0, 8);

  // The hunt and the targeted ideas render through the SAME IdeaCard — one visual
  // language for "a name to look at"; the targeted ones just have more filled in
  // (price targets, the agent's call). Smart money is a roundup, styled apart.
  const quotes = await getQuotes([...latest, ...huntFinds].map((d) => d.symbol as string));
  const toIdea = async (d: (typeof latest)[number]): Promise<Idea> => {
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
      stance: d.stance,
      body: d.body,
      sourcesJson: d.sourcesJson,
      obscurity: HOUSEHOLD.has(sym) ? 3 : tier === "etf" || tier === "large" ? 2 : tier === "mid" ? 1 : 0,
      watch: watchOf(sym),
    };
  };
  const ideas: Idea[] = (await Promise.all(latest.map(toIdea))).sort(
    (a, b) => a.obscurity - b.obscurity || (b.far ?? -9) - (a.far ?? -9),
  );
  const huntIdeas: Idea[] = await Promise.all(huntFinds.map(toIdea));

  return (
    <main>
      <PageHeader title="Market" sub="Discover names beyond GRQ's universe — the agent's ideas, the whole-market screener, and your research desk." />
      <MarketTabs />

      {smartMoney && (
        <Card className="mb-8 p-5">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <Chip tone="dim">smart money</Chip>
            <span className="text-sm font-medium text-teal-50">{smartMoney.title}</span>
            <span className="ml-auto text-xs text-teal-200/40">{fmtWhen(smartMoney.at)}</span>
          </div>
          <CollapsibleMd text={smartMoney.body}>
            <SourceChips sourcesJson={smartMoney.sourcesJson} />
          </CollapsibleMd>
          <p className="mt-2 text-[11px] text-teal-200/40">What notable public portfolios (congress, funds, insiders) are buying — colour, not gospel; disclosures lag.</p>
        </Card>
      )}

      {huntIdeas.length > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Chip tone="teal">the hunt</Chip>
            <span className="text-sm text-teal-200/50">under-the-radar names the agent flagged — earlier-stage finds, often before a price target</span>
          </div>
          <div className="space-y-4">
            {huntIdeas.map((idea) => (
              <IdeaCard key={idea.sym} idea={idea} isMember={isMember} />
            ))}
          </div>
          <p className="mt-2 text-[11px] text-teal-200/40">Proposals only — the agent can&apos;t add these itself. Watch the ones you like to put them on your watchlist.</p>
        </section>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Chip tone="teal">researched ideas</Chip>
        <span className="text-sm text-teal-200/50">names the agent has dossiered with price targets — ranked by expected upside, unfamiliar names first</span>
      </div>
      {ideas.length === 0 ? (
        <EmptyState
          title="No ideas with targets yet"
          body="Ideas appear here once the agent files dossiers with price targets. Watch a name on Browse to point it somewhere specific."
        />
      ) : (
        <div className="space-y-4">
          {ideas.map((idea) => (
            <IdeaCard key={idea.sym} idea={idea} isMember={isMember} />
          ))}
        </div>
      )}

      {news.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-teal-300/70">Market pulse</h2>
          <Card className="divide-y divide-[color:var(--card-border)]">
            {news.map((n, i) => {
              const inner = (
                <>
                  <span className="min-w-0 flex-1 text-sm text-teal-100/80">{n.title}</span>
                  <span className="shrink-0 text-[11px] text-teal-200/40">{n.publisher}</span>
                  <span className="shrink-0 text-[11px] text-teal-200/30">{n.at.slice(0, 10)}</span>
                </>
              );
              return n.url ? (
                <a key={i} href={n.url} target="_blank" rel="noreferrer" className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2.5 hover:bg-teal-400/[0.04]">
                  {inner}
                </a>
              ) : (
                <div key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2.5">
                  {inner}
                </div>
              );
            })}
          </Card>
          <p className="mt-2 text-[11px] text-teal-200/40">Latest market headlines via FMP — context, not signals.</p>
        </section>
      )}

      <p className="mt-4 text-xs text-teal-200/40">
        The agent surfaces ideas; it does not auto-trade anything outside the guardrailed universe. Targets are the agent&apos;s
        hypotheses, not promises — a track record builds as they resolve.
      </p>
    </main>
  );
}
