import Link from "next/link";
import { prisma } from "@/lib/db";
import { getPortfolio, type PositionView } from "@/lib/portfolio";
import { allUniverse } from "@/lib/universe";
import { startOfEtDay, etDateStr, etParts, isMarketDay } from "@/agent/calendar";
import { money, signedMoney, pct, fmtWhen } from "@/lib/money";
import { Card, Chip, Pnl } from "@/components/ui";
import CollapsibleMd from "@/components/CollapsibleMd";
import Sparkline from "@/components/Sparkline";
import StockAvatar from "@/components/StockAvatar";
import { dailyQuote } from "@/lib/dailyquote";

function Sources({ sourcesJson }: { sourcesJson: string | null }) {
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

function signedPct(bps: number): string {
  return `${bps > 0 ? "+" : ""}${pct(bps / 10_000, 2)}`;
}

function dayClass(bps: number): string {
  return bps > 0 ? "text-emerald-400" : bps < 0 ? "text-red-400" : "text-teal-200/50";
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-teal-300/70">{children}</h2>;
}

function MoverRow({ symbol, name, midCents, dayBps }: { symbol: string; name: string; midCents: number; dayBps: number }) {
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <StockAvatar symbol={symbol} className="h-8 w-8 text-[11px]" />
      <div className="min-w-0">
        <Link href={`/stocks/${symbol}`} className="font-semibold text-teal-200 hover:underline">
          {symbol}
        </Link>
        <div className="truncate text-xs text-teal-200/40">{name}</div>
      </div>
      <div className="ml-auto text-right">
        <div className="text-sm tabular-nums text-teal-100/80">{money(midCents)}</div>
        <div className={`text-xs tabular-nums ${dayClass(dayBps)}`}>{signedPct(dayBps)}</div>
      </div>
    </li>
  );
}

function HitterRow({ p }: { p: PositionView }) {
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <StockAvatar symbol={p.symbol} className="h-8 w-8 text-[11px]" />
      <div className="min-w-0">
        <Link href={`/stocks/${p.symbol}`} className="font-semibold text-teal-200 hover:underline">
          {p.symbol}
        </Link>
        <div className="text-xs text-teal-200/40">{p.qty} sh · {money(p.marketValueCents)}</div>
      </div>
      <div className="ml-auto text-right">
        <div className={`text-xs tabular-nums ${dayClass(p.dayChangeBps)}`}>{signedPct(p.dayChangeBps)} today</div>
        <Pnl cents={p.unrealizedPnlCents} className="text-xs" />
      </div>
    </li>
  );
}

function RadarRow({ symbol, note, tone }: { symbol: string; note: string; tone: "teal" | "dim" }) {
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <StockAvatar symbol={symbol} className="h-8 w-8 text-[11px]" />
      <Link href={`/stocks/${symbol}`} className="font-semibold text-teal-200 hover:underline">
        {symbol}
      </Link>
      <Chip tone={tone}>{note}</Chip>
    </li>
  );
}

function editionLabel(): string {
  if (!isMarketDay()) return "Weekend Edition";
  const m = etParts().minutesSinceMidnight;
  if (m < 9 * 60 + 30) return "Morning Edition";
  if (m < 16 * 60) return "Midday Edition";
  return "Evening Edition";
}

export default async function Today({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const sp = await searchParams;
  const valid = sp.d && /^\d{4}-\d{2}-\d{2}$/.test(sp.d);
  const anchor = valid ? new Date(`${sp.d}T12:00:00Z`) : new Date();
  const start = startOfEtDay(anchor);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const dateStr = etDateStr(anchor);
  const todayStr = etDateStr();
  const isToday = dateStr === todayStr;
  const prev = etDateStr(new Date(start.getTime() - 12 * 60 * 60 * 1000));
  const next = etDateStr(new Date(end.getTime() + 12 * 60 * 60 * 1000));
  const dayLabel = anchor.toLocaleDateString("en-CA", {
    timeZone: "America/Toronto",
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const [pf, plan, eod, weekly, entries, dayOpenSnap, todaySnaps, quoteRows, universeRows, watchlist, dossiers] =
    await Promise.all([
      getPortfolio(),
      prisma.journalEntry.findFirst({ where: { kind: "RESEARCH", title: { startsWith: "Game plan" }, at: { gte: start, lt: end } } }),
      prisma.report.findFirst({ where: { kind: "EOD", date: { gte: start, lt: end } } }),
      prisma.report.findFirst({ where: { kind: "WEEKLY", date: { gte: start, lt: end } } }),
      prisma.journalEntry.findMany({ where: { at: { gte: start, lt: end } }, orderBy: { at: "asc" } }),
      prisma.navSnapshot.findFirst({ where: { at: { lt: start } }, orderBy: { at: "desc" } }),
      prisma.navSnapshot.findMany({ where: { at: { gte: start, lt: end } }, orderBy: { at: "asc" } }),
      prisma.quote.findMany(),
      allUniverse(),
      prisma.watchlist.findMany({ orderBy: { addedAt: "desc" } }),
      prisma.journalEntry.findMany({
        where: { kind: "RESEARCH", title: { startsWith: "Dossier" }, at: { gte: start, lt: end }, symbol: { not: null } },
        orderBy: { at: "desc" },
        take: 8,
      }),
    ]);
  const timeline = entries.filter((e) => e.id !== plan?.id);

  const dayOpenNav = dayOpenSnap?.navCents ?? pf.contributionsCents;
  const dayPnl = pf.navCents - dayOpenNav;
  const dayPnlPct = dayOpenNav > 0 ? dayPnl / dayOpenNav : 0;

  const tape = todaySnaps.map((s) => s.navCents);
  if (dayOpenSnap) tape.unshift(dayOpenSnap.navCents);

  const nameBy = new Map(universeRows.map((u) => [u.symbol, u.name]));
  const movers = quoteRows
    .filter((q) => nameBy.has(q.symbol))
    .map((q) => ({ symbol: q.symbol, name: nameBy.get(q.symbol) ?? q.symbol, midCents: q.midCents, dayBps: q.dayChangeBps }))
    .sort((a, b) => b.dayBps - a.dayBps);
  const gainers = movers.filter((m) => m.dayBps > 0).slice(0, 5);
  const losers = movers.filter((m) => m.dayBps < 0).slice(-5).reverse();

  const hitters = [...pf.positions].sort((a, b) => Math.abs(b.dayChangeBps) - Math.abs(a.dayChangeBps));

  // On the radar: watchlist first, then today's dossier'd names not already shown.
  const seen = new Set(watchlist.map((w) => w.symbol));
  const radar = [
    ...watchlist.map((w) => ({ symbol: w.symbol, note: "watchlist", tone: "teal" as const })),
    ...dossiers
      .filter((d) => d.symbol && !seen.has(d.symbol))
      .map((d) => ({ symbol: d.symbol as string, note: d.confidence != null ? `dossier · ${d.confidence}%` : "dossier", tone: "dim" as const })),
  ].slice(0, 8);

  let eodStats: Record<string, string | number> | null = null;
  if (eod?.statsJson) {
    try {
      eodStats = JSON.parse(eod.statsJson);
    } catch {
      eodStats = null;
    }
  }

  const edition = isToday ? editionLabel() : "Archive";

  return (
    <main>
      <div className="mb-4 flex items-center justify-end gap-2 text-sm">
        <Link href={`/today?d=${prev}`} className="rounded-lg border border-teal-400/20 px-3 py-1.5 text-teal-300 hover:bg-teal-400/10">
          ← {prev}
        </Link>
        {!isToday && (
          <Link href="/today" className="rounded-lg border border-teal-400/20 px-3 py-1.5 text-teal-300 hover:bg-teal-400/10">
            today
          </Link>
        )}
        {dateStr < todayStr && (
          <Link href={`/today?d=${next}`} className="rounded-lg border border-teal-400/20 px-3 py-1.5 text-teal-300 hover:bg-teal-400/10">
            {next} →
          </Link>
        )}
      </div>

      {/* Masthead */}
      <header className="mb-6 border-y-2 border-teal-400/30 py-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-3xl font-black uppercase tracking-tight text-teal-50">GRQ Daily</div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.3em] text-teal-300/70">
              {edition} · {dayLabel}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-teal-200/40">Net asset value</div>
            <div className="text-3xl font-bold tabular-nums text-teal-50">{money(pf.navCents)}</div>
            <div className="text-sm">
              <Pnl cents={dayPnl} /> <span className="text-teal-200/50">({signedPct(Math.round(dayPnlPct * 10_000))} today)</span>
            </div>
          </div>
        </div>
        <p className="mt-3 border-t border-teal-400/10 pt-3 text-sm italic text-teal-200/60">{dailyQuote(anchor)}</p>
      </header>

      {/* The Tape — the day's NAV, start → finish */}
      <Card className="mb-6 p-5">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-teal-200/50">The Tape · the day's NAV</span>
          <span className="text-xs text-teal-200/40">
            opened {money(dayOpenNav)} → {isToday ? "now" : "close"} {money(pf.navCents)}{" "}
            <span className={dayClass(dayPnl)}>({signedMoney(dayPnl)})</span>
            {pf.benchmarkCents !== null && (
              <>
                {" · "}vs XIC <span className={dayClass(pf.navCents - pf.benchmarkCents)}>{signedMoney(pf.navCents - pf.benchmarkCents)}</span>
              </>
            )}
          </span>
        </div>
        {tape.length >= 2 ? (
          <Sparkline values={tape} />
        ) : (
          <p className="py-4 text-sm text-teal-200/40">
            Flat line — the fund's parked in cash. The tape comes alive the day the agent takes a position.
          </p>
        )}
      </Card>

      {weekly && (
        <Card className="mb-6 border-teal-400/30 p-5">
          <div className="mb-2 flex items-center gap-3">
            <Chip tone="teal">weekly review</Chip>
            <span className="font-medium text-teal-50">{weekly.title}</span>
          </div>
          <CollapsibleMd text={weekly.body} threshold={1200} />
        </Card>
      )}

      {/* Lead story + Market Movers rail */}
      <section className="grid items-start gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionTitle>{eod ? "The Close" : "Today's Lead"}</SectionTitle>
          <Card className="p-5">
            {eod ? (
              <>
                <div className="mb-2 text-lg font-semibold text-teal-50">{eod.title}</div>
                {eodStats && (
                  <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-teal-200/60">
                    {Object.entries(eodStats).map(([k, v]) => (
                      <span key={k}>
                        <span className="uppercase tracking-wider text-teal-200/40">{k.replace(/_/g, " ")}</span>{" "}
                        <span className="tabular-nums text-teal-50">{String(v)}</span>
                      </span>
                    ))}
                  </div>
                )}
                <CollapsibleMd text={eod.body} threshold={1400} />
              </>
            ) : plan ? (
              <>
                <div className="mb-2 text-lg font-semibold text-teal-50">{plan.title}</div>
                <CollapsibleMd text={plan.body} threshold={1400}>
                  <Sources sourcesJson={plan.sourcesJson} />
                </CollapsibleMd>
              </>
            ) : (
              <p className="text-sm text-teal-200/40">
                {isToday
                  ? "The agent's wrap lands around 16:15 ET on market days. Until then it's reading the tape and the news so you don't have to."
                  : "No report filed this day (weekend, holiday, or pre-agent era)."}
              </p>
            )}
          </Card>
        </div>

        <aside>
          <SectionTitle>Market Movers</SectionTitle>
          <Card className="overflow-hidden p-1">
            {isToday && (gainers.length > 0 || losers.length > 0) ? (
              <ul className="divide-y divide-teal-400/10">
                {gainers.map((m) => (
                  <MoverRow key={`g-${m.symbol}`} {...m} />
                ))}
                {losers.map((m) => (
                  <MoverRow key={`l-${m.symbol}`} {...m} />
                ))}
              </ul>
            ) : (
              <p className="p-3 text-sm text-teal-200/40">No moves to report{isToday ? " yet" : " in the archive view"}.</p>
            )}
          </Card>
          <p className="mt-2 px-1 text-[10px] text-teal-200/40">biggest moves across the {universeRows.length} names we track</p>
        </aside>
      </section>

      {/* Top Hitters + On the Radar */}
      <section className="mt-8 grid items-start gap-6 lg:grid-cols-2">
        <div>
          <SectionTitle>Top Hitters · your holdings</SectionTitle>
          <Card className="overflow-hidden p-1">
            {hitters.length > 0 ? (
              <ul className="divide-y divide-teal-400/10">
                {hitters.map((p) => (
                  <HitterRow key={p.symbol} p={p} />
                ))}
              </ul>
            ) : (
              <p className="p-3 text-sm text-teal-200/40">
                All cash — no hitters today. The agent only buys when a thesis clears every guardrail. Patience is a position.
              </p>
            )}
          </Card>
        </div>
        <div>
          <SectionTitle>On the Radar · what the agent's eyeing</SectionTitle>
          <Card className="overflow-hidden p-1">
            {radar.length > 0 ? (
              <ul className="divide-y divide-teal-400/10">
                {radar.map((r) => (
                  <RadarRow key={r.symbol} symbol={r.symbol} note={r.note} tone={r.tone} />
                ))}
              </ul>
            ) : (
              <p className="p-3 text-sm text-teal-200/40">Nothing pinned yet — the morning research session populates this.</p>
            )}
          </Card>
          <p className="mt-2 px-1 text-[10px] text-teal-200/40">
            watchlist + names freshly researched — expected upside lights up once the agent sets price targets
          </p>
        </div>
      </section>

      {/* This morning's plan (kept available even when the close is the lead) */}
      {eod && plan && (
        <section className="mt-8">
          <SectionTitle>This morning's game plan</SectionTitle>
          <Card className="p-5">
            <CollapsibleMd text={plan.body} threshold={1200}>
              <Sources sourcesJson={plan.sourcesJson} />
            </CollapsibleMd>
          </Card>
        </section>
      )}

      {/* The day as it happened — the full record, kept */}
      <section className="mt-8">
        <SectionTitle>The day as it happened ({timeline.length})</SectionTitle>
        <div className="grid gap-6 lg:grid-cols-3">
          {(
            [
              { label: "Trades", items: timeline.filter((j) => j.kind === "TRADE") },
              { label: "Research", items: timeline.filter((j) => j.kind !== "TRADE" && j.kind !== "SYSTEM") },
              { label: "System", items: timeline.filter((j) => j.kind === "SYSTEM") },
            ] as const
          ).map((panel) => (
            <div key={panel.label} className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-200/40">
                {panel.label} ({panel.items.length})
              </h3>
              {panel.items.length === 0 ? (
                <Card className="p-4 text-sm text-teal-200/40">
                  {panel.label === "Trades" ? "No fills this day." : panel.label === "Research" ? "No research this day." : "Quiet."}
                </Card>
              ) : (
                panel.items.map((j) => (
                  <Card key={j.id} className="p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs tabular-nums text-teal-200/40">{fmtWhen(j.at)}</span>
                      <Chip tone={j.kind === "TRADE" ? "green" : j.kind === "SYSTEM" ? "dim" : "teal"}>{j.kind}</Chip>
                      {j.symbol && (
                        <Link href={`/stocks/${j.symbol}`} className="font-semibold text-teal-300 hover:underline">
                          {j.symbol}
                        </Link>
                      )}
                    </div>
                    <div className="mt-1.5 text-sm font-medium text-teal-50">{j.title}</div>
                    <div className="mt-2">
                      <CollapsibleMd text={j.body} threshold={300}>
                        <Sources sourcesJson={j.sourcesJson} />
                      </CollapsibleMd>
                    </div>
                  </Card>
                ))
              )}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
