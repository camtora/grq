import { fmpEnabled, fmpScreener, stripSuffix, type ScreenerRow } from "@/lib/fmp";
import { getSession } from "@/lib/session";
import { allUniverse } from "@/lib/universe";
import { money } from "@/lib/money";
import { Card, PageHeader } from "@/components/ui";
import MarketTabs from "@/components/MarketTabs";
import WatchButton, { type WatchState } from "@/components/WatchButton";

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

  const { exchange = "", sector = "", country = "", cap = "" } = sp;
  const capDef = CAPS.find((c) => c.v === cap);
  const hasFilter = !!(exchange || sector || country || cap);

  let rows: ScreenerRow[] = [];
  let note = "";
  if (!fmpEnabled()) {
    note = "Market browsing needs the FMP key in .env.";
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

  return (
    <main>
      <PageHeader title="Market" sub="Discover names beyond GRQ's universe — the agent's ideas, the whole-market screener, and your research desk." />
      <MarketTabs />

      <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-teal-300/70">Browse the whole market</h2>
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-teal-400/10 bg-teal-400/[0.02] p-4">
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
          Screen
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
        <Card className="p-8 text-center text-sm text-teal-200/40">No matches — loosen the filters.</Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-teal-200/40">
                <th className="px-4 py-3">Symbol</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Sector</th>
                <th className="px-4 py-3">Exch</th>
                <th className="px-4 py-3 text-right">Cap</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.symbol}-${r.exchange}`} className="border-t border-teal-400/10">
                  <td className="px-4 py-2.5 font-semibold text-teal-200">{r.symbol}</td>
                  <td className="px-4 py-2.5 text-teal-100/70">
                    {r.name}
                    {r.isEtf && <span className="ml-1.5 text-[9px] uppercase tracking-wider text-teal-200/40">etf</span>}
                  </td>
                  <td className="px-4 py-2.5 text-teal-200/60">{r.sector ?? "—"}</td>
                  <td className="px-4 py-2.5 text-teal-200/50">{r.exchange ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-teal-100/70">{capLabel(r.marketCapM)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-teal-100/80">
                    {r.priceCents !== null ? money(r.priceCents) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {isMember && <WatchButton symbol={stripSuffix(r.symbol)} state={watchState(r.symbol)} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <p className="mt-3 text-xs text-teal-200/40">
        Powered by FMP. Prices are in each listing&apos;s native currency. <b>Watch</b> adds a name to your watchlist — the
        agent dossiers it; trading it still needs both members to promote it into the universe.
      </p>
    </main>
  );
}
