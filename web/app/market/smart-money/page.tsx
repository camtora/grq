import { prisma } from "@/lib/db";
import { allUniverse } from "@/lib/universe";
import { getSession } from "@/lib/session";
import { fmtWhen } from "@/lib/money";
import { PageHeader, Card, Chip } from "@/components/ui";
import CollapsibleMd from "@/components/CollapsibleMd";
import { SourceChips } from "@/components/IdeaCard";
import Term from "@/components/Term";
import PortfolioCard from "@/components/smart-money/PortfolioCard";
import CongressCard from "@/components/smart-money/CongressCard";
import Leaderboard, { type LeaderRow } from "@/components/smart-money/Leaderboard";
import PanelHeader from "@/components/PanelHeader";
import { fmtUsd, type WatchOverlap } from "@/lib/smart-money/types";
import { queueDossiers } from "@/lib/hunt";
import {
  getPortfolios,
  getCongressLeaderboard,
  getFundsPilingIn,
  getInsiderTopBuys,
  getInsiderClusters,
  getCongressMembers,
  getSmartMoneyFreshness,
} from "@/lib/smart-money/queries";

export const dynamic = "force-dynamic";

// Clean a company name for tight leaderboard rows.
const tidy = (s: string) => s.replace(/\b(INC|CORP|CO|LTD|PLC|LP|LLC|N V|S A|GROUP|THE)\b\.?/gi, "").replace(/\s+/g, " ").trim() || s;

export default async function SmartMoney() {
  const session = await getSession();
  void session?.role; // members vs viewers read the same page; writes live elsewhere

  const [universe, portfolios, congress, funds, insiders, clusters, members, fresh, narrative] = await Promise.all([
    allUniverse(),
    getPortfolios(),
    getCongressLeaderboard(90, 8),
    getFundsPilingIn(8),
    getInsiderTopBuys(14, 10),
    getInsiderClusters(30, 8),
    getCongressMembers(180, 8),
    getSmartMoneyFreshness(),
    prisma.journalEntry.findFirst({ where: { kind: "RESEARCH", title: { startsWith: "Smart money" } }, orderBy: { at: "desc" } }),
  ]);

  // Overlap with our universe — the genuinely-useful tie back to the fund.
  const overlap: Record<string, WatchOverlap> = {};
  for (const u of universe) {
    if (u.status === "ACTIVE") overlap[u.symbol] = "universe";
    else if (u.status === "CANDIDATE") overlap[u.symbol] = "watching";
  }

  // Auto-research the names this page surfaces so every ticker links to a real,
  // researched (or at least "researching…") stock page instead of a 404. Headline
  // leaderboard + cluster names first, then the deeper holdings; capped per render
  // so a busy page can't flood the agent's research queue — it catches up over
  // repeat visits (idempotent). Skip names already in our universe — they have
  // their own research flow. (Cam 2026-06-18)
  const shownSymbols = [
    ...congress.map((c) => c.symbol),
    ...funds.map((f) => f.symbol),
    ...insiders.map((t) => t.symbol),
    ...clusters.map((c) => c.symbol),
    ...portfolios.flatMap((p) => p.topHoldings.map((h) => h.symbol)),
    ...members.flatMap((m) => m.trades.map((t) => t.symbol)),
  ].filter((s) => s && !overlap[s]);
  await queueDossiers(shownSymbols, "smart-money").catch(() => {});

  const congressRows: LeaderRow[] = congress.map((c) => ({
    symbol: c.symbol,
    name: tidy(c.assetName),
    value: c.buyers,
    primary: `${c.buyers} member${c.buyers > 1 ? "s" : ""}`,
    secondary: `${c.trades} trade${c.trades > 1 ? "s" : ""}`,
    overlap: overlap[c.symbol] ?? null,
  }));
  const fundRows: LeaderRow[] = funds.map((f) => ({
    symbol: f.symbol,
    name: tidy(f.name),
    value: f.funds,
    primary: `${f.funds} fund${f.funds > 1 ? "s" : ""}`,
    secondary: fmtUsd(f.totalValueUsd),
    overlap: overlap[f.symbol] ?? null,
  }));
  const insiderRows: LeaderRow[] = insiders.map((t) => ({
    symbol: t.symbol,
    name: t.insiderName.length > 26 ? `${t.insiderName.slice(0, 26)}…` : t.insiderName,
    value: t.valueUsd,
    primary: fmtUsd(t.valueUsd),
    secondary: t.insiderTitle ? t.insiderTitle.split(/[,:]/)[0] : null,
    overlap: overlap[t.symbol] ?? null,
  }));

  const refreshedAt = fresh.congress ?? fresh.insider ?? fresh.portfolio;
  const hasData = portfolios.length > 0 || congressRows.length > 0 || insiderRows.length > 0;

  return (
    <main>
      <PageHeader
        title="Smart Money"
        sub={
          <>
            What notable portfolios are buying — <Term k="congress-trade">Congress</Term>, famous <Term k="13f">funds</Term>, and
            company <Term k="insider">insiders</Term>. Colour and leads, not trade instructions.
            {refreshedAt && <span className="text-teal-200/35"> · updated {fmtWhen(refreshedAt)}</span>}
          </>
        }
      />

      {!hasData && (
        <Card className="p-10 text-center">
          <div className="text-lg font-semibold text-teal-50">No smart-money data yet</div>
          <div className="mx-auto mt-2 max-w-md text-sm text-teal-200/50">
            The agent ingests congress + insider trades daily and fund 13Fs each quarter. Check back after the next run.
          </div>
        </Card>
      )}

      {/* Tracked portfolios — the core: who holds what. Leads the page (Cam). */}
      {(portfolios.length > 0 || members.some((m) => m.trades.length > 0)) && (
        <section className="mb-8">
          <div className="mb-3">
            <PanelHeader right={<span className="text-sm text-teal-200/50">who notable investors hold — tap a card to see the book</span>}>tracked portfolios</PanelHeader>
          </div>
          <div className="grid items-start gap-4 lg:grid-cols-2">
            {portfolios.map((p) => (
              <PortfolioCard key={p.slug} p={p} overlap={overlap} />
            ))}
            {members
              .filter((m) => m.trades.length > 0)
              .map((m) => (
                <CongressCard key={m.person.slug} entry={m} overlap={overlap} />
              ))}
          </div>
        </section>
      )}

      {/* Leaderboards — the "most-bought" superlatives. */}
      {(congressRows.length > 0 || fundRows.length > 0 || insiderRows.length > 0) && (
        <section className="mb-8">
          <div className="grid gap-4 lg:grid-cols-3">
            <Leaderboard
              title="Congress's most-bought"
              blurb={<>Stocks the most members of <Term k="congress-trade">Congress disclosed</Term> buying — last 90 days.</>}
              rows={congressRows}
              empty="No congressional buys in range."
            />
            <Leaderboard
              title="Funds piling in"
              blurb={<>Names the most tracked funds newly bought or added to in their latest <Term k="13f">13F</Term>.</>}
              rows={fundRows}
              empty="No new fund positions yet."
            />
            <Leaderboard
              title={<>Biggest <Term k="insider">insider</Term> buys</>}
              blurb={<>Largest open-market insider purchases (<Term k="form-4">Form 4</Term>) — last 14 days.</>}
              rows={insiderRows}
              empty="No insider buys in range."
            />
          </div>

          {clusters.length > 0 && (
            <Card className="mt-4 p-3">
              <div className="mb-2">
                <PanelHeader>
                  <Term k="cluster-buying">Cluster buys</Term>
                </PanelHeader>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="text-[11px] text-teal-200/35">multiple insiders, one stock (last 30d):</span>
                {clusters.map((c) => (
                  <span key={c.symbol} className="inline-flex items-center gap-1 rounded-full border border-teal-400/15 bg-teal-400/5 px-2 py-0.5 text-[11px]">
                    <span className="font-semibold text-teal-200/80">{c.symbol}</span>
                    <span className="text-teal-200/40">{c.insiders} insiders · {fmtUsd(c.totalValueUsd)}</span>
                  </span>
                ))}
              </div>
            </Card>
          )}
        </section>
      )}

      {/* The agent's read — narrative grounded in the tables above. */}
      {narrative && (
        <Card className="mb-6 p-5">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <Chip tone="dim">GRQ&apos;s read</Chip>
            <span className="text-sm font-medium text-teal-50">{narrative.title}</span>
            <span className="ml-auto text-xs text-teal-200/40">{fmtWhen(narrative.at)}</span>
          </div>
          <CollapsibleMd text={narrative.body}>
            <SourceChips sourcesJson={narrative.sourcesJson} />
          </CollapsibleMd>
        </Card>
      )}

      <p className="mt-4 text-xs text-teal-200/40">
        GRQ surfaces what smart money is doing as one input — it does not copy these trades. Most are US-listed and outside our
        guardrailed CAD universe; where one overlaps a name we track, we flag it.
        {" "}
        <span className="text-teal-200/30">
          Schedule: the congress and insider feeds refresh daily and fund 13Fs whenever a new one is filed (these lag
          ~45 days by law); GRQ&apos;s own written read — the &ldquo;GRQ&apos;s read&rdquo; panel above — is a weekly
          scan, posted early each week on the first market day, around 11:00&nbsp;AM ET.
        </span>
      </p>
    </main>
  );
}
