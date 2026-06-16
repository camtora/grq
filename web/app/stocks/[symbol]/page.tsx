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
import { stanceMeta, STANCE_TONE_CLASSES } from "@/lib/stance";
import { fmpEnabled, fmpAnalystTarget, fmpPeerComparison } from "@/lib/fmp";
import { Card, Chip, StatCard, Pnl } from "@/components/ui";
import Md from "@/components/Md";
import CollapsibleMd from "@/components/CollapsibleMd";
import Sparkline from "@/components/Sparkline";
import Scoreboard from "@/components/Scoreboard";
import DirectiveButtons from "@/components/DirectiveButtons";
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

  const [quote, position, watch, trades, journal, closes, signals, directive, symbolScores, analyst, peers] =
    await Promise.all([
      getQuote(symbol),
      prisma.position.findUnique({ where: { symbol } }),
      prisma.agentFocus.findUnique({ where: { symbol } }),
      prisma.trade.findMany({ where: { symbol }, orderBy: { at: "desc" }, take: 50 }),
      prisma.journalEntry.findMany({ where: { symbol }, orderBy: { at: "desc" }, take: 50 }),
      getCloses(symbol, 260).catch(() => []),
      computeSignals(symbol).catch(() => null),
      prisma.symbolDirective.findUnique({ where: { symbol } }),
      getScoreboard(symbol).catch(() => []),
      fmpEnabled() ? fmpAnalystTarget(entry.yahoo).catch(() => null) : Promise.resolve(null),
      fmpEnabled() ? fmpPeerComparison(entry.yahoo).catch(() => []) : Promise.resolve([]),
    ]);

  const currentRead = journal.find((j) => j.kind === "DECISION" || j.kind === "RESEARCH");
  const dayBps = quote?.dayChangeBps ?? 0;

  // The at-a-glance verdict + the agent's expected return (latest dossier target).
  const rec = signals ? overallSignal(signals) : null;
  const targetEntry = journal.find((j) => j.targetFarCents != null || j.targetNearCents != null);
  const cur = quote?.midCents ?? null;
  const nearPct = targetEntry?.targetNearCents != null && cur ? (targetEntry.targetNearCents - cur) / cur : null;
  const farPct = targetEntry?.targetFarCents != null && cur ? (targetEntry.targetFarCents - cur) / cur : null;
  const selfPeer = peers.find((p) => p.self);
  const peerPes = peers.filter((p) => !p.self && p.peTtm != null).map((p) => p.peTtm as number);
  const avgPeerPe = peerPes.length ? peerPes.reduce((a, b) => a + b, 0) / peerPes.length : null;
  const bottomLineEntry = journal.find((j) => j.bottomLine);
  // The agent's OWN call (judgment), distinct from the signal formula (rec).
  const stanceEntry = journal.find((j) => j.stance);
  const stance = stanceMeta(stanceEntry?.stance);

  return (
    <main>
      <Link href="/universe" className="text-xs text-teal-300 hover:underline">
        ← universe
      </Link>

      <div className="mt-3 mb-6 flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <h1 className="text-3xl font-bold text-teal-50">{symbol}</h1>
        <span className="text-teal-200/60">{entry.name}</span>
        <Chip tone="dim">{entry.tier ?? "untiered"}</Chip>
        {entry.status === "CANDIDATE" && <Chip tone="red">candidate — not tradeable</Chip>}
        {entry.status === "RETIRED" && <Chip tone="dim">retired</Chip>}
        {watch && <Chip tone="teal">agent watching</Chip>}
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

      {(stance || rec) && (
        <Card className="mb-6 border-teal-400/30 p-5">
          <div className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-teal-300/70">The bottom line</div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              {/* THE rating — the agent's judgment. Technicals are an input below, not a competing verdict. */}
              <div className="mb-1 text-[10px] uppercase tracking-wider text-teal-200/50">
                <Term k="agent-call">The agent&apos;s call</Term>
              </div>
              {stance ? (
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className={`text-3xl font-black ${STANCE_TONE_CLASSES[stance.tone].text}`}>{stance.label}</span>
                  <span className="text-sm text-teal-200/60">{stance.blurb}</span>
                </div>
              ) : (
                <div className="text-sm text-teal-200/50">
                  Not yet rated — the agent hasn&apos;t filed a call on this name. The technical read below is only an input.
                </div>
              )}
              {signals && (
                <div className="mt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <SignalStrip signals={signals} />
                    <span className="text-[10px] uppercase tracking-wider text-teal-200/40">
                      technicals{rec ? ` · lean ${rec.label}` : ""}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-teal-200/35">An input the agent weighs — trend/momentum only, not the call.</p>
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
              {analyst && (
                <p className="mt-2 text-sm text-teal-200/70">
                  <Term k="analyst-target">Analyst consensus</Term>:{" "}
                  <span className={analyst.upsidePct > 0 ? "text-emerald-400" : "text-red-400"}>
                    {analyst.upsidePct > 0 ? "+" : ""}
                    {pct(analyst.upsidePct, 0)} upside
                  </span>
                  <span className="text-xs text-teal-200/40"> · Wall St.{analyst.currency !== "CAD" ? " (US listing)" : ""}</span>
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
                  The agent&apos;s plain-English &ldquo;why&rdquo; appears here once it files a dossier on this name.
                  {signals ? ` For now, the technical read: ${signalsOneLine(signals)}.` : ""}
                </p>
              )}
              <p className="mt-3 text-[11px] text-teal-200/40">
                The rating above is <span className="text-teal-200/60">the agent&apos;s call</span> — its judgment. The technical
                signals are an input, not the verdict; the trade it actually places lives in its journal below.
              </p>
            </div>
          </div>
        </Card>
      )}

      {peers.length > 1 && (
        <Card className="mb-6 p-5">
          <div className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-teal-300/70">Valuation vs peers</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-teal-200/40">
                <th className="py-1">Company</th>
                <th className="py-1 text-right">
                  <Term k="pe" align="right">P/E</Term>
                </th>
                <th className="py-1 text-right">P/B</th>
                <th className="py-1 text-right">
                  <Term k="market-cap" align="right">Cap</Term>
                </th>
              </tr>
            </thead>
            <tbody>
              {peers.map((p) => {
                const capM = p.self && p.marketCapM == null ? entry.marketCapM : p.marketCapM;
                return (
                  <tr key={p.symbol} className={`border-t border-teal-400/10 ${p.self ? "bg-teal-400/[0.06]" : ""}`}>
                    <td className={`py-1.5 ${p.self ? "font-bold text-teal-200" : "text-teal-100/70"}`}>
                      {p.self ? `${symbol} · this stock` : p.symbol}
                      {!p.self && p.name && <span className="ml-2 text-xs text-teal-200/40">{p.name}</span>}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-teal-100/80">{p.peTtm != null ? `${p.peTtm.toFixed(1)}×` : "—"}</td>
                    <td className="py-1.5 text-right tabular-nums text-teal-200/60">{p.pbTtm != null ? `${p.pbTtm.toFixed(1)}×` : "—"}</td>
                    <td className="py-1.5 text-right tabular-nums text-teal-200/60">
                      {capM ? (capM >= 1000 ? `$${Math.round(capM / 1000)}B` : `$${capM}M`) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-teal-200/40">
            {selfPeer?.peTtm != null && avgPeerPe != null
              ? `At ${selfPeer.peTtm.toFixed(1)}× earnings, ${symbol} trades ${selfPeer.peTtm < avgPeerPe ? "cheaper than" : "richer than"} its peers' average of ${avgPeerPe.toFixed(1)}×. Cheap can mean value — or trouble.`
              : "P/E and P/B against the company's closest peers (FMP)."}
          </p>
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
              The agent&apos;s note
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
