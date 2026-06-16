import Link from "next/link";
import { prisma } from "@/lib/db";
import { getPortfolio, type PositionView } from "@/lib/portfolio";
import { allUniverse } from "@/lib/universe";
import { startOfEtDay, etDateStr, etParts, isMarketDay } from "@/agent/calendar";
import { money, signedMoney, pct, fmtWhen } from "@/lib/money";
import { Card, Chip, Pnl } from "@/components/ui";
import CollapsibleMd from "@/components/CollapsibleMd";
import Sparkline from "@/components/Sparkline";
import StockLogo from "@/components/StockLogo";
import Term from "@/components/Term";
import { stanceMeta, STANCE_TONE_CLASSES } from "@/lib/stance";
import { fmpEnabled, fmpNews, fmpGainers } from "@/lib/fmp";
import { funFactOfDay } from "@/lib/funfacts";
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

function MoverRow({ symbol, name, midCents, dayBps, logoUrl, stance }: { symbol: string; name: string; midCents: number; dayBps: number; logoUrl: string | null; stance?: string | null }) {
  const sm = stance ? stanceMeta(stance) : null;
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <StockLogo symbol={symbol} logoUrl={logoUrl} className="h-8 w-8 text-[11px]" />
      <div className="min-w-0">
        <Link href={`/stocks/${symbol}`} className="font-semibold text-teal-200 hover:underline">
          {symbol}
        </Link>
        <div className="truncate text-xs text-teal-200/40">{name}</div>
      </div>
      {sm && (
        <span
          className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-black ${STANCE_TONE_CLASSES[sm.tone].text} ${STANCE_TONE_CLASSES[sm.tone].border}`}
          title={`GRQ's call: ${sm.label} — ${sm.blurb}`}
        >
          {sm.abbr}
        </span>
      )}
      <div className="ml-auto text-right">
        <div className="text-sm tabular-nums text-teal-100/80">{money(midCents)}</div>
        <div className={`text-xs tabular-nums ${dayClass(dayBps)}`}>{signedPct(dayBps)}</div>
      </div>
    </li>
  );
}

function HitterRow({ p, logoUrl }: { p: PositionView; logoUrl: string | null }) {
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <StockLogo symbol={p.symbol} logoUrl={logoUrl} className="h-8 w-8 text-[11px]" />
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

function RadarRow({ symbol, note, tone, logoUrl }: { symbol: string; note: string; tone: "teal" | "dim"; logoUrl: string | null }) {
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <StockLogo symbol={symbol} logoUrl={logoUrl} className="h-8 w-8 text-[11px]" />
      <Link href={`/stocks/${symbol}`} className="font-semibold text-teal-200 hover:underline">
        {symbol}
      </Link>
      <Chip tone={tone}>{note}</Chip>
    </li>
  );
}

type Idea = {
  sym: string;
  name: string;
  near: number | null;
  far: number | null;
  nearDays: number | null;
  confidence: number | null;
  stance: string | null;
  obscurity: number;
  logoUrl: string | null;
};

function IdeaRow({ idea }: { idea: Idea }) {
  const sm = stanceMeta(idea.stance);
  return (
    <li className="px-3 py-2.5">
      <div className="flex items-center gap-3">
        <StockLogo symbol={idea.sym} logoUrl={idea.logoUrl} className="h-8 w-8 text-[11px]" />
        <div className="min-w-0">
          <Link href={`/stocks/${idea.sym}`} className="font-semibold text-teal-200 hover:underline">
            {idea.sym}
          </Link>
          <div className="truncate text-xs text-teal-200/40">{idea.name}</div>
        </div>
        {idea.far !== null && (
          <div className="ml-auto text-right">
            <div className={`text-sm font-bold tabular-nums ${idea.far > 0 ? "text-emerald-400" : "text-red-400"}`}>
              {idea.far > 0 ? "+" : ""}
              {pct(idea.far, 0)}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-teal-200/40">
              <Term k="expected-return" align="right">12-mo</Term>
            </div>
          </div>
        )}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 pl-11 text-xs text-teal-200/50">
        {sm && (
          <span className={`font-bold ${STANCE_TONE_CLASSES[sm.tone].text}`} title={`GRQ's call: ${sm.blurb}`}>
            {sm.label}
          </span>
        )}
        {idea.near !== null && (
          <span>
            near{idea.nearDays ? ` ~${Math.max(1, Math.round(idea.nearDays / 5))}w` : ""}{" "}
            <span className={idea.near > 0 ? "text-emerald-400" : "text-red-400"}>
              {idea.near > 0 ? "+" : ""}
              {pct(idea.near, 0)}
            </span>
          </span>
        )}
        {idea.far !== null && <span>≈ {signedMoney(Math.round(idea.far * 100_000))} on $1k</span>}
        {idea.confidence != null && <span>conf {idea.confidence}%</span>}
      </div>
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

  const [pf, plan, eod, weekly, entries, dayOpenSnap, todaySnaps, quoteRows, universeRows, watchlist, dossiers, latestPlan, latestResearch, ideaRows, marketNews, marketGainers] =
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
      prisma.agentFocus.findMany({ orderBy: { addedAt: "desc" } }),
      prisma.journalEntry.findMany({
        where: { kind: "RESEARCH", title: { startsWith: "Dossier" }, at: { gte: start, lt: end }, symbol: { not: null } },
        orderBy: { at: "desc" },
        take: 8,
      }),
      prisma.journalEntry.findFirst({ where: { kind: "RESEARCH", title: { startsWith: "Game plan" } }, orderBy: { at: "desc" } }),
      prisma.journalEntry.findFirst({ where: { kind: "RESEARCH" }, orderBy: { at: "desc" } }),
      prisma.journalEntry.findMany({
        where: {
          kind: "RESEARCH",
          title: { startsWith: "Dossier" },
          symbol: { not: null },
          OR: [{ targetNearCents: { not: null } }, { targetFarCents: { not: null } }],
        },
        orderBy: { at: "desc" },
        take: 40,
      }),
      fmpEnabled() ? fmpNews(6).catch(() => []) : Promise.resolve([]),
      fmpEnabled() ? fmpGainers().catch(() => []) : Promise.resolve([]),
    ]);
  const funFact = funFactOfDay();
  const timeline = entries.filter((e) => e.id !== plan?.id);

  // GRQ's call per tracked name (latest dossier stance) — shown on movers.
  const stanceRows = await prisma.journalEntry.findMany({
    where: { stance: { not: null }, symbol: { not: null } },
    orderBy: { at: "desc" },
    select: { symbol: true, stance: true },
  });
  const stanceBy = new Map<string, string>();
  for (const s of stanceRows) if (s.symbol && !stanceBy.has(s.symbol)) stanceBy.set(s.symbol, s.stance as string);
  // The lead adapts by edition and is never empty: today's midday brief (the
  // afternoon read), else today's plan, else the most recent plan/research.
  const middayBrief = await prisma.journalEntry.findFirst({
    where: { kind: "RESEARCH", title: { startsWith: "Midday brief" }, at: { gte: start, lt: end } },
  });
  const leadEntry = middayBrief ?? plan ?? latestPlan ?? latestResearch;

  const dayOpenNav = dayOpenSnap?.navCents ?? pf.contributionsCents;
  const dayPnl = pf.navCents - dayOpenNav;
  const dayPnlPct = dayOpenNav > 0 ? dayPnl / dayOpenNav : 0;

  const tape = todaySnaps.map((s) => s.navCents);
  if (dayOpenSnap) tape.unshift(dayOpenSnap.navCents);

  const nameBy = new Map(universeRows.map((u) => [u.symbol, u.name]));
  const logoBy = new Map(universeRows.map((u) => [u.symbol, u.logoUrl]));
  const sectorBy = new Map(universeRows.map((u) => [u.symbol, u.sector]));
  const movers = quoteRows
    .filter((q) => nameBy.has(q.symbol))
    .map((q) => ({ symbol: q.symbol, name: nameBy.get(q.symbol) ?? q.symbol, midCents: q.midCents, dayBps: q.dayChangeBps, logoUrl: logoBy.get(q.symbol) ?? null, stance: stanceBy.get(q.symbol) ?? null }))
    .sort((a, b) => b.dayBps - a.dayBps);
  const gainers = movers.filter((m) => m.dayBps > 0).slice(0, 5);
  const losers = movers.filter((m) => m.dayBps < 0).slice(-5).reverse();

  // Industry breakdown — average day move per sector across tracked names.
  const sectorAcc = new Map<string, { sum: number; n: number }>();
  for (const q of quoteRows) {
    const sec = sectorBy.get(q.symbol);
    if (!sec) continue;
    const e = sectorAcc.get(sec) ?? { sum: 0, n: 0 };
    e.sum += q.dayChangeBps;
    e.n += 1;
    sectorAcc.set(sec, e);
  }
  const sectors = [...sectorAcc.entries()]
    .map(([name, { sum, n }]) => ({ name, avgBps: Math.round(sum / n), n }))
    .sort((a, b) => b.avgBps - a.avgBps);

  const hitters = [...pf.positions].sort((a, b) => Math.abs(b.dayChangeBps) - Math.abs(a.dayChangeBps));

  // On the radar: the agent's focus first, then today's dossier'd names not already shown.
  const seen = new Set(watchlist.map((w) => w.symbol));
  const radar = [
    ...watchlist.map((w) => ({ symbol: w.symbol, note: "agent watching", tone: "teal" as const, logoUrl: logoBy.get(w.symbol) ?? null })),
    ...dossiers
      .filter((d) => d.symbol && !seen.has(d.symbol))
      .map((d) => ({
        symbol: d.symbol as string,
        note: d.confidence != null ? `dossier · ${d.confidence}%` : "dossier",
        tone: "dim" as const,
        logoUrl: logoBy.get(d.symbol as string) ?? null,
      })),
  ].slice(0, 8);

  // Ideas with upside — the latest dossier-with-a-target per symbol, priced live.
  // Ranked "stocks you haven't heard of" first (candidates/mid-caps over household names).
  const priceBy = new Map(quoteRows.map((q) => [q.symbol, q.midCents]));
  const tierBy = new Map(universeRows.map((u) => [u.symbol, u.tier]));
  const HOUSEHOLD = new Set(["RY", "TD", "BNS", "BMO", "CM", "NA", "ENB", "SHOP", "CNR", "CP", "BCE", "T", "SU", "CNQ", "XIC", "XIU", "BN", "ATD", "CSU"]);
  const ideaSeen = new Set<string>();
  const ideas: Idea[] = ideaRows
    .filter((d) => {
      if (!d.symbol || ideaSeen.has(d.symbol)) return false;
      ideaSeen.add(d.symbol);
      return true;
    })
    .map((d) => {
      const sym = d.symbol as string;
      const cur = priceBy.get(sym) ?? null;
      const tier = tierBy.get(sym) ?? null;
      return {
        sym,
        name: nameBy.get(sym) ?? sym,
        near: cur && d.targetNearCents ? (d.targetNearCents - cur) / cur : null,
        far: cur && d.targetFarCents ? (d.targetFarCents - cur) / cur : null,
        nearDays: d.targetNearDays ?? null,
        confidence: d.confidence,
        stance: d.stance ?? null,
        obscurity: HOUSEHOLD.has(sym) ? 3 : tier === "etf" || tier === "large" ? 2 : tier === "mid" ? 1 : 0,
        logoUrl: logoBy.get(sym) ?? null,
      };
    })
    .sort((a, b) => a.obscurity - b.obscurity || (b.far ?? -9) - (a.far ?? -9))
    .slice(0, 6);

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
            <div className="text-[10px] uppercase tracking-wider text-teal-200/40">
              <Term k="nav" align="right">Net asset value</Term>
            </div>
            <div className="text-3xl font-bold tabular-nums text-teal-50">{money(pf.navCents)}</div>
            <div className="text-sm">
              <Pnl cents={dayPnl} />{" "}
              <span className="text-teal-200/50">
                ({signedPct(Math.round(dayPnlPct * 10_000))} <Term k="day-pnl" align="right">today</Term>)
              </span>
            </div>
          </div>
        </div>
        <p className="mt-3 border-t border-teal-400/10 pt-3 text-sm italic text-teal-200/60">{dailyQuote(anchor)}</p>
      </header>

      {/* Headlines — today's news, at the top of the page (Graham 2026-06-16) */}
      {marketNews.length > 0 && (
        <section className="mb-6">
          <SectionTitle>Headlines · what&apos;s moving the market today</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-3">
            {marketNews.slice(0, 3).map((n, i) => (
              <a
                key={i}
                href={n.url || "#"}
                target="_blank"
                rel="noreferrer"
                className="group block overflow-hidden rounded-2xl border border-[color:var(--card-border)] bg-[var(--card-bg)]"
              >
                {n.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={n.image} alt="" className="h-36 w-full object-cover transition-opacity group-hover:opacity-90" />
                ) : (
                  <div className="flex h-36 w-full items-center justify-center bg-teal-400/5 text-3xl">📰</div>
                )}
                <div className="p-3">
                  <div className="text-sm font-semibold leading-snug text-teal-50 group-hover:text-teal-200">{n.title}</div>
                  <div className="mt-1 text-[11px] text-teal-200/40">
                    {n.publisher}
                    {n.at ? ` · ${n.at.slice(0, 10)}` : ""}
                  </div>
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* The Tape — the day's NAV, start → finish */}
      <Card className="mb-6 p-5">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-teal-200/50">
            <Term k="the-tape">The Tape</Term> · the day&apos;s NAV
          </span>
          <span className="text-xs text-teal-200/40">
            opened {money(dayOpenNav)} → {isToday ? "now" : "close"} {money(pf.navCents)}{" "}
            <span className={dayClass(dayPnl)}>({signedMoney(dayPnl)})</span>
            {pf.benchmarkCents !== null && (
              <>
                {" · "}
                <Term k="vs-xic" align="right">vs XIC</Term>{" "}
                <span className={dayClass(pf.navCents - pf.benchmarkCents)}>{signedMoney(pf.navCents - pf.benchmarkCents)}</span>
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

      {/* Lead story — FULL WIDTH so the game plan is big & readable (Graham 2026-06-16) */}
      <section className="mb-8">
        <SectionTitle>{eod ? "The Close" : plan ? "Today's Lead · game plan" : "From the desk"}</SectionTitle>
        <Card className="p-6">
          {eod ? (
            <>
              <div className="mb-2 text-xl font-semibold text-teal-50">{eod.title}</div>
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
              <CollapsibleMd text={eod.body} threshold={100000} />
            </>
          ) : leadEntry ? (
            <>
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <span className="text-xl font-semibold text-teal-50">{leadEntry.title}</span>
                {etDateStr(leadEntry.at) !== dateStr && (
                  <span className="shrink-0 text-xs text-teal-200/40">{fmtWhen(leadEntry.at)}</span>
                )}
              </div>
              <div className="text-[15px] leading-relaxed">
                <CollapsibleMd text={leadEntry.body} threshold={100000}>
                  <Sources sourcesJson={leadEntry.sourcesJson} />
                </CollapsibleMd>
              </div>
            </>
          ) : (
            <p className="text-sm text-teal-200/40">
              {isToday
                ? "Quiet so far — the agent's morning research lands around 9:00 ET on market days."
                : "No report filed this day (weekend, holiday, or pre-agent era)."}
            </p>
          )}
        </Card>
      </section>

      {/* Market Movers — our tracked names */}
      <section className="mt-8">
        <SectionTitle>Market Movers · our tracked names</SectionTitle>
        <Card className="overflow-hidden p-1">
          {isToday && (gainers.length > 0 || losers.length > 0) ? (
            <ul className="grid gap-x-6 sm:grid-cols-2">
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
      </section>

      {/* Today's biggest movers — the whole market */}
      {marketGainers.length > 0 && (
        <section className="mt-8">
          <SectionTitle>Today&apos;s biggest movers · the whole market</SectionTitle>
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {marketGainers.map((m) => {
                  const inUniverse = universeRows.some((u) => u.symbol === m.symbol);
                  return (
                    <tr key={m.symbol} className="border-t border-teal-400/10 first:border-t-0">
                      <td className="px-4 py-2">
                        {inUniverse ? (
                          <Link href={`/stocks/${m.symbol}`} className="font-bold text-teal-300 hover:underline">
                            {m.symbol}
                          </Link>
                        ) : (
                          <span className="font-bold text-teal-200">{m.symbol}</span>
                        )}
                        <span className="ml-2 text-xs text-teal-200/50">{m.name}</span>
                        <span className="ml-1 text-[10px] uppercase tracking-wider text-teal-200/30">{m.exchange}</span>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-teal-100/70">{money(m.priceCents)}</td>
                      <td className="px-4 py-2 text-right font-semibold tabular-nums text-emerald-400">+{pct(m.changePct, 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
          <p className="mt-2 text-[10px] text-teal-200/40">Biggest gainers across the market today (FMP) — names we track link through.</p>
        </section>
      )}

      {/* Industry breakdown — how sectors are moving today (Graham 2026-06-16) */}
      {sectors.length > 0 && (
        <section className="mt-8">
          <SectionTitle>By industry · how sectors are moving</SectionTitle>
          <Card className="overflow-hidden p-1">
            <ul className="divide-y divide-teal-400/10">
              {sectors.map((s) => (
                <li key={s.name} className="flex items-center gap-3 px-3 py-2">
                  <span className="font-semibold text-teal-100/80">{s.name}</span>
                  <span className="text-[10px] uppercase tracking-wider text-teal-200/30">
                    {s.n} {s.n === 1 ? "name" : "names"}
                  </span>
                  <span className={`ml-auto text-sm font-bold tabular-nums ${dayClass(s.avgBps)}`}>{signedPct(s.avgBps)}</span>
                </li>
              ))}
            </ul>
          </Card>
          <p className="mt-2 px-1 text-[10px] text-teal-200/40">Average move today across the names we track, grouped by sector.</p>
        </section>
      )}

      {/* Financial-literacy fun fact */}
      <section className="mt-8">
        <Card className="flex items-start gap-3 p-5">
          <span className="text-2xl leading-none">💡</span>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-teal-300/70">Did you know?</div>
            <p className="mt-1 text-sm text-teal-100/80">{funFact}</p>
          </div>
        </Card>
      </section>

      {/* Top Hitters + On the Radar */}
      <section className="mt-8 grid items-start gap-6 lg:grid-cols-2">
        <div>
          <SectionTitle>Top Hitters · your holdings</SectionTitle>
          <Card className="overflow-hidden p-1">
            {hitters.length > 0 ? (
              <ul className="divide-y divide-teal-400/10">
                {hitters.map((p) => (
                  <HitterRow key={p.symbol} p={p} logoUrl={logoBy.get(p.symbol) ?? null} />
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
          <SectionTitle>On the Radar · ideas with upside</SectionTitle>
          <Card className="overflow-hidden p-1">
            {ideas.length > 0 ? (
              <ul className="divide-y divide-teal-400/10">
                {ideas.map((idea) => (
                  <IdeaRow key={idea.sym} idea={idea} />
                ))}
              </ul>
            ) : radar.length > 0 ? (
              <ul className="divide-y divide-teal-400/10">
                {radar.map((r) => (
                  <RadarRow key={r.symbol} symbol={r.symbol} note={r.note} tone={r.tone} logoUrl={r.logoUrl} />
                ))}
              </ul>
            ) : (
              <p className="p-3 text-sm text-teal-200/40">Nothing yet — the agent's dossiers populate this.</p>
            )}
          </Card>
          <p className="mt-2 px-1 text-[10px] text-teal-200/40">
            {ideas.length > 0
              ? "names you may not know, first · the agent's targets are hypotheses, not promises — a track record builds as they resolve"
              : "expected upside appears here once the agent files dossiers with price targets (it's re-running them now)"}
          </p>
        </div>
      </section>

      {/* This morning's plan (kept available even when the close is the lead) */}
      {eod && plan && (
        <section className="mt-8">
          <SectionTitle>This morning's game plan</SectionTitle>
          <Card className="p-5">
            <CollapsibleMd text={plan.body} threshold={100000}>
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
