import Link from "next/link";
import { prisma } from "@/lib/db";
import { getPortfolio, PAPER_INCEPTION, type PositionView } from "@/lib/portfolio";
import { allUniverse } from "@/lib/universe";
import { startOfEtDay, etDateStr, etParts, isMarketDay } from "@/agent/calendar";
import { money, signedMoney, pct } from "@/lib/money";
import { Card, Chip, Pnl } from "@/components/ui";
import CollapsibleMd from "@/components/CollapsibleMd";
import PriceChart from "@/components/PriceChart";
import StockLogo from "@/components/StockLogo";
import Term from "@/components/Term";
import { stanceMeta, STANCE_TONE_CLASSES } from "@/lib/stance";
import { fmpEnabled, fmpNews, fmpGainers, fmpIndices, fmpProfile, fmpEarningsCalendar, stripSuffix, type EarningsCalRow } from "@/lib/fmp";
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
      <LiveMoverPrice symbol={symbol} initialCents={midCents} initialBps={dayBps} />
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

type EarnView = {
  symbol: string;
  name: string;
  logoUrl: string | null;
  date: string; // YYYY-MM-DD
  epsEstimated: number | null;
  epsActual: number | null;
  revenueEstimated: number | null;
  revenueActual: number | null;
  dayBps: number | null;
};

const fmtEps = (v: number | null) => (v == null ? "—" : `${v < 0 ? "−" : ""}$${Math.abs(v).toFixed(2)}`);
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

function EarningRow({ e, mode, today }: { e: EarnView; mode: "reported" | "upcoming"; today: string }) {
  // Beat/miss on the reported side — EPS first, revenue as the fallback.
  const beat =
    e.epsActual != null && e.epsEstimated != null
      ? e.epsActual >= e.epsEstimated
      : e.revenueActual != null && e.revenueEstimated != null
        ? e.revenueActual >= e.revenueEstimated
        : null;
  const soon = mode === "upcoming" && (e.date === today || relDay(e.date, today) === "tomorrow");
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <StockLogo symbol={e.symbol} logoUrl={e.logoUrl} className="h-8 w-8 text-[11px]" />
      <div className="min-w-0">
        <Link href={`/stocks/${e.symbol}`} className="font-semibold text-teal-200 hover:underline">
          {e.symbol}
        </Link>
        <div className="truncate text-xs text-teal-200/40">{e.name}</div>
      </div>
      <div className="ml-auto shrink-0 text-right">
        {mode === "reported" ? (
          <>
            <div className="flex items-center justify-end gap-1.5 tabular-nums">
              {beat != null && (
                <span className={`text-[10px] font-black ${beat ? "text-emerald-400" : "text-red-400"}`}>
                  {beat ? "beat ✓" : "miss ✗"}
                </span>
              )}
              {e.dayBps != null && <span className={`text-xs ${dayClass(e.dayBps)}`}>{signedPct(e.dayBps)}</span>}
            </div>
            <div className="text-[10px] text-teal-200/40">
              {fmtEarnDate(e.date)} · EPS {fmtEps(e.epsActual)} vs {fmtEps(e.epsEstimated)} est
            </div>
          </>
        ) : (
          <>
            <div className={`text-xs font-semibold tabular-nums ${soon ? "text-amber-300" : "text-teal-200/70"}`}>
              {relDay(e.date, today)}
            </div>
            <div className="text-[10px] text-teal-200/40">
              {fmtEarnDate(e.date)}
              {e.epsEstimated != null && ` · EPS est ${fmtEps(e.epsEstimated)}`}
            </div>
          </>
        )}
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

  const [pf, weekly, dayOpenSnap, todaySnaps, quoteRows, universeRows, watchlist, dossiers, ideaRows, marketNews, marketGainers, marketIndices, macro, earnCal] =
    await Promise.all([
      getPortfolio(),
      prisma.report.findFirst({ where: { kind: "WEEKLY", date: { gte: start, lt: end } } }),
      prisma.navSnapshot.findFirst({ where: { at: { lt: start, gte: PAPER_INCEPTION } }, orderBy: { at: "desc" } }),
      prisma.navSnapshot.findMany({ where: { at: { gte: start, lt: end } }, orderBy: { at: "asc" } }),
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
      fmpEnabled() ? fmpNews(12).catch(() => []) : Promise.resolve([]),
      fmpEnabled() ? fmpGainers().catch(() => []) : Promise.resolve([]),
      fmpEnabled() ? fmpIndices().catch(() => []) : Promise.resolve([]),
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

  // GRQ's call per tracked name (latest dossier stance) — shown on movers.
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
  const dayOpenNav = dayOpenSnap?.navCents ?? pf.contributionsCents;
  const dayPnl = marketDay ? pf.navCents - dayOpenNav : 0;
  const dayPnlPct = marketDay && dayOpenNav > 0 ? dayPnl / dayOpenNav : 0;

  // The tape as {t,c} points (ms epoch · navCents) so the interactive chart can show
  // the time + NAV of any point on hover — the same chart the stock pages use, in its
  // intraday mode, so a post-buy dip can be read off to the minute.
  const tapePts = todaySnaps.map((s) => ({ t: s.at.getTime(), c: s.navCents }));
  if (dayOpenSnap) tapePts.unshift({ t: dayOpenSnap.at.getTime(), c: dayOpenSnap.navCents });
  // Close the tape on the live NAV so a quiet day (sparse snapshots / market closed)
  // still draws open→now instead of a misleading flat line (Cam 2026-06-19).
  if (isToday && tapePts.length >= 1 && tapePts[tapePts.length - 1].c !== pf.navCents) {
    tapePts.push({ t: Date.now(), c: pf.navCents });
  }

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
    .slice(0, 8);
  const hasEarnings = recentEarn.length > 0 || upcomingEarn.length > 0;

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
            <p className="text-sm italic text-teal-200/60">{dailyQuote(anchor)}</p>
            <p className="mt-2 text-xs text-teal-100/70">
              <span className="font-semibold uppercase tracking-[0.15em] text-teal-300/70">Did you know?</span>{" "}
              {funFact}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-sm">
            <Link href={`/?d=${prev}`} className="rounded-lg border border-teal-400/20 px-3 py-1.5 text-teal-300 hover:bg-teal-400/10">
              ← {prev}
            </Link>
            {!isToday && (
              <Link href="/" className="rounded-lg border border-teal-400/20 px-3 py-1.5 text-teal-300 hover:bg-teal-400/10">
                today
              </Link>
            )}
            {dateStr < todayStr && (
              <Link href={`/?d=${next}`} className="rounded-lg border border-teal-400/20 px-3 py-1.5 text-teal-300 hover:bg-teal-400/10">
                {next} →
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Market indices — live until the close (the screenshot strip). Live data,
          so today only — archived days hide the stale ticker (Cam 2026-06-16) */}
      {isToday && <MarketIndices initial={marketIndices} />}

      {/* Macro strip — rates/CPI/FX context (moved here from Portfolio, Cam 2026-06-18) */}
      {isToday && macro && (
        <div className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-teal-400/10 bg-teal-400/[0.02] px-4 py-2 text-xs text-teal-200/60">
          <span className="font-semibold uppercase tracking-wider text-teal-200/40">Macro</span>
          <span className="text-teal-100/70">{macroLine(macro)}</span>
          <span className="ml-auto text-teal-200/30">{macro.fedFunds != null ? "Bank of Canada · US FRED" : "Bank of Canada"} · as of {macro.asOf}</span>
        </div>
      )}

      {/* The Tape — the day's NAV, start → finish. Above the headlines (Cam 2026-06-16) */}
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
        {tapePts.length >= 2 ? (
          <PriceChart mode="intraday" label="NAV" data={tapePts} currency="CAD" bare />
        ) : pf.positions.length > 0 ? (
          <p className="py-4 text-sm text-teal-200/40">
            Quiet tape — not enough NAV snapshots yet today; it fills in as the agent ticks through the session.
            The fund holds {pf.positions.length} position{pf.positions.length > 1 ? "s" : ""}, not cash.
          </p>
        ) : (
          <p className="py-4 text-sm text-teal-200/40">
            Flat line — the fund&apos;s parked in cash. The tape comes alive the day the agent takes a position.
          </p>
        )}
      </Card>

      {/* Headlines — today's news. Live, so today only — archive hides stale headlines (Cam 2026-06-16) */}
      {isToday && marketNews.length > 0 && (
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

      {/* Market pulse — more headlines, 3×3. Live, so today only (Cam 2026-06-16) */}
      {isToday && marketNews.length > 3 && (
        <section className="mb-6">
          <SectionTitle>Market pulse · more headlines</SectionTitle>
          <div className="grid gap-x-6 sm:grid-cols-3">
            {marketNews.slice(3, 12).map((n, i) => (
              <a
                key={i}
                href={n.url || "#"}
                target="_blank"
                rel="noreferrer"
                className="block border-t border-teal-400/10 py-2 hover:bg-teal-400/[0.03]"
              >
                <div className="text-sm leading-snug text-teal-100/80">{n.title}</div>
                <div className="mt-0.5 text-[11px] text-teal-200/40">
                  {n.publisher}
                  {n.at ? ` · ${n.at.slice(0, 10)}` : ""}
                </div>
              </a>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-teal-200/40">Latest market headlines via FMP — context, not signals.</p>
        </section>
      )}

      {weekly && (
        <Card className="mb-6 border-teal-400/30 p-5">
          <div className="mb-2 flex items-center gap-3">
            <Chip tone="teal">weekly review</Chip>
            <span className="font-medium text-teal-50">{weekly.title}</span>
          </div>
          <CollapsibleMd text={weekly.body} threshold={1200} />
        </Card>
      )}

      {/* Top Hitters + On the Radar — moved above the market movers (Cam 2026-06-16) */}
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

      {/* Earnings — recently reported (beat/miss) + upcoming, for names we track or watch (Cam 2026-06-25) */}
      {isToday && hasEarnings && (
        <section className="mt-8 grid items-start gap-6 lg:grid-cols-2">
          <div>
            <SectionTitle>Recently reported · <Term k="earnings">earnings</Term></SectionTitle>
            <Card className="overflow-hidden p-1">
              {recentEarn.length > 0 ? (
                <ul className="divide-y divide-teal-400/10">
                  {recentEarn.map((e) => (
                    <EarningRow key={`r-${e.symbol}-${e.date}`} e={e} mode="reported" today={todayStr} />
                  ))}
                </ul>
              ) : (
                <p className="p-3 text-sm text-teal-200/40">None of our names reported in the last week.</p>
              )}
            </Card>
          </div>
          <div>
            <SectionTitle>On the calendar · upcoming</SectionTitle>
            <Card className="overflow-hidden p-1">
              {upcomingEarn.length > 0 ? (
                <ul className="divide-y divide-teal-400/10">
                  {upcomingEarn.map((e) => (
                    <EarningRow key={`u-${e.symbol}-${e.date}`} e={e} mode="upcoming" today={todayStr} />
                  ))}
                </ul>
              ) : (
                <p className="p-3 text-sm text-teal-200/40">Nothing scheduled in the next two weeks.</p>
              )}
            </Card>
            <p className="mt-2 px-1 text-[10px] text-teal-200/40">
              earnings for the names we track or watch · <Term k="eps">EPS</Term> figures from FMP · beat/miss is the actual vs the analyst estimate
            </p>
          </div>
        </section>
      )}

      {/* Live market data below — today only; archived days hide it (stale otherwise) (Cam 2026-06-16) */}
      {isToday && (
        <>
      {/* Market Movers — our tracked names */}
      <section className="mt-8">
        <SectionTitle>Market Movers · our tracked names</SectionTitle>
        <Card className="overflow-hidden p-1">
          {gainers.length > 0 || losers.length > 0 ? (
            <LiveQuotesProvider symbols={[...gainers, ...losers].map((m) => m.symbol)}>
              <ul className="grid gap-x-6 sm:grid-cols-2">
                {gainers.map((m) => (
                  <MoverRow key={`g-${m.symbol}`} {...m} />
                ))}
                {losers.map((m) => (
                  <MoverRow key={`l-${m.symbol}`} {...m} />
                ))}
              </ul>
            </LiveQuotesProvider>
          ) : (
            <p className="p-3 text-sm text-teal-200/40">No moves to report yet.</p>
          )}
        </Card>
        <p className="mt-2 px-1 text-[10px] text-teal-200/40">biggest moves across the {universeRows.length} names we track</p>
      </section>

      {/* Biggest movers + industry breakdown, side by side (Graham 2026-06-16) */}
      {(marketGainers.length > 0 || sectors.length > 0) && (
      <div className="mt-8 grid items-start gap-6 lg:grid-cols-2">
      {marketGainers.length > 0 && (
        <section>
          <SectionTitle>Today&apos;s biggest movers · the whole market</SectionTitle>
          <Card className="overflow-hidden p-1">
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
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm hover:bg-teal-400/[0.03] [&::-webkit-details-marker]:hidden">
                    <span className="text-teal-200/30 transition-transform group-open:rotate-90">▸</span>
                    <Link href={`/stocks/${m.symbol}`} className="font-bold text-teal-300 hover:underline">
                      {m.symbol}
                    </Link>
                    <span className="min-w-0 flex-1 truncate text-xs text-teal-200/50">{m.name}</span>
                    <span className="tabular-nums text-teal-100/70">{money(m.priceCents)}</span>
                    <span className="font-semibold tabular-nums text-emerald-400">+{pct(m.changePct, 0)}</span>
                  </summary>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pb-2.5 pl-9 text-[11px] text-teal-200/55">
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
          </Card>
          <p className="mt-2 text-[10px] text-teal-200/40">Biggest gainers across the market today (FMP) — each links to a GRQ page; the agent auto-researches the ones we don&apos;t yet track.</p>
        </section>
      )}
      {sectors.length > 0 && (
        <section>
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
      </div>
      )}
        </>
      )}

    </main>
  );
}
