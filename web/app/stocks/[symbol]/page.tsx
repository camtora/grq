import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { universeEntry } from "@/lib/universe";
import { getQuote } from "@/lib/broker/quotes";
import { money, signedMoney, pct, fmtWhen, pnlClass } from "@/lib/money";
import { Card, Chip, StatCard, Pnl } from "@/components/ui";
import Md from "@/components/Md";

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

export default async function StockPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol: raw } = await params;
  const symbol = raw.toUpperCase();
  const entry = universeEntry(symbol);
  if (!entry) notFound();

  const [quote, position, watch, trades, journal] = await Promise.all([
    getQuote(symbol),
    prisma.position.findUnique({ where: { symbol } }),
    prisma.watchlist.findUnique({ where: { symbol } }),
    prisma.trade.findMany({ where: { symbol }, orderBy: { at: "desc" }, take: 50 }),
    prisma.journalEntry.findMany({ where: { symbol }, orderBy: { at: "desc" }, take: 50 }),
  ]);

  const currentRead = journal.find((j) => j.kind === "DECISION" || j.kind === "RESEARCH");
  const dayBps = quote?.dayChangeBps ?? 0;

  return (
    <main>
      <Link href="/stocks" className="text-xs text-teal-300 hover:underline">
        ← all stocks
      </Link>

      <div className="mt-3 mb-6 flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <h1 className="text-3xl font-bold text-teal-50">{symbol}</h1>
        <span className="text-teal-200/60">{entry.name}</span>
        <Chip tone="dim">{entry.tier}</Chip>
        {watch && <Chip tone="teal">watchlist</Chip>}
        {quote && (
          <span className="ml-auto flex items-baseline gap-3">
            <span className="text-2xl font-semibold tabular-nums text-teal-50">{money(quote.midCents)}</span>
            <span className={`tabular-nums ${dayBps > 0 ? "text-emerald-400" : dayBps < 0 ? "text-red-400" : "text-teal-200/50"}`}>
              {pct(dayBps / 10_000, 2)} today
            </span>
          </span>
        )}
      </div>

      {position && quote && (
        <section className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Held" value={`${position.qty} sh`} note={`since ${fmtWhen(position.openedAt)}`} />
          <StatCard label="Avg cost (ACB)" value={money(position.avgCostCents)} />
          <StatCard label="Market value" value={money(position.qty * quote.midCents)} />
          <StatCard
            label="Unrealized P&L"
            value={signedMoney(position.qty * (quote.midCents - position.avgCostCents))}
            valueClassName={pnlClass(position.qty * (quote.midCents - position.avgCostCents))}
          />
        </section>
      )}

      {currentRead && (
        <Card className="mb-6 border-teal-400/30 p-5">
          <div className="mb-2 flex items-center gap-3">
            <Chip tone="teal">current read</Chip>
            <span className="text-sm font-medium text-teal-50">{currentRead.title}</span>
            <span className="ml-auto text-xs text-teal-200/40">{fmtWhen(currentRead.at)}</span>
          </div>
          <Md text={currentRead.body} />
          <SourceChips sourcesJson={currentRead.sourcesJson} />
        </Card>
      )}

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-teal-200/50">
            Agent intelligence ({journal.length})
          </h2>
          {journal.length === 0 ? (
            <Card className="p-6 text-sm text-teal-200/40">
              The agent hasn&rsquo;t written anything about {symbol} yet — entries appear here
              the moment it researches, decides, trades, or retros this name.
            </Card>
          ) : (
            journal.map((j) => (
              <Card key={j.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone={j.kind === "TRADE" ? "green" : j.kind === "LESSON" ? "teal" : "dim"}>{j.kind}</Chip>
                  <span className="text-sm font-medium text-teal-50">{j.title}</span>
                  <span className="ml-auto text-xs text-teal-200/40">
                    {fmtWhen(j.at)} · {j.agentVersion}
                  </span>
                </div>
                <div className="mt-2">
                  <Md text={j.body} />
                </div>
                <SourceChips sourcesJson={j.sourcesJson} />
              </Card>
            ))
          )}
        </div>

        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-teal-200/50">Trades</h2>
          <Card className="p-4">
            {trades.length === 0 ? (
              <p className="text-sm text-teal-200/40">No fills yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {trades.map((t) => (
                  <li key={t.id} className="flex items-baseline gap-2 border-t border-teal-400/10 pt-2 first:border-0 first:pt-0">
                    <span className={`font-bold ${t.side === "BUY" ? "text-teal-300" : "text-amber-300"}`}>{t.side}</span>
                    <span className="tabular-nums text-teal-100/80">
                      {t.qty} @ {money(t.priceCents)}
                    </span>
                    {t.realizedPnlCents !== null && <Pnl cents={t.realizedPnlCents} className="text-xs" />}
                    <span className="ml-auto text-xs text-teal-200/40">{fmtWhen(t.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <h2 className="text-sm font-semibold uppercase tracking-wider text-teal-200/50">Data tiers</h2>
          <Card className="p-4 text-sm">
            <ul className="space-y-2 text-teal-200/50">
              <li>📈 Tier 1 — signals: <span className="text-teal-200/40">lights up with the signals layer</span></li>
              <li>📊 Tier 6 — earnings: <span className="text-teal-200/40">lights up with earnings tracking</span></li>
              <li>📰 Tier 7 — news: <span className="text-teal-200/40">mentions land via research sessions</span></li>
              <li>🧑‍💼 Tier 4 — insiders (SEDI): <span className="text-teal-200/40">future</span></li>
            </ul>
          </Card>
        </div>
      </section>
    </main>
  );
}
