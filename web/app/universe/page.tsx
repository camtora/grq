import Link from "next/link";
import { prisma } from "@/lib/db";
import { activeUniverse, allUniverse, type UniverseRow } from "@/lib/universe";
import { getQuotes } from "@/lib/broker/quotes";
import { money, pct, fmtWhen } from "@/lib/money";
import { Card, PageHeader, Chip, Pnl } from "@/components/ui";
import { computeSignals, overallSignal, type Signals, type Recommendation } from "@/agent/signals";
import SignalStrip from "@/components/SignalStrip";
import { stanceMeta } from "@/lib/stance";
import RatingBar from "@/components/RatingBar";
import { capTier, CAP_LABEL, type CapTier } from "@/lib/fundamentals";
import { getSession, displayName } from "@/lib/session";
import StockFilters from "@/components/StockFilters";
import MarketTabs from "@/components/MarketTabs";
import UniverseActions from "@/components/UniverseActions";
import Term from "@/components/Term";

export const dynamic = "force-dynamic";

type Row = UniverseRow & {
  lastCents: number | null;
  dayBps: number | null;
  held: { qty: number; avgCostCents: number } | null;
  pinnedBy: string | null;
  blocked: boolean;
  journal: number;
  lastResearchedAt: Date | null;
  mvCents: number;
  upnlCents: number;
  signals: Signals | null;
  rec: Recommendation | null;
  stance: string | null;
};

function StanceCell({ stance, rec }: { stance: string | null; rec: Recommendation | null }) {
  const m = stance ? stanceMeta(stance) : null;
  if (m) return <RatingBar label={m.label} tone={m.tone} pos={m.pos} note="GRQ's call" title={`GRQ's call: ${m.blurb}`} />;
  const sm = rec ? stanceMeta(rec.label) : null;
  if (sm) return <RatingBar label={sm.label} tone={sm.tone} pos={sm.pos} note="technical lean" title="No GRQ call yet — technical signal only (an input, not a verdict)" />;
  return <span className="text-xs text-teal-200/25">— no read yet</span>;
}

function sortActive(rows: Row[]): Row[] {
  return rows.sort((a, b) => {
    if (!!a.held !== !!b.held) return a.held ? -1 : 1;
    if (a.held && b.held) return b.mvCents - a.mvCents;
    if (!!a.pinnedBy !== !!b.pinnedBy) return a.pinnedBy ? -1 : 1;
    return a.symbol.localeCompare(b.symbol);
  });
}

function UniverseTable({ rows, isMember, currentUser }: { rows: Row[]; isMember: boolean; currentUser: string }) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-teal-200/40">
            <th className="px-4 py-3">Symbol</th>
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">Tier</th>
            <th className="px-4 py-3 text-right">Last</th>
            <th className="px-4 py-3 text-right">Day</th>
            <th className="px-4 py-3">Signals</th>
            <th className="px-4 py-3">GRQ&apos;s call</th>
            <th className="px-4 py-3 text-right">Position</th>
            <th className="px-4 py-3 text-right">Unrealized</th>
            <th className="px-4 py-3 text-right">Journal</th>
            <th className="px-4 py-3 text-right">Researched</th>
            {isMember && <th className="px-4 py-3 text-right">Manage</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.symbol}
              className={`stock-row border-t border-teal-400/10 ${r.held ? "bg-teal-400/[0.05]" : ""}`}
              data-country={r.country ?? ""}
              data-exchange={r.exchange ?? ""}
              data-sector={r.sector ?? ""}
              data-cap={capTier(r.marketCapM) ?? ""}
            >
              <td className="px-4 py-2.5">
                <Link href={`/stocks/${r.symbol}`} className="font-semibold text-teal-300 hover:underline">
                  {r.symbol}
                </Link>
                {r.pinnedBy && (
                  <span
                    className="ml-2 inline-flex h-4 w-4 items-center justify-center rounded-full bg-teal-400/20 align-middle text-[9px] font-black text-teal-200"
                    title={`Priority — pinned by ${r.pinnedBy}`}
                  >
                    {r.pinnedBy.charAt(0)}
                  </span>
                )}
                {r.blocked && <span className="ml-1 align-middle" title="No-fly: the agent may not buy this">🚫</span>}
              </td>
              <td className="px-4 py-2.5 text-teal-100/70">{r.name}</td>
              <td className="px-4 py-2.5">
                <Chip tone="dim">{r.tier ?? "—"}</Chip>
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-teal-100/80">
                {r.lastCents !== null ? money(r.lastCents) : "—"}
              </td>
              <td
                className={`px-4 py-2.5 text-right tabular-nums ${
                  (r.dayBps ?? 0) > 0 ? "text-emerald-400" : (r.dayBps ?? 0) < 0 ? "text-red-400" : "text-teal-200/50"
                }`}
              >
                {r.dayBps !== null ? pct(r.dayBps / 10_000, 2) : "—"}
              </td>
              <td className="px-4 py-2.5">
                <SignalStrip signals={r.signals} />
              </td>
              <td className="px-4 py-2.5">
                <StanceCell stance={r.stance} rec={r.rec} />
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-teal-50">
                {r.held ? `${r.held.qty} sh · ${money(r.mvCents)}` : ""}
              </td>
              <td className="px-4 py-2.5 text-right">{r.held ? <Pnl cents={r.upnlCents} className="text-sm" /> : ""}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-teal-200/50">{r.journal > 0 ? r.journal : ""}</td>
              <td className="px-4 py-2.5 text-right text-xs tabular-nums text-teal-200/40" title="Last completed research">
                {r.lastResearchedAt ? fmtWhen(r.lastResearchedAt) : "—"}
              </td>
              {isMember && (
                <td className="px-4 py-2.5 text-right">
                  <UniverseActions symbol={r.symbol} status="ACTIVE" pendingBy={null} proposedTier={null} currentUser={currentUser} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export default async function Universe() {
  const [session, active, positions, directives, journalCounts] = await Promise.all([
    getSession(),
    activeUniverse(),
    prisma.position.findMany(),
    prisma.symbolDirective.findMany(),
    prisma.journalEntry.groupBy({ by: ["symbol"], _count: { id: true }, where: { symbol: { not: null } } }),
  ]);
  const me = displayName(session);
  const isMember = session?.role === "member";

  // Demoted shelf — CANDIDATEs that were pulled out of the universe (they carry a
  // demote journal). Shown below the active table for reference; they're back on
  // the watchlist and the agent won't buy them (Cam 2026-06-16).
  const [allRows, demoteJournals] = await Promise.all([
    allUniverse(),
    prisma.journalEntry.findMany({
      where: { kind: "SYSTEM", title: { contains: "demoted" } },
      orderBy: { at: "desc" },
      select: { symbol: true, title: true, at: true },
    }),
  ]);
  const demotedBy = new Map<string, { at: Date; by: string }>();
  for (const j of demoteJournals) {
    if (j.symbol && !demotedBy.has(j.symbol)) demotedBy.set(j.symbol, { at: j.at, by: j.title.split(" demoted ")[0] ?? "" });
  }
  const demoted = allRows.filter((u) => u.status === "CANDIDATE" && demotedBy.has(u.symbol));

  const allSyms = [...active.map((u) => u.symbol), ...demoted.map((u) => u.symbol)];
  const quotes = await getQuotes(allSyms);

  const stanceRows = await prisma.journalEntry.findMany({
    where: { stance: { not: null }, symbol: { not: null } },
    orderBy: { at: "desc" },
    select: { symbol: true, stance: true },
  });
  const stanceBy = new Map<string, string>();
  for (const s of stanceRows) if (s.symbol && !stanceBy.has(s.symbol)) stanceBy.set(s.symbol, s.stance as string);

  const signalsList = await Promise.all(allSyms.map((s) => computeSignals(s).catch(() => null)));
  const sigBy = new Map(allSyms.map((s, i) => [s, signalsList[i]] as const));

  const posBy = new Map(positions.map((p) => [p.symbol, p]));
  const dirBy = new Map(directives.map((d) => [d.symbol, d]));
  const jcBy = new Map(journalCounts.map((j) => [j.symbol as string, j._count.id]));

  // When each name was last researched (latest completed research request) — shown
  // for reference next to the "research now" control.
  const researchedAgg = await prisma.researchRequest.groupBy({
    by: ["symbol"],
    where: { status: "DONE", completedAt: { not: null } },
    _max: { completedAt: true },
  });
  const researchedBy = new Map(researchedAgg.map((r) => [r.symbol, r._max.completedAt]));

  const toRow = (u: UniverseRow): Row => {
    const q = quotes.get(u.symbol);
    const p = posBy.get(u.symbol);
    const d = dirBy.get(u.symbol);
    const sig = sigBy.get(u.symbol) ?? null;
    return {
      ...u,
      lastCents: q?.midCents ?? null,
      dayBps: q?.dayChangeBps ?? null,
      held: p ? { qty: p.qty, avgCostCents: p.avgCostCents } : null,
      pinnedBy: d?.directive === "PINNED" ? d.by : null,
      blocked: d?.directive === "BLOCKED",
      journal: jcBy.get(u.symbol) ?? 0,
      lastResearchedAt: researchedBy.get(u.symbol) ?? null,
      mvCents: p && q ? p.qty * q.midCents : 0,
      upnlCents: p && q ? p.qty * (q.midCents - p.avgCostCents) : 0,
      signals: sig,
      rec: sig ? overallSignal(sig) : null,
      stance: stanceBy.get(u.symbol) ?? null,
    };
  };

  const activeRows = sortActive(active.map(toRow));

  const heldCount = activeRows.filter((r) => r.held).length;
  const investedCents = activeRows.reduce((s, r) => s + r.mvCents, 0);

  // Filter options from whatever fundamentals are populated so far.
  const COUNTRY_LABEL: Record<string, string> = { CA: "Canada", US: "United States" };
  const distinct = (vals: (string | null)[]) => [...new Set(vals.filter((v): v is string => !!v))].sort();
  const countryOpts = distinct(activeRows.map((r) => r.country)).map((v) => ({ value: v, label: COUNTRY_LABEL[v] ?? v }));
  const exchangeOpts = distinct(activeRows.map((r) => r.exchange)).map((v) => ({ value: v, label: v }));
  const sectorOpts = distinct(activeRows.map((r) => r.sector)).map((v) => ({ value: v, label: v }));
  const capPresent = new Set(activeRows.map((r) => capTier(r.marketCapM)).filter((c): c is CapTier => !!c));
  const capOrder: CapTier[] = ["mega", "large", "mid", "small", "micro"];
  const capOpts = capOrder.filter((c) => capPresent.has(c)).map((c) => ({ value: c, label: CAP_LABEL[c] }));

  return (
    <main>
      <PageHeader
        title="Universe"
        sub="The names GRQ can invest in. New names start on the watchlist (Market ▸ Watchlist) and get promoted in."
        right={
          <Link href="/market/watchlist">
            <Chip tone="teal">watchlist →</Chip>
          </Link>
        }
      />
      <MarketTabs />

      <section>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-teal-300/70">
            <Term k="universe">The universe</Term> — {active.length} investable
          </h2>
          <p className="text-xs text-teal-200/40">
            What the agent is allowed to buy. {heldCount > 0 ? `You hold ${heldCount} · ${money(investedCents)} invested.` : "No positions yet."}
          </p>
        </div>
        <StockFilters countries={countryOpts} exchanges={exchangeOpts} sectors={sectorOpts} caps={capOpts} />
        <UniverseTable rows={activeRows} isMember={isMember} currentUser={me} />
      </section>

      {demoted.length > 0 && (
        <section className="mt-8 border-t border-teal-400/10 pt-6">
          <h2 className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-teal-300/70">Demoted ({demoted.length})</h2>
          <p className="mb-3 text-xs text-teal-200/40">
            Pulled out of the universe — back on the watchlist, the agent won&apos;t buy them. Re-promote or retire below.
          </p>
          <div className="space-y-2">
            {demoted.map((u) => {
              const q = quotes.get(u.symbol);
              const info = demotedBy.get(u.symbol);
              return (
                <Card key={u.symbol} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
                  <Link href={`/stocks/${u.symbol}`} className="font-semibold text-teal-300 hover:underline">
                    {u.symbol}
                  </Link>
                  <span className="text-sm text-teal-200/60">{u.name}</span>
                  {q && <span className="text-sm tabular-nums text-teal-100/70">{money(q.midCents, u.currency)}</span>}
                  {info && (
                    <span className="text-xs text-teal-200/40">
                      demoted{info.by ? ` by ${info.by}` : ""} · {fmtWhen(info.at)}
                    </span>
                  )}
                  {isMember && (
                    <div className="ml-auto">
                      <UniverseActions symbol={u.symbol} status="CANDIDATE" pendingBy={u.promotionRequestedBy} proposedTier={u.proposedTier} currentUser={me} />
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </section>
      )}

      <p className="mt-6 text-xs text-teal-200/40">
        <span className="font-semibold text-teal-200/60">Signals</span> (hover for detail):{" "}
        <span className="font-semibold text-teal-200/60">T</span> trend ·{" "}
        <span className="font-semibold text-teal-200/60">R</span> rsi ·{" "}
        <span className="font-semibold text-teal-200/60">M</span> macd ·{" "}
        <span className="font-semibold text-teal-200/60">V</span> volatility — green BUY · red SELL · dim HOLD.{" "}
        These are <span className="font-semibold text-teal-200/60">inputs</span>, not the verdict.{" "}
        <span className="font-semibold text-teal-200/60">GRQ&apos;s call</span> is the rating — its own judgment from its latest dossier.{" "}
        quotes delayed ~15 min · the risk dial gates which tiers the agent may buy.
      </p>
    </main>
  );
}
