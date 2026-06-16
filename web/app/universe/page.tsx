import Link from "next/link";
import { prisma } from "@/lib/db";
import { activeUniverse, allUniverse, type UniverseRow } from "@/lib/universe";
import { getQuotes } from "@/lib/broker/quotes";
import { money, pct, fmtDay } from "@/lib/money";
import { Card, PageHeader, Chip, Pnl, EmptyState } from "@/components/ui";
import { computeSignals, overallSignal, type Signals, type Recommendation } from "@/agent/signals";
import SignalStrip from "@/components/SignalStrip";
import { stanceMeta, STANCE_TONE_CLASSES } from "@/lib/stance";
import { capTier, CAP_LABEL, type CapTier } from "@/lib/fundamentals";
import StockFilters from "@/components/StockFilters";
import AddTicker from "@/components/AddTicker";
import UniverseActions from "@/components/UniverseActions";
import { getSession, displayName } from "@/lib/session";
import Term from "@/components/Term";

export const dynamic = "force-dynamic";

type Row = UniverseRow & {
  lastCents: number | null;
  dayBps: number | null;
  held: { qty: number; avgCostCents: number } | null;
  pinnedBy: string | null;
  blocked: boolean;
  journal: number;
  mvCents: number;
  upnlCents: number;
  signals: Signals | null;
  rec: Recommendation | null;
  stance: string | null;
};

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
      <span className="text-xs text-teal-200/40" title="No agent call yet — technical lean only (an input, not a verdict)">
        {rec.label} <span className="text-[9px] text-teal-200/30">tech</span>
      </span>
    );
  }
  return <span className="text-xs text-teal-200/25">—</span>;
}

function sortActive(rows: Row[]): Row[] {
  return rows.sort((a, b) => {
    if (!!a.held !== !!b.held) return a.held ? -1 : 1;
    if (a.held && b.held) return b.mvCents - a.mvCents;
    if (!!a.pinnedBy !== !!b.pinnedBy) return a.pinnedBy ? -1 : 1;
    return a.symbol.localeCompare(b.symbol);
  });
}

function UniverseTable({ rows }: { rows: Row[] }) {
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
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export default async function Universe() {
  const [active, allRows, positions, directives, journalCounts, session] = await Promise.all([
    activeUniverse(),
    allUniverse(),
    prisma.position.findMany(),
    prisma.symbolDirective.findMany(),
    prisma.journalEntry.groupBy({ by: ["symbol"], _count: { id: true }, where: { symbol: { not: null } } }),
    getSession(),
  ]);
  const isMember = session?.role === "member";
  const me = displayName(session);
  const candidates = allRows.filter((u) => u.status === "CANDIDATE");

  const allSyms = [...active, ...candidates].map((u) => u.symbol);
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
      mvCents: p && q ? p.qty * q.midCents : 0,
      upnlCents: p && q ? p.qty * (q.midCents - p.avgCostCents) : 0,
      signals: sig,
      rec: sig ? overallSignal(sig) : null,
      stance: stanceBy.get(u.symbol) ?? null,
    };
  };

  const activeRows = sortActive(active.map(toRow));
  const candidateRows = candidates.map(toRow).sort((a, b) => (a.pinnedBy ? -1 : b.pinnedBy ? 1 : a.symbol.localeCompare(b.symbol)));

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
        sub="Everything that's ours — the names the agent can invest in, and the watchlist it's researching toward."
        right={
          <Link href="/market">
            <Chip tone="teal">browse the market →</Chip>
          </Link>
        }
      />

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
        <UniverseTable rows={activeRows} />
      </section>

      <section className="mt-10">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-teal-300/70">
            <Term k="watchlist">Watchlist</Term> — {candidates.length} tracked
          </h2>
          <p className="text-xs text-teal-200/40">
            Names you&apos;re tracking — the agent dossiers them, but it can&apos;t trade them until you both promote one into the universe.
          </p>
        </div>

        {isMember && (
          <div className="mb-4">
            <AddTicker />
          </div>
        )}

        {candidateRows.length === 0 ? (
          <EmptyState
            title="Nothing on the watchlist"
            body="Watch a name above, or find one on the Market tab — the agent starts researching it the moment you do."
          />
        ) : (
          <div className="space-y-3">
            {candidateRows.map((c) => {
              const research = c.note ?? null;
              return (
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
                        <span className={(c.dayBps ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}>
                          {pct((c.dayBps ?? 0) / 10_000, 2)}
                        </span>
                      </span>
                    )}
                    <SignalStrip signals={c.signals} />
                    <StanceCell stance={c.stance} rec={c.rec} />
                    <span className="ml-auto text-xs text-teal-200/40">
                      {c.journal > 0 ? `${c.journal} journal` : "no dossier yet"}
                      {c.addedBy ? ` · added by ${c.addedBy}` : ""}
                    </span>
                  </div>
                  {research && <p className="mt-2 text-xs text-teal-200/50">{research}</p>}
                  {isMember && (
                    <div className="mt-3">
                      <UniverseActions
                        symbol={c.symbol}
                        status="CANDIDATE"
                        pendingBy={c.promotionRequestedBy}
                        proposedTier={c.proposedTier}
                        currentUser={me}
                      />
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </section>

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
