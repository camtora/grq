import { fmpEnabled, fmpScreener, fmpSearch, fmpProfile, stripSuffix, type ScreenerRow } from "@/lib/fmp";
import { getSession } from "@/lib/session";
import { allUniverse, bareTicker } from "@/lib/universe";
import { prisma } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import WatchButton, { type WatchState } from "@/components/WatchButton";
import ResearchButton, { type ResearchState } from "@/components/ResearchButton";
import SortableTable from "@/components/SortableTable";
import { LiveQuotesProvider } from "@/components/LiveQuotes";
import { LiveLastCell } from "@/components/LiveTableCells";

export const dynamic = "force-dynamic";

const EXCHANGES = ["TSX", "TSXV", "NYSE", "NASDAQ"];
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
  // Membership by canonical (suffix-stripped) symbol → Watch button state.
  const statusBy = new Map(universe.map((u) => [u.symbol.toUpperCase(), u.status]));
  const watchState = (sym: string): WatchState => {
    const s = statusBy.get(stripSuffix(sym).toUpperCase());
    return s === "ACTIVE" ? "universe" : s === "CANDIDATE" ? "watching" : "none";
  };

  const { q = "", exchange = "", sector = "", country = "", cap = "" } = sp;
  const query = q.trim();
  const capDef = CAPS.find((c) => c.v === cap);
  const hasFilter = !!(query || exchange || sector || country || cap);

  let rows: ScreenerRow[] = [];
  let note = "";
  if (!fmpEnabled()) {
    note = "Market browsing needs the FMP key in .env.";
  } else if (query) {
    // A name/ticker search drives the list; the dropdowns then narrow it.
    rows = (await searchRows(query)).filter((r) => matchesFilters(r, exchange, sector, country, capDef));
  } else {
    rows = await fmpScreener({
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
      <PageHeader title="Browse" sub="Search any name or screen the whole market — watch the ones worth a closer look." />

      <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-teal-300/70">Browse the whole market</h2>
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
        <button
          type="submit"
          className="rounded-xl border border-teal-400/40 bg-teal-400/15 px-4 py-2 text-sm font-bold uppercase tracking-wider text-teal-200 hover:bg-teal-400/25"
        >
          {query ? "Search" : "Screen"}
        </button>
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
            initialSort={{ key: "symbol", dir: "asc" }}
            columns={[
              { key: "symbol", label: "Symbol", align: "left" },
              { key: "name", label: "Name", align: "left" },
              { key: "sector", label: "Sector", align: "left" },
              { key: "exchange", label: "Exch", align: "left" },
              { key: "cap", label: "Cap", align: "right", numeric: true },
              { key: "price", label: "Price", align: "right", numeric: true },
              { label: null, align: "left" },
            ]}
            rows={rows.map((r) => ({
              key: `${r.symbol}-${r.exchange}`,
              sort: {
                symbol: r.symbol,
                name: r.name,
                sector: r.sector,
                exchange: r.exchange,
                cap: r.marketCapM,
                price: r.priceCents,
              },
              node: (
                <tr key={`${r.symbol}-${r.exchange}`} className="border-t border-teal-400/10">
                  <td className="px-4 py-2.5 font-semibold text-teal-200">{r.symbol}</td>
                  <td className="px-4 py-2.5 text-teal-100/70">
                    {r.name}
                    {r.isEtf && <span className="ml-1.5 text-[9px] uppercase tracking-wider text-teal-200/40">etf</span>}
                  </td>
                  <td className="px-4 py-2.5 text-teal-200/60">{r.sector ?? "—"}</td>
                  <td className="px-4 py-2.5 text-teal-200/50">{r.exchange ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-teal-100/70">{capLabel(r.marketCapM)}</td>
                  <LiveLastCell symbol={r.symbol} initialCents={r.priceCents} currency={r.currency} />
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-2">
                      <ResearchButton symbol={bareTicker(r.symbol)} state={researchState(r.symbol)} canResearch={isMember} />
                      {isMember && <WatchButton symbol={stripSuffix(r.symbol)} exchange={r.exchange ?? undefined} state={watchState(r.symbol)} />}
                    </div>
                  </td>
                </tr>
              ),
            }))}
          />
          </LiveQuotesProvider>
        </Card>
      )}
      <p className="mt-3 text-xs text-teal-200/40">
        Powered by FMP. Prices are in each listing&apos;s native currency. <b>Research</b> queues a full dossier without
        adding the name anywhere — once it lands, <b>View dossier</b> opens it. <b>Watch</b> adds it to your watchlist;
        trading it still needs both members to promote it into the universe.
      </p>
    </main>
  );
}
