import { fmpEnabled, fmpScreener, fmpSearch, fmpProfile, stripSuffix, type ScreenerRow } from "@/lib/fmp";
import { topScreened } from "@/lib/market-screen/screen";
import { stanceMeta, STANCE_TONE_CLASSES } from "@/lib/stance";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { allUniverse, bareTicker } from "@/lib/universe";
import { watchedByMember, watchersFor, type WatcherView } from "@/lib/watch";
import { prisma } from "@/lib/db";
import { Card, PageHeader, Button } from "@/components/ui";
import PanelHeader from "@/components/PanelHeader";
import WatchButton, { type WatchState } from "@/components/WatchButton";
import ResearchButton, { type ResearchState } from "@/components/ResearchButton";
import AvatarStack from "@/components/AvatarStack";
import SortableTable from "@/components/SortableTable";
import { LiveQuotesProvider } from "@/components/LiveQuotes";
import { LiveLastCell } from "@/components/LiveTableCells";

export const dynamic = "force-dynamic";

const EXCHANGES = ["TSX", "TSXV", "NEO", "NYSE", "NASDAQ", "AMEX"];
const SECTORS = [
  "Technology",
  "Financial Services",
  "Energy",
  "Healthcare",
  "Industrials",
  "Consumer Cyclical",
  "Consumer Defensive",
  "Basic Materials",
  "Real Estate",
  "Utilities",
  "Communication Services",
];
const COUNTRIES = [
  { v: "CA", l: "Canada" },
  { v: "US", l: "United States" },
];
const CAPS: { v: string; l: string; more?: number; less?: number }[] = [
  { v: "mega", l: "Mega ≥$200B", more: 200e9 },
  { v: "large", l: "Large $10–200B", more: 10e9, less: 200e9 },
  { v: "mid", l: "Mid $2–10B", more: 2e9, less: 10e9 },
  { v: "small", l: "Small $300M–2B", more: 300e6, less: 2e9 },
  { v: "micro", l: "Micro <$300M", less: 300e6 },
];

function capLabel(m: number | null): string {
  if (!m || m <= 0) return "—";
  return m >= 1000 ? `$${Math.round(m / 1000)}B` : `$${m}M`;
}

type CapDef = (typeof CAPS)[number];

// A Browse row is a screener/search row, optionally enriched with the Market Base
// Layer's Tier-0 score + Tier-1 Haiku tag (docs/MARKET-BASE-LAYER.md).
type BrowseRow = ScreenerRow & { screenScore?: number | null; tag?: string | null; take?: string | null; signal?: string | null };

const TAG_CLS: Record<string, string> = {
  INTERESTING: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  WATCH: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  PASS: "border-teal-400/20 bg-teal-400/[0.06] text-teal-200/50",
};

// Name/ticker search → the same ScreenerRow shape as the screener, so it drops
// into the same table. fmpSearch finds the listings; fmpProfile fills in the
// sector/cap/price columns. (Cam 2026-06-16: search NARROWS the browse list — it
// does not add to the watchlist; you Watch from the row.)
async function searchRows(q: string): Promise<ScreenerRow[]> {
  const matches = (await fmpSearch(q)).slice(0, 10);
  const profiles = await Promise.all(matches.map((m) => fmpProfile(m.symbol).catch(() => null)));
  return matches.map((m, i) => {
    const p = profiles[i];
    return {
      symbol: m.symbol,
      name: m.name,
      priceCents: p?.priceCents ?? null,
      marketCapM: p?.marketCap ? Math.round(p.marketCap / 1_000_000) : null,
      sector: p?.sector ?? null,
      exchange: m.exchange || p?.exchange || null,
      country: p?.country ?? null,
      currency: m.currency || p?.currency || null,
      isEtf: false,
    };
  });
}

// The dropdown filters narrow the result set whether it came from the screener or
// a name search (applied client-side over search results).
function matchesFilters(r: ScreenerRow, exchange: string, sector: string, country: string, capDef: CapDef | undefined): boolean {
  if (exchange && r.exchange !== exchange) return false;
  if (sector && r.sector !== sector) return false;
  if (country && r.country !== country) return false;
  if (capDef) {
    const cap = r.marketCapM ? r.marketCapM * 1_000_000 : null;
    if (cap == null) return false;
    if (capDef.more && cap < capDef.more) return false;
    if (capDef.less && cap >= capDef.less) return false;
  }
  return true;
}

const selectCls =
  "rounded-lg border border-teal-400/20 bg-(--field-bg) px-2 py-1.5 text-sm text-teal-100 outline-none";

export default async function Browse({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [sp, session, universe] = await Promise.all([searchParams, getSession(), allUniverse()]);
  const isMember = session?.role === "member";
  // Membership by canonical (suffix-stripped) symbol.
  const entryBy = new Map(universe.map((u) => [u.symbol.toUpperCase(), u]));
  // Personal watches (D-watch): everyone watching each tracked name (avatar stack),
  // plus the CURRENT member's own set for the row Watch toggle. Independent of status.
  const watchersMap = await watchersFor(universe.map((u) => u.symbol));
  const myWatched = isMember && session ? await watchedByMember(session.email) : new Set<string>();
  const amWatching = (sym: string): boolean => {
    const u = entryBy.get(stripSuffix(sym).toUpperCase());
    return u ? myWatched.has(u.symbol.toUpperCase()) : false;
  };
  // Tracking tile (Cam 2026-06-25; D-watch): whether the name is in the universe /
  // tracked, and which members watch it (stacked avatars) — the two are independent.
  const trackingOf = (sym: string): { state: WatchState; watchers: WatcherView[] } => {
    const u = entryBy.get(stripSuffix(sym).toUpperCase());
    if (!u || u.status === "RETIRED") return { state: "none", watchers: [] };
    return { state: u.status === "ACTIVE" ? "universe" : "watching", watchers: watchersMap.get(u.symbol) ?? [] };
  };

  const { q = "", exchange = "", sector = "", country = "", cap = "" } = sp;
  const query = q.trim();
  const capDef = CAPS.find((c) => c.v === cap);
  const hasFilter = !!(query || exchange || sector || country || cap);

  let rows: BrowseRow[] = [];
  let note = "";
  if (!fmpEnabled()) {
    note = "Market browsing needs the FMP key in .env.";
  } else if (query) {
    // A name/ticker search drives the list; the dropdowns then narrow it.
    rows = (await searchRows(query)).filter((r) => matchesFilters(r, exchange, sector, country, capDef));
  } else {
    // The default view is the Market Base Layer — the whole market, ranked by the
    // Tier-0 screen score (docs/MARKET-BASE-LAYER.md). Falls back to the live FMP
    // screener if the table hasn't been populated yet, so Browse never goes blank.
    const screened = await topScreened({
      exchange: exchange || undefined,
      sector: sector || undefined,
      country: country || undefined,
      capMinM: capDef?.more != null ? capDef.more / 1e6 : undefined,
      capMaxM: capDef?.less != null ? capDef.less / 1e6 : undefined,
      limit: 60,
    });
    rows = screened.length
      ? screened.map((s) => ({
          symbol: s.symbol, name: s.name, priceCents: s.priceCents, marketCapM: s.marketCapM,
          sector: s.sector, exchange: s.exchange, country: s.country, currency: s.currency,
          isEtf: false, screenScore: s.screenScore, tag: s.tag, take: s.take, signal: s.signal,
        }))
      : await fmpScreener({
          exchange: exchange || undefined,
          sector: sector || undefined,
          country: country || undefined,
          marketCapMoreThan: capDef?.more,
          marketCapLowerThan: capDef?.less,
          limit: 60,
        });
  }

  // Per-row research state: a dossier already exists (→ "View dossier"), research is in
  // flight (→ "Researching…"), or neither (→ "Research"). Keyed by the bare ticker, which
  // is the dossier/researchRequest key + the stock-page route (Cam 2026-06-19).
  const keys = [...new Set(rows.map((r) => bareTicker(r.symbol).toUpperCase()))];
  const [dossierRows, inflightRows] = keys.length
    ? await Promise.all([
        prisma.journalEntry.findMany({
          where: {
            kind: "RESEARCH",
            symbol: { in: keys },
            OR: [{ title: { startsWith: "Dossier" } }, { title: { startsWith: "Hunt dossier" } }],
          },
          select: { symbol: true },
        }),
        prisma.researchRequest.findMany({
          where: { symbol: { in: keys }, status: { in: ["QUEUED", "RUNNING"] } },
          select: { symbol: true },
        }),
      ])
    : [[], []];
  const hasDossier = new Set(dossierRows.map((d) => d.symbol));
  const inFlight = new Set(inflightRows.map((r) => r.symbol));
  const researchState = (sym: string): ResearchState => {
    const k = bareTicker(sym).toUpperCase();
    return hasDossier.has(k) ? "done" : inFlight.has(k) ? "inflight" : "none";
  };

  return (
    <main>
      <PageHeader title="Browse" sub="The whole investable market — a first-pass automated scan of every non-ETF name (NASDAQ · NYSE · AMEX · TSX · TSXV · NEO), NOT the researched watchlist. The GRQ column here is a quick screen read, not a full dossier. Search or screen, then dig into what's worth a closer look." />

      <div className="mb-2">
        <PanelHeader>Browse the whole market</PanelHeader>
      </div>
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-teal-400/10 bg-teal-400/[0.02] p-4">
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-teal-200/40">
          Name or ticker
          <input
            name="q"
            defaultValue={q}
            placeholder="e.g. Shopify, ANET"
            className={`${selectCls} w-44 placeholder:text-teal-200/30`}
          />
        </label>
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-teal-200/40">
          Exchange
          <select name="exchange" defaultValue={exchange} className={selectCls}>
            <option value="">Any</option>
            {EXCHANGES.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-teal-200/40">
          Sector
          <select name="sector" defaultValue={sector} className={selectCls}>
            <option value="">Any</option>
            {SECTORS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-teal-200/40">
          Country
          <select name="country" defaultValue={country} className={selectCls}>
            <option value="">Any</option>
            {COUNTRIES.map((c) => (
              <option key={c.v} value={c.v}>
                {c.l}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-teal-200/40">
          Cap
          <select name="cap" defaultValue={cap} className={selectCls}>
            <option value="">Any</option>
            {CAPS.map((c) => (
              <option key={c.v} value={c.v}>
                {c.l}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit">{query ? "Search" : "Screen"}</Button>
        {hasFilter && (
          <a href="/market/browse" className="text-xs font-semibold text-teal-300 hover:underline">
            clear
          </a>
        )}
      </form>

      {note ? (
        <Card className="p-8 text-center text-sm text-teal-200/40">{note}</Card>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-teal-200/40">
          {query ? `No matches for “${query}” — try the company name or a different ticker.` : "No matches — loosen the filters."}
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <LiveQuotesProvider symbols={rows.map((r) => r.symbol)}>
          <SortableTable
            className="w-full text-sm"
            headRowClassName="text-left text-xs uppercase tracking-wider text-teal-200/40"
            initialSort={{ key: "score", dir: "desc" }}
            columns={[
              { key: "symbol", label: "Symbol", align: "left" },
              { key: "name", label: "Name", align: "left" },
              { key: "grq", label: "GRQ", align: "left" },
              { key: "tech", label: "Technical", align: "left" },
              { key: "sector", label: "Sector", align: "left" },
              { key: "exchange", label: "Exch", align: "left" },
              { key: "cap", label: "Cap", align: "right", numeric: true },
              { key: "score", label: "Score", align: "right", numeric: true },
              { key: "price", label: "Price", align: "right", numeric: true },
              { key: "tracking", label: "Tracking", align: "left" },
              { label: null, align: "left" },
            ]}
            rows={rows.map((r) => ({
              key: `${r.symbol}-${r.exchange}`,
              sort: {
                symbol: r.symbol,
                name: r.name,
                grq: ({ INTERESTING: 3, WATCH: 2, PASS: 1 } as Record<string, number>)[r.tag ?? ""] ?? 0,
                tech: stanceMeta(r.signal)?.pos ?? -1,
                sector: r.sector,
                exchange: r.exchange,
                cap: r.marketCapM,
                score: r.screenScore ?? null,
                price: r.priceCents,
                tracking: ({ universe: 2, watching: 1, none: 0 } as const)[trackingOf(r.symbol).state],
              },
              node: (
                <tr key={`${r.symbol}-${r.exchange}`} className="border-t border-teal-400/10">
                  <td className="px-4 py-2.5 font-semibold">
                    <Link href={`/stocks/${encodeURIComponent(r.symbol)}`} className="text-teal-200 hover:text-teal-100 hover:underline">
                      {r.symbol}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-teal-100/70">
                    <div className="flex items-center gap-1.5">
                      {r.name}
                      {r.isEtf && <span className="text-[9px] uppercase tracking-wider text-teal-200/40">etf</span>}
                    </div>
                    {r.take && <div className="mt-0.5 max-w-[22rem] truncate text-[11px] text-teal-200/40">{r.take}</div>}
                  </td>
                  <td className="px-4 py-2.5">
                    {r.tag ? (
                      <span className={`inline-block rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${TAG_CLS[r.tag] ?? TAG_CLS.PASS}`}>
                        {r.tag}
                      </span>
                    ) : (
                      <span className="text-teal-200/30">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {(() => {
                      const m = stanceMeta(r.signal);
                      if (!m) return <span className="text-teal-200/30">—</span>;
                      return (
                        <span title="Technical signal — the chart's read (a formula, not Alfred's call)" className={`text-xs font-semibold ${STANCE_TONE_CLASSES[m.tone]?.text ?? "text-teal-200/60"}`}>
                          {m.label}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-2.5 text-teal-200/60">{r.sector ?? "—"}</td>
                  <td className="px-4 py-2.5 text-teal-200/50">{r.exchange ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-teal-100/70">{capLabel(r.marketCapM)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-teal-300/70">{r.screenScore ?? "—"}</td>
                  <LiveLastCell symbol={r.symbol} initialCents={r.priceCents} currency={r.currency} />
                  <td className="px-4 py-2.5">
                    {(() => {
                      const { state, watchers } = trackingOf(r.symbol);
                      if (state === "none" && watchers.length === 0) return <span className="text-teal-200/30">—</span>;
                      return (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {state !== "none" && (
                            <span
                              className={
                                state === "universe"
                                  ? "rounded-full border border-teal-400/30 bg-teal-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-teal-200"
                                  : "rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-200"
                              }
                            >
                              {state === "universe" ? "Universe" : "Tracked"}
                            </span>
                          )}
                          <AvatarStack people={watchers} />
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-2">
                      <ResearchButton symbol={bareTicker(r.symbol)} state={researchState(r.symbol)} canResearch={isMember} />
                      {isMember && <WatchButton symbol={stripSuffix(r.symbol)} exchange={r.exchange ?? undefined} watching={amWatching(r.symbol)} />}
                    </div>
                  </td>
                </tr>
              ),
            }))}
          />
          </LiveQuotesProvider>
        </Card>
      )}
      <div className="mt-3 space-y-2 text-xs text-teal-200/40">
        <p>
          <b className="text-teal-200/60">What you&apos;re seeing —</b> a first-pass scan of the WHOLE market, three automated reads per name (not the researched watchlist):{" "}
          <b className="text-teal-300/70">Score</b> = our quality/liquidity rank (is it a real, tradeable name?);{" "}
          <b className="text-teal-300/70">GRQ</b> = a one-line first-pass read —{" "}
          <b className="text-emerald-300/80">INTERESTING</b> (worth a real look) ·{" "}
          <b className="text-amber-300/80">WATCH</b> (interesting — wait for a catalyst or better entry) ·{" "}
          <b className="text-teal-200/50">PASS</b> (skip — too big, dull, or no edge);{" "}
          <b className="text-teal-300/70">Technical</b> = the chart&apos;s signal (a formula, actionable names only).
          These are a quick triage, <b>not</b> the full <b>Alfred&apos;s call</b> — a name&apos;s real dossier and call live on its stock page.
          Some names here are already tracked or researched, since this is the entire market.
        </p>
        <p>
          Powered by FMP. Prices are in each listing&apos;s native currency. <b>Research</b> queues a full dossier without
          adding the name anywhere — once it lands, <b>View dossier</b> opens it. <b>Watch</b> adds it to your watchlist;
          trading it still needs it promoted into the universe (any member can, once it clears the liquidity screen).
        </p>
      </div>
    </main>
  );
}
