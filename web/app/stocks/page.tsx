import Link from "next/link";
import { prisma } from "@/lib/db";
import { activeUniverse, type UniverseRow } from "@/lib/universe";
import { getQuotes } from "@/lib/broker/quotes";
import { money, pct } from "@/lib/money";
import { Card, PageHeader, Chip, Pnl } from "@/components/ui";
import { computeSignals, overallSignal, type Signals, type Recommendation } from "@/agent/signals";
import SignalStrip from "@/components/SignalStrip";
import { stanceMeta, STANCE_TONE_CLASSES } from "@/lib/stance";
import { capTier, CAP_LABEL, type CapTier } from "@/lib/fundamentals";
import StockFilters from "@/components/StockFilters";
import WatchButton from "@/components/WatchButton";
import ScreenerAddButton from "@/components/ScreenerAddButton";
import { getSession } from "@/lib/session";

type Row = UniverseRow & {
  lastCents: number | null;
  dayBps: number | null;
  held: { qty: number; avgCostCents: number } | null;
  watched: boolean;
  watchNote: string | null;
  pinnedBy: string | null;
  blocked: boolean;
  journal: number;
  mvCents: number;
  upnlCents: number;
  signals: Signals | null;
  rec: Recommendation | null;
  stance: string | null;
};

function sortRows(rows: Row[]): Row[] {
  return rows.sort((a, b) => {
    if (!!a.held !== !!b.held) return a.held ? -1 : 1;
    if (a.held && b.held) return b.mvCents - a.mvCents;
    return a.symbol.localeCompare(b.symbol);
  });
}

function SectionRows({ rows, filterable = true }: { rows: Row[]; filterable?: boolean }) {
  return (
    <>
      {rows.map((r) => (
        <tr
          key={r.symbol}
          className={`${filterable ? "stock-row " : ""}border-t border-teal-400/10 ${r.held ? "bg-teal-400/[0.05]" : ""}`}
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
                title={`Pinned by ${r.pinnedBy}`}
              >
                {r.pinnedBy.charAt(0)}
              </span>
            )}
            {r.blocked && (
              <span className="ml-1 align-middle" title="No-fly: the agent may not buy this">🚫</span>
            )}
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
            {r.stance ? (
              <span
                className={`text-xs font-bold ${STANCE_TONE_CLASSES[stanceMeta(r.stance)!.tone].text}`}
                title={`The agent's call: ${stanceMeta(r.stance)!.blurb}`}
              >
                {stanceMeta(r.stance)!.label}
              </span>
            ) : r.rec ? (
              <span className="text-xs text-teal-200/40" title="No agent call yet — technical lean only (an input, not a verdict)">
                {r.rec.label} <span className="text-[9px] text-teal-200/30">tech</span>
              </span>
            ) : (
              <span className="text-xs text-teal-200/25">—</span>
            )}
          </td>
          <td className="px-4 py-2.5 text-right tabular-nums text-teal-50">
            {r.held ? `${r.held.qty} sh · ${money(r.mvCents)}` : ""}
          </td>
          <td className="px-4 py-2.5 text-right">{r.held ? <Pnl cents={r.upnlCents} className="text-sm" /> : ""}</td>
          <td className="px-4 py-2.5 text-right tabular-nums text-teal-200/50">{r.journal > 0 ? r.journal : ""}</td>
        </tr>
      ))}
    </>
  );
}

function StocksTable({ rows, filterable = true }: { rows: Row[]; filterable?: boolean }) {
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
            <th className="px-4 py-3">Agent&apos;s call</th>
            <th className="px-4 py-3 text-right">Position</th>
            <th className="px-4 py-3 text-right">Unrealized</th>
            <th className="px-4 py-3 text-right">Journal</th>
          </tr>
        </thead>
        <tbody>
          <SectionRows rows={rows} filterable={filterable} />
        </tbody>
      </table>
    </Card>
  );
}

export default async function Stocks() {
  const [universe, positions, watchlist, directives, journalCounts, session] = await Promise.all([
    activeUniverse(),
    prisma.position.findMany(),
    prisma.watchlist.findMany(),
    prisma.symbolDirective.findMany(),
    prisma.journalEntry.groupBy({ by: ["symbol"], _count: { id: true }, where: { symbol: { not: null } } }),
    getSession(),
  ]);
  const isMember = session?.role === "member";
  const quotes = await getQuotes(universe.map((u) => u.symbol));
  const candidateCount = await prisma.universeMember.count({ where: { status: "CANDIDATE" } });
  const stanceRows = await prisma.journalEntry.findMany({
    where: { stance: { not: null }, symbol: { not: null } },
    orderBy: { at: "desc" },
    select: { symbol: true, stance: true },
  });
  const stanceBy = new Map<string, string>();
  for (const s of stanceRows) if (s.symbol && !stanceBy.has(s.symbol)) stanceBy.set(s.symbol, s.stance as string);
  const signalsList = await Promise.all(universe.map((u) => computeSignals(u.symbol).catch(() => null)));
  const sigBy = new Map(universe.map((u, i) => [u.symbol, signalsList[i]] as const));

  const posBy = new Map(positions.map((p) => [p.symbol, p]));
  const watchBy = new Map(watchlist.map((w) => [w.symbol, w]));
  const dirBy = new Map(directives.map((d) => [d.symbol, d]));
  const jcBy = new Map(journalCounts.map((j) => [j.symbol as string, j._count.id]));

  const rows: Row[] = universe.map((u) => {
    const q = quotes.get(u.symbol);
    const p = posBy.get(u.symbol);
    const d = dirBy.get(u.symbol);
    const sig = sigBy.get(u.symbol) ?? null;
    return {
      ...u,
      lastCents: q?.midCents ?? null,
      dayBps: q?.dayChangeBps ?? null,
      held: p ? { qty: p.qty, avgCostCents: p.avgCostCents } : null,
      watched: watchBy.has(u.symbol),
      watchNote: watchBy.get(u.symbol)?.note ?? null,
      pinnedBy: d?.directive === "PINNED" ? d.by : null,
      blocked: d?.directive === "BLOCKED",
      journal: jcBy.get(u.symbol) ?? 0,
      mvCents: p && q ? p.qty * q.midCents : 0,
      upnlCents: p && q ? p.qty * (q.midCents - p.avgCostCents) : 0,
      signals: sig,
      rec: sig ? overallSignal(sig) : null,
      stance: stanceBy.get(u.symbol) ?? null,
    };
  });

  const pinned = sortRows(rows.filter((r) => r.pinnedBy));
  const watched = sortRows(rows.filter((r) => !r.pinnedBy && r.watched));
  const rest = sortRows(rows.filter((r) => !r.pinnedBy && !r.watched));
  const watchlistRows = [...pinned, ...watched];
  // Watched names that aren't in the tradeable universe — the watchlist is first-class.
  const universeSymbols = new Set(universe.map((u) => u.symbol));
  const extraWatched = watchlist.filter((w) => !universeSymbols.has(w.symbol));
  const extraQuotes = await getQuotes(extraWatched.map((w) => w.symbol));

  // Filter options from whatever fundamentals are populated so far.
  const COUNTRY_LABEL: Record<string, string> = { CA: "Canada", US: "United States" };
  const distinct = (vals: (string | null)[]) => [...new Set(vals.filter((v): v is string => !!v))].sort();
  const countryOpts = distinct(rows.map((r) => r.country)).map((v) => ({ value: v, label: COUNTRY_LABEL[v] ?? v }));
  const exchangeOpts = distinct(rows.map((r) => r.exchange)).map((v) => ({ value: v, label: v }));
  const sectorOpts = distinct(rows.map((r) => r.sector)).map((v) => ({ value: v, label: v }));
  const capPresent = new Set(rows.map((r) => capTier(r.marketCapM)).filter((c): c is CapTier => !!c));
  const capOrder: CapTier[] = ["mega", "large", "mid", "small", "micro"];
  const capOpts = capOrder.filter((c) => capPresent.has(c)).map((c) => ({ value: c, label: CAP_LABEL[c] }));

  return (
    <main>
      <PageHeader
        title="Stocks"
        sub="Your watchlist and the agent's suggestions up top — the tradeable universe is the plumbing below."
        right={
          <div className="flex gap-2">
            <Link href="/research">
              <Chip tone="dim">research {candidateCount} →</Chip>
            </Link>
          </div>
        }
      />

      <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-teal-300/70">Your watchlist</h2>
      {watchlistRows.length > 0 ? (
        <StocksTable rows={watchlistRows} filterable={false} />
      ) : (
        <Card className="p-6 text-sm text-teal-200/40">
          Nothing on your watchlist yet — look up a name on the{" "}
          <Link href="/research" className="text-teal-300 hover:underline">
            Research tab
          </Link>{" "}
          and add it.
        </Card>
      )}

      {extraWatched.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] uppercase tracking-wider text-teal-200/40">Also watching · not in the tradeable universe</p>
          {extraWatched.map((w) => {
            const q = extraQuotes.get(w.symbol);
            return (
              <Card key={w.symbol} className="flex flex-wrap items-center gap-3 p-3">
                <span className="font-bold text-teal-200">{w.symbol}</span>
                {q && <span className="text-sm tabular-nums text-teal-100/80">{money(q.midCents)}</span>}
                {w.note && <span className="text-xs text-teal-200/40">{w.note}</span>}
                {isMember && (
                  <span className="ml-auto flex gap-2">
                    <WatchButton symbol={w.symbol} watched />
                    <ScreenerAddButton symbol={w.symbol} />
                  </span>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <section className="mt-8">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-teal-300/70">Suggested to watch</h2>
        <Card className="flex flex-wrap items-center gap-3 p-5">
          <p className="text-sm text-teal-200/60">
            The agent&apos;s ideas — under-the-radar hunt finds, names with upside, and what smart money is buying.
          </p>
          <div className="ml-auto flex flex-wrap gap-2">
            <Link
              href="/market"
              className="rounded-xl border border-teal-400/40 bg-teal-400/10 px-4 py-2 text-sm font-bold uppercase tracking-wider text-teal-200 hover:bg-teal-400/20"
            >
              Browse the market →
            </Link>
            <Link
              href="/ideas"
              className="rounded-xl border border-teal-400/40 bg-teal-400/10 px-4 py-2 text-sm font-bold uppercase tracking-wider text-teal-200 hover:bg-teal-400/20"
            >
              See all ideas →
            </Link>
          </div>
        </Card>
      </section>

      <section className="mt-8">
        <h2 className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-teal-300/70">The tradeable universe</h2>
        <p className="mb-2 text-xs text-teal-200/40">
          What the agent is allowed to buy — managed behind the scenes; members promote names in from research.
        </p>
        <StockFilters countries={countryOpts} exchanges={exchangeOpts} sectors={sectorOpts} caps={capOpts} />
        <StocksTable rows={rest} filterable={true} />
      </section>
      <p className="mt-3 text-xs text-teal-200/40">
        <span className="font-semibold text-teal-200/60">Signals</span> (hover for detail):{" "}
        <span className="font-semibold text-teal-200/60">T</span> trend ·{" "}
        <span className="font-semibold text-teal-200/60">R</span> rsi ·{" "}
        <span className="font-semibold text-teal-200/60">M</span> macd ·{" "}
        <span className="font-semibold text-teal-200/60">V</span> volatility — green BUY · red SELL · dim HOLD.{" "}
        These signals are <span className="font-semibold text-teal-200/60">inputs</span>, not the verdict.{" "}
        <span className="font-semibold text-teal-200/60">Agent&apos;s call</span> = the rating — the agent&apos;s own judgment from its latest dossier. A muted &ldquo;tech&rdquo; lean stands in until the agent has weighed in.
      </p>
      <p className="mt-1 text-xs text-teal-200/40">
        quotes delayed ~15 min · the risk dial gates which tiers the agent may buy ·{" "}
        <Link href="/research" className="text-teal-300 hover:underline">
          add or promote stocks on the Research tab →
        </Link>
      </p>
    </main>
  );
}
