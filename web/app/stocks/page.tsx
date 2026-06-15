import Link from "next/link";
import { prisma } from "@/lib/db";
import { activeUniverse, type UniverseRow } from "@/lib/universe";
import { getQuotes } from "@/lib/broker/quotes";
import { money, pct } from "@/lib/money";
import { Card, PageHeader, Chip, Pnl } from "@/components/ui";
import { computeSignals, overallSignal, type Signals, type Recommendation } from "@/agent/signals";
import SignalStrip from "@/components/SignalStrip";
import SignalRec from "@/components/SignalRec";
import { stanceMeta, STANCE_TONE_CLASSES } from "@/lib/stance";

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

function SectionRows({ rows }: { rows: Row[] }) {
  return (
    <>
      {rows.map((r) => (
        <tr key={r.symbol} className={`border-t border-teal-400/10 ${r.held ? "bg-teal-400/[0.05]" : ""}`}>
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
            <SignalRec rec={r.rec} signals={r.signals} />
          </td>
          <td className="px-4 py-2.5">
            {r.stance ? (
              <span
                className={`text-xs font-bold ${STANCE_TONE_CLASSES[stanceMeta(r.stance)!.tone].text}`}
                title={`The agent's call: ${stanceMeta(r.stance)!.blurb}`}
              >
                {stanceMeta(r.stance)!.label}
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

function SectionHeader({ label }: { label: string }) {
  return (
    <tr className="border-t-2 border-teal-400/25 bg-teal-400/[0.03]">
      <td colSpan={11} className="px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-teal-200/50">
        {label}
      </td>
    </tr>
  );
}

export default async function Stocks() {
  const [universe, positions, watchlist, directives, journalCounts] = await Promise.all([
    activeUniverse(),
    prisma.position.findMany(),
    prisma.watchlist.findMany(),
    prisma.symbolDirective.findMany(),
    prisma.journalEntry.groupBy({ by: ["symbol"], _count: { id: true }, where: { symbol: { not: null } } }),
  ]);
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

  return (
    <main>
      <PageHeader
        title="Stocks"
        sub="The tradeable universe — pinned names first, then the agent's watchlist, then the bench."
        right={
          <div className="flex gap-2">
            <Chip tone="teal">universe {universe.length}</Chip>
            <Link href="/research">
              <Chip tone="dim">research {candidateCount} →</Chip>
            </Link>
          </div>
        }
      />

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
              <th className="px-4 py-3">Recommendation</th>
              <th className="px-4 py-3">Agent&apos;s call</th>
              <th className="px-4 py-3 text-right">Position</th>
              <th className="px-4 py-3 text-right">Unrealized</th>
              <th className="px-4 py-3 text-right">Journal</th>
            </tr>
          </thead>
          <tbody>
            {pinned.length > 0 && (
              <>
                <SectionHeader label="Pinned" />
                <SectionRows rows={pinned} />
              </>
            )}
            {watched.length > 0 && (
              <>
                <SectionHeader label="Watchlist" />
                <SectionRows rows={watched} />
              </>
            )}
            <SectionHeader label="Universe" />
            <SectionRows rows={rest} />
          </tbody>
        </table>
      </Card>
      <p className="mt-3 text-xs text-teal-200/40">
        <span className="font-semibold text-teal-200/60">Signals</span> (hover for detail):{" "}
        <span className="font-semibold text-teal-200/60">T</span> trend ·{" "}
        <span className="font-semibold text-teal-200/60">R</span> rsi ·{" "}
        <span className="font-semibold text-teal-200/60">M</span> macd ·{" "}
        <span className="font-semibold text-teal-200/60">V</span> volatility — green BUY · red SELL · dim HOLD.{" "}
        <span className="font-semibold text-teal-200/60">Recommendation</span> = confidence-weighted consensus of trend/rsi/macd (technical only, advisory).{" "}
        <span className="font-semibold text-teal-200/60">Agent&apos;s call</span> = the agent&apos;s own judgment from its latest dossier; where it disagrees with the formula is the part worth reading.
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
