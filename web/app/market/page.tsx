import { prisma } from "@/lib/db";
import { allUniverse } from "@/lib/universe";
import { getQuotes } from "@/lib/broker/quotes";
import { getCloses, refreshBars } from "@/lib/bars";
import { getSession } from "@/lib/session";
import { computeHeat } from "@/lib/heat";
import { fmpLogo } from "@/lib/logos";
import { PageHeader } from "@/components/ui";
import { type WatchState } from "@/components/WatchButton";
import HuntBar from "@/components/HuntBar";
import HuntStatus from "@/components/hunt/HuntStatus";
import HuntResults from "@/components/hunt/HuntResults";
import { type HuntFind } from "@/components/hunt/HuntRow";

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

  // The hunt feed = the most recent symbol-tagged "Hunt dossier" entries (one per name).
  const huntRaw = await prisma.journalEntry.findMany({
    where: { kind: "RESEARCH", title: { startsWith: "Hunt dossier" }, symbol: { not: null } },
    orderBy: { at: "desc" },
    take: 24,
  });
  const seen = new Set<string>();
  const dossiers = huntRaw
    .filter((d) => {
      if (!d.symbol || seen.has(d.symbol)) return false;
      seen.add(d.symbol);
      return true;
    })
    .slice(0, 12);
  const symbols = dossiers.map((d) => d.symbol as string);

  // Price + 30-day closes for the data-viz. Quotes live-fetch on a miss; daily bars exist
  // only for tracked names, so backfill any find with too little history once (then cached).
  const quotes = await getQuotes(symbols);
  const closesBySym = new Map<string, { date: Date; closeCents: number }[]>();
  await Promise.all(symbols.map(async (s) => closesBySym.set(s, await getCloses(s, 40))));
  const missing = symbols.filter((s) => (closesBySym.get(s)?.length ?? 0) < 8);
  if (missing.length) {
    await refreshBars(missing, "3mo").catch(() => 0);
    await Promise.all(missing.map(async (s) => closesBySym.set(s, await getCloses(s, 40))));
  }

  const finds: HuntFind[] = dossiers.map((d) => {
    const sym = d.symbol as string;
    const u = uBy.get(sym);
    const q = quotes.get(sym);
    const spark = (closesBySym.get(sym) ?? []).slice(-30).map((c) => c.closeCents);
    const change30d =
      spark.length >= 2 && spark[0] > 0
        ? (spark[spark.length - 1] - spark[0]) / spark[0]
        : q
          ? (q.dayChangeBps ?? 0) / 10_000
          : null;
    return {
      sym,
      name: u?.name ?? sym,
      // Real company logo: the tracked entry's resolved logo if we have one, else FMP's
      // ticker-keyed image (monogram fallback handled in <StockLogo> on a 404).
      logoUrl: u?.logoUrl || fmpLogo(sym),
      currency: u?.currency ?? null,
      cur: q?.midCents ?? null,
      change30d,
      tag: [u?.exchange, u?.sector].filter(Boolean).join(" · ") || null,
      spark,
      heat: computeHeat({ confidence: d.confidence, change30d, obscurity: d.obscurity }),
      confidence: d.confidence,
      obscurity: d.obscurity ?? null,
      rank: 0,
      watch: watchOf(sym),
      body: d.body,
    };
  });

  // Heat ranks the board (the design's organizing metric); the dossiers were already
  // newest-first, so this stays a stable newest-first tiebreak within equal heat.
  finds.sort((a, b) => b.heat - a.heat);
  finds.forEach((f, i) => (f.rank = i + 1));

  const latestFindAt = dossiers[0]?.at?.toISOString() ?? null;
  const pendingHunt = state?.huntRequestedAt != null;

  return (
    <main>
      <PageHeader
        title="The Hunt"
        sub="The agent's search for under-the-radar names — earlier-stage leads, ranked by heat (how ready to pop). Proposals only: watch the ones you like, dismiss the ones you don't."
      />

      {isMember && <HuntBar />}

      {state?.huntBrief && (
        <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] px-3.5 py-2.5 text-sm">
          <span className="h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_10px_2px] shadow-amber-400/60" aria-hidden />
          <span className="text-teal-100/80">
            Directed hunt: <b className="text-teal-50">{state.huntBrief}</b>
          </span>
          <span className="text-xs text-teal-200/40">— focused results below; hit ↻ refresh to go broad again.</span>
        </div>
      )}

      <HuntStatus pending={pendingHunt} brief={state?.huntBrief ?? null} latestFindAt={latestFindAt} hasResults={finds.length > 0}>
        {finds.length > 0 ? (
          <HuntResults finds={finds} isMember={isMember} />
        ) : (
          <p className="rounded-2xl border border-[color:var(--card-border)] bg-[var(--card-bg)] px-5 py-8 text-center text-sm text-teal-200/50">
            No hunt finds yet.{" "}
            {isMember ? "Brief the hunt above, or hit ↻ refresh to send GRQ looking." : "Check back soon — GRQ hunts each market morning."}
          </p>
        )}
      </HuntStatus>

      <p className="mt-6 text-xs text-teal-200/40">
        The agent can&apos;t add or trade these itself — nothing trades outside the guardrailed universe. Heat is GRQ&apos;s derived
        &ldquo;ready to pop&rdquo; read (conviction + recent momentum + how under-the-radar a name is), not a promise; a track record
        builds as the calls resolve.
      </p>
    </main>
  );
}
