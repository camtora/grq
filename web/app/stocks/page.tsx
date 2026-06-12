import Link from "next/link";
import { prisma } from "@/lib/db";
import { UNIVERSE } from "@/lib/universe";
import { getQuotes } from "@/lib/broker/quotes";
import { money, pct } from "@/lib/money";
import { Card, PageHeader, Chip, Pnl } from "@/components/ui";

export default async function Stocks() {
  const [positions, watchlist, journalCounts, quotes, directives] = await Promise.all([
    prisma.position.findMany(),
    prisma.watchlist.findMany(),
    prisma.journalEntry.groupBy({ by: ["symbol"], _count: { id: true }, where: { symbol: { not: null } } }),
    getQuotes(UNIVERSE.map((u) => u.symbol)),
    prisma.symbolDirective.findMany(),
  ]);

  const posBy = new Map(positions.map((p) => [p.symbol, p]));
  const watchSet = new Set(watchlist.map((w) => w.symbol));
  const dirBy = new Map(directives.map((d) => [d.symbol, d.directive]));
  const jcBy = new Map(journalCounts.map((j) => [j.symbol as string, j._count.id]));

  const rows = UNIVERSE.map((u) => {
    const q = quotes.get(u.symbol);
    const p = posBy.get(u.symbol);
    return {
      ...u,
      lastCents: q?.midCents ?? null,
      dayBps: q?.dayChangeBps ?? null,
      held: p ?? null,
      watched: watchSet.has(u.symbol),
      journal: jcBy.get(u.symbol) ?? 0,
      mvCents: p && q ? p.qty * q.midCents : 0,
      upnlCents: p && q ? p.qty * (q.midCents - p.avgCostCents) : 0,
    };
  }).sort((a, b) => {
    if (!!a.held !== !!b.held) return a.held ? -1 : 1;
    if (a.held && b.held) return b.mvCents - a.mvCents;
    if (a.watched !== b.watched) return a.watched ? -1 : 1;
    return a.symbol.localeCompare(b.symbol);
  });

  const heldCount = rows.filter((r) => r.held).length;

  return (
    <main>
      <PageHeader
        title="Stocks"
        sub={`The ${UNIVERSE.length}-symbol universe the agent may trade — holdings first, then the watchlist. Click any symbol for its one-pager.`}
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
              <th className="px-4 py-3 text-right">Position</th>
              <th className="px-4 py-3 text-right">Unrealized</th>
              <th className="px-4 py-3 text-right">Journal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.symbol}
                className={`border-t border-teal-400/10 ${r.held ? "bg-teal-400/[0.05]" : ""} ${
                  !r.held && i > 0 && rows[i - 1].held ? "border-t-2 border-teal-400/25" : ""
                }`}
              >
                <td className="px-4 py-2.5">
                  <Link href={`/stocks/${r.symbol}`} className="font-semibold text-teal-300 hover:underline">
                    {r.symbol}
                  </Link>
                  {r.watched && (
                    <span className="ml-2 align-middle" title="On the watchlist">👁</span>
                  )}
                  {dirBy.get(r.symbol) === "PINNED" && (
                    <span className="ml-1 align-middle" title="Pinned by a member">📌</span>
                  )}
                  {dirBy.get(r.symbol) === "BLOCKED" && (
                    <span className="ml-1 align-middle" title="No-fly: the agent may not buy this">🚫</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-teal-100/70">{r.name}</td>
                <td className="px-4 py-2.5">
                  <Chip tone="dim">{r.tier}</Chip>
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
                <td className="px-4 py-2.5 text-right tabular-nums text-teal-50">
                  {r.held ? `${r.held.qty} sh · ${money(r.mvCents)}` : ""}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {r.held ? <Pnl cents={r.upnlCents} className="text-sm" /> : ""}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-teal-200/50">
                  {r.journal > 0 ? r.journal : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="mt-3 text-xs text-teal-200/40">
        {heldCount} held · quotes delayed ~15 min · the risk dial gates which tiers the agent may buy
      </p>
    </main>
  );
}
