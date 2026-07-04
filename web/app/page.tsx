import Link from "next/link";
import { prisma } from "@/lib/db";
import { getPortfolio, PAPER_INCEPTION, type PositionView } from "@/lib/portfolio";
import { allUniverse } from "@/lib/universe";
import { startOfEtDay, etDateStr, etParts, isMarketDay, isMarketOpen } from "@/agent/calendar";
import { money, signedMoney, pct } from "@/lib/money";
import { Card, Chip, Pnl, SectionHeader } from "@/components/ui";
import CollapsibleMd from "@/components/CollapsibleMd";
import StockLogo from "@/components/StockLogo";
import EarningBubble, { type EarnView } from "@/components/EarningBubble";
import Term from "@/components/Term";
import { stanceMeta, STANCE_TONE_CLASSES } from "@/lib/stance";
import { fmpEnabled, fmpGainers, fmpIndices, fmpCadUsd, fmpProfile, fmpEarningsCalendar, stripSuffix, type EarningsCalRow } from "@/lib/fmp";
import { todayHeadlines, type NewsCard } from "@/lib/news/queries";
import { SentimentDot } from "@/components/NewsList";
import NewsTouches from "@/components/NewsTouches";
import MarketIndices from "@/components/MarketIndices";
import { LiveQuotesProvider } from "@/components/LiveQuotes";
import { LiveMoverPrice } from "@/components/LiveTableCells";
import { funFactOfDay } from "@/lib/funfacts";
import { dailyQuote } from "@/lib/dailyquote";
import { getMacro, macroLine } from "@/lib/macro";

function signedPct(bps: number): string {
  return `${bps > 0 ? "+" : ""}${pct(bps / 10_000, 2)}`;
}

function dayClass(bps: number): string {
  return bps > 0 ? "text-emerald-400" : bps < 0 ? "text-red-400" : "text-teal-200/50";
}

// Section headers live in the shared kit now — <SectionHeader size="lg" sub="…"> (components/ui.tsx),
// promoted from this page's local SectionTitle/SectionSub when Portfolio adopted the same
// style (Cam 2026-07-03). Title dominates; `sub` is the lighter trailing descriptor.

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
          title={`Alfred's call: ${sm.label} — ${sm.blurb}`}
        >
          {sm.abbr}
        </span>
      )}
      <LiveMoverPrice symbol={symbol} initialCents={midCents} initialBps={dayBps} />
    </li>
  );
}

// Compact single-line row (Cam 2026-07-03: the Our-market / whole-market sections read
// oversized next to the rest of the page — small logo, one line, 11–13px type).
function HitterRow({ p, logoUrl }: { p: PositionView; logoUrl: string | null }) {
  return (
    <li className="flex items-center gap-2 px-2.5 py-1.5 text-[13px]">
      <StockLogo symbol={p.symbol} logoUrl={logoUrl} className="h-5 w-5 text-[8px]" />
      <Link href={`/stocks/${p.symbol}`} className="font-semibold text-teal-200 hover:underline">
        {p.symbol}
      </Link>
      <span className="min-w-0 flex-1 truncate text-[11px] text-teal-200/40">
        {p.qty} sh · {money(p.marketValueCents)}
      </span>
      <span className={`tabular-nums text-[11px] ${dayClass(p.dayChangeBps)}`}>{signedPct(p.dayChangeBps)}</span>
      <Pnl cents={p.unrealizedPnlCents} className="w-20 text-right tabular-nums text-[11px]" />
    </li>
  );
}

// A tracked-name mover in the SAME compact format as HitterRow — symbol + name on one line,
// day move + price on the right (no P&L, since these aren't held).
function MoverHitterRow({ symbol, name, midCents, dayBps, logoUrl }: { symbol: string; name: string; midCents: number; dayBps: number; logoUrl: string | null }) {
  return (
    <li className="flex items-center gap-2 px-2.5 py-1.5 text-[13px]">
      <StockLogo symbol={symbol} logoUrl={logoUrl} className="h-5 w-5 text-[8px]" />
      <Link href={`/stocks/${symbol}`} className="font-semibold text-teal-200 hover:underline">
        {symbol}
      </Link>
      <span className="min-w-0 flex-1 truncate text-[11px] text-teal-200/40">{name}</span>
      <span className={`tabular-nums text-[11px] ${dayClass(dayBps)}`}>{signedPct(dayBps)}</span>
      <span className="w-20 text-right tabular-nums text-[11px] text-teal-100/70">{money(midCents)}</span>
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
          <span className={`font-bold ${STANCE_TONE_CLASSES[sm.tone].text}`} title={`Alfred's call: ${sm.blurb}`}>
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

function fmtEarnDate(d: string): string {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}
function relDay(d: string, today: string): string {
  const n = Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n < 0 ? `${-n}d ago` : `in ${n}d`;
}

// The reported-earnings bubble moved to components/EarningBubble.tsx (a client component) so a
// card click can EXPAND it in place — the watchlist row-expand interaction — into the captured
// report numbers (EPS/revenue vs estimate + surprise). The `EarnView` shape lives there too.

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
  // (Day-to-day archive navigation removed — Cam 2026-07-03. A ?d= URL still renders
  // an archived day; there's just no on-page way to page through them.)
  // Earnings calendar window: a week back (so just-reported names linger) → two
  // weeks ahead (the upcoming docket). Today-only, like the other live panels.
  const earnFrom = etDateStr(new Date(start.getTime() - 7 * 24 * 60 * 60 * 1000));
  const earnTo = etDateStr(new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000));
  const dayLabel = anchor.toLocaleDateString("en-CA", {
    timeZone: "America/Toronto",
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const [pf, weekly, dayOpenSnap, quoteRows, universeRows, watchlist, dossiers, ideaRows, marketNews, marketGainers, marketIndices, marketCadUsd, macro, earnCal] =
    await Promise.all([
      getPortfolio(),
      prisma.report.findFirst({ where: { kind: "WEEKLY", date: { gte: start, lt: end } } }),
      prisma.navSnapshot.findFirst({ where: { at: { lt: start, gte: PAPER_INCEPTION } }, orderBy: { at: "desc" } }),
      prisma.quote.findMany(),
      allUniverse(),
      prisma.agentFocus.findMany({ orderBy: { addedAt: "desc" } }),
      prisma.journalEntry.findMany({
        where: { kind: "RESEARCH", title: { startsWith: "Dossier" }, at: { gte: start, lt: end }, symbol: { not: null } },
        orderBy: { at: "desc" },
        take: 8,
      }),
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
      isToday ? todayHeadlines(12).catch(() => [] as NewsCard[]) : Promise.resolve([] as NewsCard[]),
      fmpEnabled() ? fmpGainers().catch(() => []) : Promise.resolve([]),
      fmpEnabled() ? fmpIndices().catch(() => []) : Promise.resolve([]),
      isToday && fmpEnabled() ? fmpCadUsd().catch(() => null) : Promise.resolve(null),
      getMacro().catch(() => null),
      isToday && fmpEnabled() ? fmpEarningsCalendar(earnFrom, earnTo).catch(() => [] as EarningsCalRow[]) : Promise.resolve([] as EarningsCalRow[]),
    ]);
  // Per-mover detail for the expandable whole-market movers (best-effort).
  const gainerProfiles = await Promise.all(
    marketGainers.map((g) => (fmpEnabled() ? fmpProfile(g.symbol).catch(() => null) : Promise.resolve(null))),
  );
  const profileBy = new Map(marketGainers.map((g, i) => [g.symbol, gainerProfiles[i]]));

  // Auto-research today's biggest movers so each links to a real, clickable page.
  // The whole-market gainers aren't in our universe; queue a dossier for any we
  // haven't already researched or queued, and the agent fills in the stock page.
  // Idempotent — Today re-renders every load, so skip names already known.
  if (isToday && marketGainers.length > 0) {
    const tracked = new Set(universeRows.map((u) => u.symbol));
    const fresh = marketGainers.map((m) => m.symbol).filter((s) => !tracked.has(s));
    if (fresh.length > 0) {
      const [haveReq, haveJournal] = await Promise.all([
        prisma.researchRequest.findMany({ where: { symbol: { in: fresh } }, select: { symbol: true } }),
        prisma.journalEntry.findMany({ where: { symbol: { in: fresh } }, select: { symbol: true } }),
      ]);
      const known = new Set([...haveReq, ...haveJournal].map((r) => r.symbol));
      const toQueue = fresh.filter((s) => !known.has(s));
      if (toQueue.length > 0) {
        await prisma.researchRequest.createMany({
          data: toQueue.map((symbol) => ({ symbol, requestedBy: "movers" })),
        });
      }
    }
  }

  const funFact = funFactOfDay();
  const dailyQ = await dailyQuote(anchor);

  // Alfred's call per tracked name (latest dossier stance) — shown on movers.
  const stanceRows = await prisma.journalEntry.findMany({
    where: { stance: { not: null }, symbol: { not: null } },
    orderBy: { at: "desc" },
    select: { symbol: true, stance: true },
  });
  const stanceBy = new Map<string, string>();
  for (const s of stanceRows) if (s.symbol && !stanceBy.has(s.symbol)) stanceBy.set(s.symbol, s.stance as string);

  // Flat on non-trading days — NAV is frozen at the last close, so "today" is $0 rather than
  // the prior session's last-snapshot→close drift shown as a phantom move (Cam, 2026-06-21).
  const marketDay = isMarketDay(anchor);
  const marketOpenNow = isMarketOpen(); // for the live badge — only meaningful on the live "today" view
  const dayOpenNav = dayOpenSnap?.navCents ?? pf.contributionsCents;
  const dayPnl = marketDay ? pf.navCents - dayOpenNav : 0;
  const dayPnlPct = marketDay && dayOpenNav > 0 ? dayPnl / dayOpenNav : 0;

  // The Tape moved to the Portfolio page (Cam 2026-07-02) — it now lives above Alfred's positions.

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
  // Market movers (tracked names) — biggest movers either way, capped to the SAME count as Top
  // Hitters so the two lists sit level beside each other (Cam 2026-07-02).
  const topMovers = [...movers].sort((a, b) => Math.abs(b.dayBps) - Math.abs(a.dayBps)).slice(0, hitters.length || 6);
  // (The old side-by-side row-count leveling is gone — the rail panels scroll instead.)

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

  // Earnings on the docket — filter the bulk calendar down to our universe∪watchlist.
  // Match on the bare ticker (FMP lists TSX names suffixed, e.g. RY.TO) so a name
  // resolves whether the calendar carries the .TO or the US listing. Universe wins
  // over a watchlist-only stub (richer name/logo).
  // Map the FMP calendar's bare market ticker → our entry. Match on the *yahoo*
  // ticker (the real listing — AMD.US is stored with yahoo "AMD"), because the
  // internal symbol carries a ".US" tag the calendar never uses. Skip RETIRED
  // duplicates (the dead CDR shells) so a US name resolves to its live entry, not
  // a "...CDR (CAD HEDGED)" husk — but keep anything explicitly on the watchlist.
  const dayBpsBy = new Map(quoteRows.map((q) => [q.symbol, q.dayChangeBps]));
  const uBySymbol = new Map(universeRows.map((u) => [u.symbol, u]));
  const watchedSyms = new Set(watchlist.map((w) => w.symbol));
  const STATUS_RANK: Record<string, number> = { ACTIVE: 0, CANDIDATE: 1, RETIRED: 2 };
  const bareToName = new Map<string, { symbol: string; name: string; logoUrl: string | null; rank: number }>();
  const considerEarn = (symbol: string, name: string, logoUrl: string | null, yahoo: string, status: string) => {
    const key = stripSuffix(yahoo || symbol).toUpperCase();
    const rank = STATUS_RANK[status] ?? 3;
    const cur = bareToName.get(key);
    if (!cur || rank < cur.rank) bareToName.set(key, { symbol, name, logoUrl, rank });
  };
  for (const u of universeRows) {
    if (u.status === "RETIRED" && !watchedSyms.has(u.symbol)) continue;
    considerEarn(u.symbol, u.name, u.logoUrl, u.yahoo, u.status);
  }
  // Watchlist names with no universe row to resolve a yahoo — match on the symbol.
  for (const w of watchlist) {
    if (uBySymbol.has(w.symbol)) continue;
    considerEarn(w.symbol, nameBy.get(w.symbol) ?? w.symbol, logoBy.get(w.symbol) ?? null, w.symbol, "CANDIDATE");
  }
  const earnSeen = new Set<string>();
  const earnMatched: EarnView[] = [];
  for (const r of earnCal) {
    const hit = bareToName.get(stripSuffix(r.symbol).toUpperCase());
    if (!hit) continue;
    const key = `${hit.symbol}|${r.date}`;
    if (earnSeen.has(key)) continue;
    earnSeen.add(key);
    earnMatched.push({ ...r, symbol: hit.symbol, name: hit.name, logoUrl: hit.logoUrl, dayBps: dayBpsBy.get(hit.symbol) ?? null });
  }
  // Reported (actuals filed) vs upcoming (no actuals, still to come) — the same
  // split the stock-page dossier uses.
  const recentEarn = earnMatched
    .filter((e) => e.epsActual != null || e.revenueActual != null)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);
  const upcomingEarn = earnMatched
    .filter((e) => e.date >= todayStr && e.epsActual == null && e.revenueActual == null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 12); // the strip is 6 tiles per row — two rows max before the window runs out
  const hasEarnings = recentEarn.length > 0 || upcomingEarn.length > 0;

  // The daily market brief — latest edition (PM after 6pm, else AM) for the viewed date. The
  // single paragraph under Headlines. Written by Alfred at ~7:30 AM + ~6:00 PM ET (runMarketBrief).
  const marketBrief = await prisma.marketBrief
    .findFirst({ where: { date: dateStr }, orderBy: { createdAt: "desc" } })
    .catch(() => null);

  const edition = isToday ? editionLabel() : "Archive";

  return (
    <main>
      {/* Masthead */}
      <header className="mb-6 border-b-2 border-teal-400/30 pb-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-3xl font-black uppercase tracking-tight text-teal-50">GRQ Daily</div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.3em] text-teal-300/70">
              {edition} · {dayLabel}
            </div>
          </div>
          <div className="text-right text-sm">
            {isToday && (
              <div className="mb-1 flex items-center justify-end gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${marketOpenNow ? "animate-pulse bg-emerald-400" : "bg-teal-200/30"}`} />
                <span
                  className={`text-[10px] font-semibold uppercase tracking-[0.15em] ${marketOpenNow ? "text-emerald-300/80" : "text-teal-200/50"}`}
                >
                  {marketOpenNow ? "Market open" : "Market closed"}
                </span>
              </div>
            )}
            {marketDay ? (
              <>
                <Pnl cents={dayPnl} />{" "}
                <span className="text-teal-200/50">
                  ({signedPct(Math.round(dayPnlPct * 10_000))} <Term k="day-pnl" align="right">today</Term>)
                </span>
              </>
            ) : (
              <span className="text-teal-200/60">
                Flat · <span className="uppercase tracking-wide text-teal-300/70">markets closed</span>
              </span>
            )}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4 border-t border-teal-400/10 pt-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm italic text-teal-200/60">{dailyQ}</p>
            <p className="mt-2 text-xs text-teal-100/70">
              <span className="font-semibold uppercase tracking-[0.15em] text-teal-300/70">Did you know?</span>{" "}
              {funFact}
            </p>
          </div>
          {/* The loonie, where the day-nav pills used to be (Cam 2026-07-03): what CA$1
              buys in USD right now — the fund holds both currencies. */}
          {marketCadUsd && (
            <div
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-teal-400/20 px-3 py-1.5 text-sm"
              title="The Canadian dollar in US dollars (CAD/USD) — what one loonie buys in USD. The fund holds both currencies, so this rate moves the CAD value of every US position."
            >
              <span aria-hidden>🇨🇦</span>
              <span className="tabular-nums text-teal-100/90">
                CA$1 = US${marketCadUsd.price.toFixed(4)}
              </span>
              <span aria-hidden>🇺🇸</span>
              <span
                className={`tabular-nums text-xs ${
                  marketCadUsd.changePct > 0 ? "text-emerald-400" : marketCadUsd.changePct < 0 ? "text-red-400" : "text-teal-200/50"
                }`}
              >
                {marketCadUsd.changePct >= 0 ? "+" : ""}
                {marketCadUsd.changePct.toFixed(2)}%
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Market indices ("GRQ today") + Macro run FULL page width above the grid (Cam 2026-07-04),
          so the rail's "Our market" starts level with Headlines. Live data, today only —
          archived days hide the stale ticker (Cam 2026-06-16). */}
      {isToday && <MarketIndices initial={marketIndices} initialFx={marketCadUsd} fundDayPct={marketDay ? dayPnlPct : null} />}

      {/* The Tape moved to the Portfolio page (Cam 2026-07-02) — above Alfred's positions. */}

      {/* Macro strip — rates/CPI/FX context (Cam 2026-06-26) */}
      {isToday && macro && (
        <div className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-teal-400/10 bg-teal-400/[0.02] px-4 py-2 text-xs text-teal-200/60">
          <span className="font-semibold uppercase tracking-wider text-teal-200/40">Macro</span>
          <span className="text-teal-100/70">{macroLine(macro)}</span>
          <span className="ml-auto text-teal-200/30">{macro.fedFunds != null ? "Bank of Canada · US FRED" : "Bank of Canada"} · as of {macro.asOf}</span>
        </div>
      )}

      {/* The right rail (was The Wire — removed from web Today, Cam 2026-07-03) carries
          "Our market" + "The whole market" stacked, fully expanded. On mobile the grid
          collapses to one column and the rail stacks below the main flow. */}
      <div className="grid gap-6 lg:grid-cols-4">
        <div className="min-w-0 lg:col-span-3">

      {/* Headlines — today's news. Live, so today only — archive hides stale headlines (Cam 2026-06-16) */}
      {isToday && marketNews.length > 0 && (
        <section className="mb-6">
          <SectionHeader size="lg" sub={<>· what&apos;s moving the market today</>}>Headlines</SectionHeader>
          <div className="grid gap-4 sm:grid-cols-3">
            {marketNews.slice(0, 3).map((n, i) => (
              <div key={i} className="flex flex-col gap-1.5">
              <a
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
                  <div className="flex items-start gap-1.5">
                    <span className="mt-1.5">
                      <SentimentDot sentiment={n.sentiment} />
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold leading-snug text-teal-50 group-hover:text-teal-200">{n.title}</div>
                      {n.summary ? <div className="mt-1 text-[12px] leading-snug text-teal-200/55">{n.summary}</div> : null}
                      <div className="mt-1 text-[11px] text-teal-200/40">
                        {n.publisher}
                        {n.at ? ` · ${n.at.slice(0, 10)}` : ""}
                      </div>
                    </div>
                  </div>
                </div>
              </a>
              <NewsTouches touches={n.touches} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* The Market Today — Alfred's daily brief paragraph, right under the headlines (Cam 2026-07-02).
          AM (~7:30 ET) + PM (~6:00 ET) editions; the latest for the day is shown. Market-wide, not the fund. */}
      {marketBrief && (
        <section className="mb-6">
          <SectionHeader size="lg" sub={<>· {marketBrief.edition === "PM" ? "evening read" : "morning read"}</>}>The Market Today</SectionHeader>
          <Card className="p-5">
            <p className="text-sm leading-relaxed text-teal-100/80">{marketBrief.body}</p>
            <p className="mt-2.5 text-[10px] text-teal-200/40">
              Alfred&apos;s read of the whole market · {marketBrief.edition === "PM" ? "evening" : "morning"} edition · {marketBrief.date}
            </p>
          </Card>
        </section>
      )}

      {/* Market pulse now renders at the BOTTOM of the page, under the movers (Cam 2026-07-02). */}

      {weekly && (
        <Card className="mb-6 border-teal-400/30 p-5">
          <div className="mb-2 flex items-center gap-3">
            <Chip tone="teal">weekly review</Chip>
            <span className="font-medium text-teal-50">{weekly.title}</span>
          </div>
          <CollapsibleMd text={weekly.body} threshold={1200} />
        </Card>
      )}

      {/* Earnings — above Top Hitters (Cam 2026-07-02). Who REPORTED gets the full width
          (bubbles always expanded); who's NEXT sits on its OWN row below — a wrapping strip
          of tiles, 8 per row (Cam 2026-07-03: "a new line… 8 wide, wrap if needed"). */}
      {isToday && hasEarnings && (
        <section className="mt-8">
          <SectionHeader size="lg" sub={<>· who reported, who&apos;s next</>}>
            <Term k="earnings">Earnings</Term>
          </SectionHeader>
          {/* Reported — summary bubbles, full width */}
          <div>
            <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-teal-200/50">Reported this week</div>
            {recentEarn.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {recentEarn.map((e) => (
                  <EarningBubble key={`r-${e.symbol}-${e.date}`} e={e} stance={stanceBy.get(e.symbol) ?? null} today={todayStr} />
                ))}
              </div>
            ) : (
              <Card className="p-4 text-sm text-teal-200/40">None of our names reported in the last week.</Card>
            )}
            <p className="mt-2 px-1 text-[10px] text-teal-200/40">
              earnings for names we track or watch · beat/miss is actual vs the analyst <Term k="eps">EPS</Term> estimate · the full report lives on the stock page
            </p>
          </div>
          {/* Upcoming — its own row: tiles 6-wide, wrapping (was 8 — Cam 2026-07-04: room for the company name under the ticker, matching the reported bubbles) */}
          <div className="mt-5">
            <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-teal-200/50">Upcoming reports</div>
            <Card className="overflow-hidden p-1.5">
              {upcomingEarn.length > 0 ? (
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
                  {upcomingEarn.map((e) => {
                    const soon = e.date === todayStr || relDay(e.date, todayStr) === "tomorrow";
                    return (
                      <Link
                        key={`u-${e.symbol}-${e.date}`}
                        href={`/stocks/${e.symbol}`}
                        className="group rounded-lg bg-teal-400/[0.04] px-2 py-1.5 hover:bg-teal-400/[0.08]"
                      >
                        <span className="flex items-center gap-1.5">
                          <StockLogo symbol={e.symbol} logoUrl={e.logoUrl} className="h-5 w-5 text-[8px]" />
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-semibold text-teal-200 group-hover:underline">
                              {e.symbol}
                            </span>
                            <span className="block truncate text-[10px] text-teal-200/40">{e.name}</span>
                          </span>
                        </span>
                        <span className="mt-0.5 flex items-baseline justify-between gap-1">
                          <span className={`text-[11px] font-semibold ${soon ? "text-amber-300" : "text-teal-200/60"}`}>
                            {relDay(e.date, todayStr)}
                          </span>
                          <span className="text-[9px] text-teal-200/40">{fmtEarnDate(e.date)}</span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <p className="p-3 text-xs text-teal-200/40">Nothing scheduled in the next two weeks.</p>
              )}
            </Card>
            <p className="mt-2 px-1 text-[10px] text-teal-200/40">the next earnings reports on the calendar</p>
          </div>
        </section>
      )}

      {/* Top hitters (your holdings) + market movers (tracked names) under ONE consolidated title,
          mirroring "The whole market" below — small per-column labels, matched row format + count
          (Cam 2026-07-03). Movers are today-only; on an archived day only the hitters column shows
          (its numbers are the snapshot's). */}
      {/* "Our market" + "The whole market" moved to the right rail (Cam 2026-07-03) — see the aside. */}

      {/* Live market data below — today only; archived days hide it (stale otherwise) (Cam 2026-06-16) */}
      {isToday && (
        <>
      {/* Market pulse — the rest of the day's headlines, at the BOTTOM under the movers (Cam 2026-07-02). */}
      {marketNews.length > 3 && (
        <section className="mt-8">
          <SectionHeader size="lg" sub={<>· more headlines</>}>Market pulse</SectionHeader>
          <div className="grid gap-x-6 sm:grid-cols-3">
            {marketNews.slice(3, 12).map((n, i) => (
              <div key={i} className="border-t border-teal-400/10">
                <a href={n.url || "#"} target="_blank" rel="noreferrer" className="block py-2 hover:bg-teal-400/[0.03]">
                  <div className="flex items-start gap-1.5">
                    <span className="mt-1.5"><SentimentDot sentiment={n.sentiment} /></span>
                    <div className="min-w-0">
                      <div className="text-sm leading-snug text-teal-100/80">{n.title}</div>
                      {n.summary ? <div className="mt-0.5 text-[12px] leading-snug text-teal-200/55">{n.summary}</div> : null}
                      <div className="mt-0.5 text-[11px] text-teal-200/40">
                        {n.publisher}
                        {n.at ? ` · ${n.at.slice(0, 10)}` : ""}
                      </div>
                    </div>
                  </div>
                </a>
                {n.touches?.length ? <div className="pb-2"><NewsTouches touches={n.touches} /></div> : null}
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-teal-200/40">Headlines captured &amp; summarized by GRQ — context, not signals.</p>
        </section>
      )}
        </>
      )}

        </div>
        {/* The rail: Our market + The whole market, one above the other, each its own
            scroll panel (Cam 2026-07-03 — replaced The Wire on web). */}
        <aside className="space-y-8 lg:col-span-1">
          <section>
            <SectionHeader size="lg" sub={<>· your holdings{isToday ? <> &amp; the names we track</> : null}</>}>
              Our market
            </SectionHeader>
            <Card className="overflow-hidden p-1">
              <div className="px-1.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-teal-200/50">Top hitters</div>
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
              <p className="px-1.5 py-1.5 text-[10px] text-teal-200/40">the biggest moves in what the fund holds</p>
              {isToday && (
                <>
                  <div className="border-t border-teal-400/10 px-1.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-teal-200/50">
                    Market movers
                  </div>
                  {topMovers.length > 0 ? (
                    <ul className="divide-y divide-teal-400/10">
                      {topMovers.map((m) => (
                        <MoverHitterRow key={m.symbol} symbol={m.symbol} name={m.name} midCents={m.midCents} dayBps={m.dayBps} logoUrl={m.logoUrl} />
                      ))}
                    </ul>
                  ) : (
                    <p className="p-3 text-sm text-teal-200/40">No moves to report yet.</p>
                  )}
                  <p className="px-1.5 py-1.5 text-[10px] text-teal-200/40">
                    the biggest moves across the {universeRows.length} names we track
                  </p>
                </>
              )}
            </Card>
          </section>

          {isToday && (marketGainers.length > 0 || sectors.length > 0) && (
            <section>
              <SectionHeader size="lg" sub={<>· movers &amp; sectors</>}>
                The whole market
              </SectionHeader>
              <Card className="overflow-hidden p-1">
                {marketGainers.length > 0 && (
                  <>
                    <div className="px-1.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-teal-200/50">Biggest movers</div>
                    {marketGainers.map((m) => {
                      const inUniverse = universeRows.some((u) => u.symbol === m.symbol);
                      const prof = profileBy.get(m.symbol);
                      const cap =
                        prof && prof.marketCap > 0
                          ? prof.marketCap >= 1e9
                            ? `$${(prof.marketCap / 1e9).toFixed(0)}B`
                            : `$${Math.round(prof.marketCap / 1e6)}M`
                          : null;
                      return (
                        <details key={m.symbol} className="group border-t border-teal-400/10 first:border-t-0">
                          <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-1.5 text-[13px] hover:bg-teal-400/[0.03] [&::-webkit-details-marker]:hidden">
                            <span className="text-xs text-teal-200/30 transition-transform group-open:rotate-90">▸</span>
                            <Link href={`/stocks/${m.symbol}`} className="font-bold text-teal-300 hover:underline">
                              {m.symbol}
                            </Link>
                            <span className="min-w-0 flex-1 truncate text-[11px] text-teal-200/50">{m.name}</span>
                            <span className="font-semibold tabular-nums text-[11px] text-emerald-400">+{pct(m.changePct, 0)}</span>
                          </summary>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2.5 pb-2 pl-8 text-[11px] text-teal-200/55">
                            <span className="tabular-nums text-teal-100/70">{money(m.priceCents)}</span>
                            {prof?.sector && <span className="text-teal-200/70">{prof.sector}</span>}
                            {prof?.industry && <span>{prof.industry}</span>}
                            {cap && <span>cap {cap}</span>}
                            {prof?.country && <span>{prof.country}</span>}
                            <span className="uppercase tracking-wider text-teal-200/30">{m.exchange}</span>
                            {inUniverse && <span className="text-emerald-300/70">✓ in your universe</span>}
                            {!prof && <span className="text-teal-200/40">no extra detail available</span>}
                          </div>
                        </details>
                      );
                    })}
                    <p className="px-1.5 py-1.5 text-[10px] text-teal-200/40">
                      Biggest gainers across the market today (FMP) — each links to a GRQ page; the agent auto-researches the ones we don&apos;t yet track.
                    </p>
                  </>
                )}
                {sectors.length > 0 && (
                  <>
                    <div className="border-t border-teal-400/10 px-1.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-teal-200/50">By industry</div>
                    <ul className="divide-y divide-teal-400/10">
                      {sectors.map((s) => (
                        <li key={s.name} className="flex items-center gap-2 px-2.5 py-1.5">
                          <span className="text-[13px] font-semibold text-teal-100/80">{s.name}</span>
                          <span className="text-[10px] uppercase tracking-wider text-teal-200/30">
                            {s.n} {s.n === 1 ? "name" : "names"}
                          </span>
                          <span className={`ml-auto font-bold tabular-nums text-[13px] ${dayClass(s.avgBps)}`}>{signedPct(s.avgBps)}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="px-1.5 py-1.5 text-[10px] text-teal-200/40">Average move today across the names we track, grouped by sector.</p>
                  </>
                )}
              </Card>
            </section>
          )}
        </aside>
      </div>

    </main>
  );
}
