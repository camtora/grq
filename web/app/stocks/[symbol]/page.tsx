import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { universeEntry } from "@/lib/universe";
import { getQuote } from "@/lib/broker/quotes";
import { getCloses } from "@/lib/bars";
import { computeSignals, overallSignal, signalsOneLine } from "@/agent/signals";
import { getScoreboard } from "@/lib/scoreboard";
import { getSession, displayName } from "@/lib/session";
import UniverseActions from "@/components/UniverseActions";
import AskGrq from "@/components/AskGrq";
import { money, signedMoney, pct, fmtWhen, pnlClass } from "@/lib/money";
import { Card, Chip, StatCard, Pnl } from "@/components/ui";
import Md from "@/components/Md";
import CollapsibleMd from "@/components/CollapsibleMd";
import Sparkline from "@/components/Sparkline";
import Scoreboard from "@/components/Scoreboard";
import DirectiveButtons from "@/components/DirectiveButtons";
import RatingDial from "@/components/RatingDial";
import SignalStrip from "@/components/SignalStrip";
import Term from "@/components/Term";

const SIG_TONE: Record<string, "green" | "red" | "dim"> = { BUY: "green", SELL: "red", HOLD: "dim" };

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
  const entry = await universeEntry(symbol);
  if (!entry) notFound();
  const session = await getSession();
  const me = displayName(session);
  const isMember = session?.role === "member";
  const researchInFlight =
    (await prisma.researchRequest.count({
      where: { symbol, status: { in: ["QUEUED", "RUNNING"] } },
    })) > 0;

  const [quote, position, watch, trades, journal, closes, signals, directive, symbolScores] =
    await Promise.all([
      getQuote(symbol),
      prisma.position.findUnique({ where: { symbol } }),
      prisma.watchlist.findUnique({ where: { symbol } }),
      prisma.trade.findMany({ where: { symbol }, orderBy: { at: "desc" }, take: 50 }),
      prisma.journalEntry.findMany({ where: { symbol }, orderBy: { at: "desc" }, take: 50 }),
      getCloses(symbol, 260).catch(() => []),
      computeSignals(symbol).catch(() => null),
      prisma.symbolDirective.findUnique({ where: { symbol } }),
      getScoreboard(symbol).catch(() => []),
    ]);

  const currentRead = journal.find((j) => j.kind === "DECISION" || j.kind === "RESEARCH");
  const dayBps = quote?.dayChangeBps ?? 0;

  // The at-a-glance verdict + the agent's expected return (latest dossier target).
  const rec = signals ? overallSignal(signals) : null;
  const targetEntry = journal.find((j) => j.targetFarCents != null || j.targetNearCents != null);
  const cur = quote?.midCents ?? null;
  const nearPct = targetEntry?.targetNearCents != null && cur ? (targetEntry.targetNearCents - cur) / cur : null;
  const farPct = targetEntry?.targetFarCents != null && cur ? (targetEntry.targetFarCents - cur) / cur : null;
  const bottomLineEntry = journal.find((j) => j.bottomLine);

  return (
    <main>
      <Link href="/stocks" className="text-xs text-teal-300 hover:underline">
        ← all stocks
      </Link>

      <div className="mt-3 mb-6 flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <h1 className="text-3xl font-bold text-teal-50">{symbol}</h1>
        <span className="text-teal-200/60">{entry.name}</span>
        <Chip tone="dim">{entry.tier ?? "untiered"}</Chip>
        {entry.status === "CANDIDATE" && <Chip tone="red">candidate — not tradeable</Chip>}
        {entry.status === "RETIRED" && <Chip tone="dim">retired</Chip>}
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

      <div className="mt-4 mb-6 flex flex-wrap items-center gap-2">
        {isMember && (
          <UniverseActions
            symbol={symbol}
            status={entry.status}
            pendingBy={entry.promotionRequestedBy}
            proposedTier={entry.proposedTier}
            currentUser={me}
            researchInFlight={researchInFlight}
          />
        )}
        <DirectiveButtons
          symbol={symbol}
          current={directive ? { directive: directive.directive, by: directive.by, note: directive.note } : null}
          canEdit={isMember}
        />
        {isMember && <AskGrq symbol={symbol} />}
      </div>

      {rec && (
        <Card className="mb-6 border-teal-400/30 p-5">
          <div className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-teal-300/70">The bottom line</div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <RatingDial rec={rec} />
              {signals && (
                <div className="mt-3 flex items-center gap-2">
                  <SignalStrip signals={signals} />
                  <span className="text-[10px] uppercase tracking-wider text-teal-200/40">signals</span>
                </div>
              )}
              {(nearPct !== null || farPct !== null) && (
                <p className="mt-3 text-sm text-teal-200/70">
                  <Term k="price-target">Target</Term>:{" "}
                  {nearPct !== null && (
                    <>
                      near{" "}
                      <span className={nearPct > 0 ? "text-emerald-400" : "text-red-400"}>
                        {nearPct > 0 ? "+" : ""}
                        {pct(nearPct, 0)}
                      </span>
                      {farPct !== null ? " · " : ""}
                    </>
                  )}
                  {farPct !== null && (
                    <>
                      12-mo{" "}
                      <span className={farPct > 0 ? "text-emerald-400" : "text-red-400"}>
                        {farPct > 0 ? "+" : ""}
                        {pct(farPct, 0)}
                      </span>
                    </>
                  )}
                </p>
              )}
            </div>
            <div>
              {bottomLineEntry?.bottomLine ? (
                <>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-teal-200/50">Why</div>
                  <div className="text-sm text-teal-100/80">
                    <Md text={bottomLineEntry.bottomLine} />
                  </div>
                </>
              ) : (
                <p className="text-sm text-teal-100/80">
                  {`The signals read ${rec.label.toLowerCase()}${signals ? ` — ${signalsOneLine(signals)}.` : "."} The agent's plain-English "why" appears here once it dossiers this name.`}
                </p>
              )}
              <p className="mt-3 text-[11px] text-teal-200/40">
                Rating is the technical consensus of trend/rsi/macd (advisory). The reasons are the agent research read; the
                trade it actually makes lives in its journal below.
              </p>
            </div>
          </div>
        </Card>
      )}

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

      {watch?.note && (
        <Card className="mb-6 p-4">
          <div className="flex items-baseline gap-3">
            <span className="shrink-0 text-xs font-semibold uppercase tracking-wider text-teal-200/50">
              Watchlist note
            </span>
            <p className="text-sm text-teal-100/80">{watch.note}</p>
          </div>
        </Card>
      )}

      {closes.length > 1 && (
        <Card className="mb-6 p-5">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-xs uppercase tracking-wider text-teal-200/50">Price — {closes.length} sessions</span>
            <span className="text-xs text-teal-200/40">
              {money(closes[0].closeCents)} → {money(closes[closes.length - 1].closeCents)}
            </span>
          </div>
          <Sparkline values={closes.map((c) => c.closeCents)} dates={closes.map((c) => c.date)} format={money} axes />
        </Card>
      )}

      <section className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">

      {currentRead && (
        <Card className="border-teal-400/30 p-5">
          <div className="mb-2 flex items-center gap-3">
            <Chip tone="teal">current read</Chip>
            <span className="text-sm font-medium text-teal-50">{currentRead.title}</span>
            <span className="ml-auto text-xs text-teal-200/40">{fmtWhen(currentRead.at)}</span>
          </div>
          <CollapsibleMd text={currentRead.body}>
            <SourceChips sourcesJson={currentRead.sourcesJson} />
          </CollapsibleMd>
        </Card>
      )}

      <div className="space-y-4">
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
                  <CollapsibleMd text={j.body}>
                    <SourceChips sourcesJson={j.sourcesJson} />
                  </CollapsibleMd>
                </div>
              </Card>
            ))
          )}
        </div>
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

          <h2 className="text-sm font-semibold uppercase tracking-wider text-teal-200/50">
            Signals <span className="normal-case text-teal-200/40">(v1 · on scoreboard probation)</span>
          </h2>
          <Card className="p-4">
            {!signals ? (
              <p className="text-sm text-teal-200/40">Insufficient bar history yet.</p>
            ) : (
              <ul className="space-y-2.5">
                {signals.families.map((f) => (
                  <li key={f.family} className="text-sm">
                    <div className="flex items-center gap-2">
                      <Term k={f.family} className="font-semibold uppercase text-teal-100/80">
                        {f.family}
                      </Term>
                      <Chip tone={SIG_TONE[f.signal]}>{f.signal}</Chip>
                      <span className="ml-auto text-xs tabular-nums text-teal-200/40">{f.confidence}%</span>
                    </div>
                    <div className="mt-0.5 text-xs text-teal-200/50">{f.rationale}</div>
                  </li>
                ))}
                <li className="pt-1 text-[10px] uppercase tracking-wider text-teal-200/30">as of {signals.asOf}</li>
              </ul>
            )}
          </Card>

          <Scoreboard
            rows={symbolScores}
            title={`Scoreboard — ${symbol}`}
            emptyText="No graded calls on this name yet — retros fill this in."
          />

          <h2 className="text-sm font-semibold uppercase tracking-wider text-teal-200/50">Future data tiers</h2>
          <Card className="p-4 text-sm">
            <ul className="space-y-2 text-teal-200/50">
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
