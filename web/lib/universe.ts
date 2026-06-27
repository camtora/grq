import { prisma } from "./db";

// The universe is DB-backed (Phase 2.7): CANDIDATE (researched, not tradeable)
// → ACTIVE (the agent may buy; promotion needs BOTH members + the automated
// screen) → RETIRED (stop researching; history kept). The agent can never
// change membership — it may only propose. A 60s in-process cache keeps the
// hot paths cheap.

export type Tier = "etf" | "large" | "mid";
export type UniverseStatus = "CANDIDATE" | "ACTIVE" | "RETIRED";

export type UniverseRow = {
  symbol: string;
  yahoo: string;
  name: string;
  tier: Tier | null;
  status: UniverseStatus;
  addedBy: string | null;
  promotionRequestedBy: string | null;
  proposedTier: string | null;
  note: string | null;
  logoUrl: string | null;
  sector: string | null;
  industry: string | null;
  country: string | null;
  currency: string | null;
  exchange: string | null;
  marketCapM: number | null;
};

export const BENCHMARK = "XIC";
// Watching a stock ≈ adding a CANDIDATE now (2.8 — the two were unified), so this
// is a high anti-runaway guard, not a budget. Cam lifted the research caps 2026-06-15.
export const CANDIDATE_CAP = 200;
// (ON_DEMAND_RESEARCH_PER_DAY removed 2026-06-15 — Cam lifted the on-demand cap;
// research is unlimited. The weekly-refresh size is the only remaining bound.)
// Full-universe dossier refresh runs weekly to keep the whole research library fresh
// for the trading week ahead. Sunday 02:00 ET (= Saturday night) — decoupled from the
// Saturday review, which only needs HELD names fresh, not the whole pool (Cam 2026-06-25).
// Running it Sunday night also captures any weekend news right before Monday's open.
export const WEEKLY_REFRESH_WEEKDAY = 0; // Sunday (Saturday-night 02:00)
export const WEEKLY_REFRESH_START_MIN = 2 * 60; // 02:00 ET
// (RESEARCH_DAILY_CEILING removed 2026-06-13 — Cam lifted the daily cap; the
// on-demand budget above and the weekly-refresh size remain the bounds.)

let cache: { at: number; rows: UniverseRow[] } | null = null;
const TTL_MS = 60_000;

export function invalidateUniverseCache(): void {
  cache = null;
}

async function load(): Promise<UniverseRow[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;
  const rows = await prisma.universeMember.findMany();
  const mapped: UniverseRow[] = rows.map((r) => ({
    symbol: r.symbol,
    yahoo: r.yahoo,
    name: r.name,
    tier: (r.tier as Tier | null) ?? null,
    status: r.status as UniverseStatus,
    addedBy: r.addedBy,
    promotionRequestedBy: r.promotionRequestedBy,
    proposedTier: r.proposedTier,
    note: r.note,
    logoUrl: r.logoUrl,
    sector: r.sector,
    industry: r.industry,
    country: r.country,
    currency: r.currency,
    exchange: r.exchange,
    marketCapM: r.marketCapM,
  }));
  cache = { at: Date.now(), rows: mapped };
  return mapped;
}

export async function allUniverse(): Promise<UniverseRow[]> {
  return load();
}

/** Tradeable names — what the agent may BUY. */
export async function activeUniverse(): Promise<UniverseRow[]> {
  return (await load()).filter((r) => r.status === "ACTIVE");
}

/** Everything we keep data warm for (ACTIVE + CANDIDATE). */
export async function trackedUniverse(): Promise<UniverseRow[]> {
  return (await load()).filter((r) => r.status !== "RETIRED");
}

export async function activeSymbols(): Promise<string[]> {
  return (await activeUniverse()).map((r) => r.symbol);
}

export async function trackedSymbols(): Promise<string[]> {
  return (await trackedUniverse()).map((r) => r.symbol);
}

export async function universeEntry(symbol: string): Promise<UniverseRow | null> {
  return (await load()).find((r) => r.symbol === symbol.toUpperCase()) ?? null;
}

// Resolve a URL ticker to its CANONICAL universe member — exact stored-symbol match first,
// else a non-RETIRED member whose bare ticker matches. This is what lets `/stocks/MU` route
// to the tracked `MU.US` member instead of synthesising a duplicate untracked page (a US name
// stored as `TICKER.US` would otherwise render at BOTH /stocks/TICKER and /stocks/TICKER.US,
// double-counting its options/social cache). RETIRED CDR shells share a bare symbol, so they're
// excluded — they must not shadow a live listing. Returns null when nothing canonical exists.
export async function canonicalMember(ticker: string): Promise<UniverseRow | null> {
  const t = ticker.toUpperCase();
  const rows = await load();
  const exact = rows.find((r) => r.symbol === t);
  if (exact) return exact;
  const bare = (s: string) => s.toUpperCase().replace(/\.(TO|V|NE|CN|US)$/i, "");
  const target = bare(t);
  return rows.find((r) => r.status !== "RETIRED" && r.symbol !== t && bare(r.symbol) === target) ?? null;
}

export async function inUniverse(symbol: string): Promise<boolean> {
  return (await universeEntry(symbol)) !== null;
}

export async function toYahoo(symbol: string): Promise<string> {
  const e = await universeEntry(symbol);
  if (e?.yahoo) return e.yahoo;
  // Untracked name (e.g. a hunt find with no universe row): an already-qualified
  // listing (VCM.TO, PCRX.V) is trusted as-is; a bare ticker is treated as a US
  // listing — the hunt reaches all of North America and CA finds arrive suffixed.
  // Either way, never append ".TO" or rewrite the dot: the old fallback turned
  // "VCM.TO" into "VCM-TO.TO" and forced US tickers (STRT, QTTB…) onto the TSX,
  // so their quotes/bars came back empty.
  return symbol.trim().toUpperCase();
}

/** The native currency a symbol trades in — CAD or USD. Prefers the universe row's
 *  currency; otherwise infers from the resolved Yahoo listing (a Canadian suffix ⇒ CAD,
 *  a bare/US ticker ⇒ USD). Used to tag Race entry-price snapshots so the standings can
 *  convert USD calls to a single CAD board. Free-form symbols (a model's call on a name
 *  we don't track) resolve via the suffix heuristic and never throw. */
export async function currencyForSymbol(symbol: string): Promise<"CAD" | "USD"> {
  const e = await universeEntry(symbol);
  if (e?.currency) return e.currency.trim().toUpperCase() === "USD" ? "USD" : "CAD";
  const y = (await toYahoo(symbol)).toUpperCase();
  return /\.(TO|V|NE|CN)$/.test(y) ? "CAD" : "USD";
}

// Exchange (FMP shortName) → Yahoo suffix. US venues are bare; Canadian venues
// carry a suffix. This is what lets the add flow resolve the EXACT listing the
// user picked instead of blindly trying ".TO" (the SPCX collision — D24).
const EXCHANGE_SUFFIX: Record<string, string> = {
  TSX: ".TO", TSE: ".TO", TORONTO: ".TO", "TSX-TORONTO": ".TO",
  TSXV: ".V", "TSX VENTURE": ".V", VENTURE: ".V",
  NEO: ".NE", "CBOE CA": ".NE", "CBOE CANADA": ".NE", "AEQUITAS NEO": ".NE",
  CSE: ".CN", CNSX: ".CN",
};

/** The Yahoo symbol for a listing the user explicitly picked, e.g.
 *  ("RY","TSX")→"RY.TO", ("NVDA","NASDAQ")→"NVDA". Already-suffixed input trusted. */
export function yahooForListing(symbol: string, exchange?: string | null): string {
  const s = symbol.trim().toUpperCase();
  if (/\.[A-Z]{1,3}$/.test(s)) return s; // FMP often already qualifies (RY.TO)
  const suf = exchange ? EXCHANGE_SUFFIX[exchange.trim().toUpperCase()] : undefined;
  return suf ? `${s}${suf}` : s;
}

/** Bare ticker (suffix stripped) — the natural storage key when it's free. */
export function bareTicker(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/\.(TO|V|NE|CN)$/i, "");
}

/** Tradeable in the CAD sim only if the listing is CAD-denominated — CDRs qualify;
 *  true-USD listings are research-only until the multi-currency work (Phase 3+).
 *  Falls back to a suffix heuristic when currency is unknown. */
export function isCadTradeable(currency?: string | null, yahoo?: string | null): boolean {
  if (currency) return currency.trim().toUpperCase() === "CAD";
  const y = (yahoo ?? "").toUpperCase();
  return y.endsWith(".TO") || y.endsWith(".V") || y.endsWith(".NE") || y.endsWith(".CN");
}

/** Tradeable if denominated in a currency the fund holds — CAD or USD (D34; the
 *  IBKR account carries both). Unknown currency falls back to the listing suffix:
 *  Canadian suffixes and bare (US-style) tickers qualify; other foreign suffixes
 *  don't. This is the promotion gate; valuation/NAV convert USD→CAD at the BoC rate. */
export function isTradeable(currency?: string | null, yahoo?: string | null): boolean {
  const c = (currency ?? "").trim().toUpperCase();
  if (c === "CAD" || c === "USD") return true;
  if (c) return false; // a known but unsupported currency (GBP, EUR, …)
  const y = (yahoo ?? "").toUpperCase();
  if (/\.(TO|V|NE|CN)$/.test(y)) return true;
  return !/\.[A-Z]{1,3}$/.test(y); // bare ticker → US (USD); other foreign suffix → no
}

// The original hand-screened list — seeds UniverseMember as ACTIVE.
export const SEED: { symbol: string; yahoo: string; name: string; tier: Tier }[] = [
  { symbol: "XIC", yahoo: "XIC.TO", name: "iShares Core S&P/TSX Capped Composite", tier: "etf" },
  { symbol: "XIU", yahoo: "XIU.TO", name: "iShares S&P/TSX 60", tier: "etf" },
  { symbol: "VFV", yahoo: "VFV.TO", name: "Vanguard S&P 500 (CAD)", tier: "etf" },
  { symbol: "VDY", yahoo: "VDY.TO", name: "Vanguard FTSE Cdn High Dividend", tier: "etf" },
  { symbol: "RY", yahoo: "RY.TO", name: "Royal Bank", tier: "large" },
  { symbol: "TD", yahoo: "TD.TO", name: "TD Bank", tier: "large" },
  { symbol: "BNS", yahoo: "BNS.TO", name: "Scotiabank", tier: "large" },
  { symbol: "BMO", yahoo: "BMO.TO", name: "Bank of Montreal", tier: "large" },
  { symbol: "CM", yahoo: "CM.TO", name: "CIBC", tier: "large" },
  { symbol: "NA", yahoo: "NA.TO", name: "National Bank", tier: "large" },
  { symbol: "ENB", yahoo: "ENB.TO", name: "Enbridge", tier: "large" },
  { symbol: "TRP", yahoo: "TRP.TO", name: "TC Energy", tier: "large" },
  { symbol: "CNQ", yahoo: "CNQ.TO", name: "Canadian Natural Resources", tier: "large" },
  { symbol: "SU", yahoo: "SU.TO", name: "Suncor", tier: "large" },
  { symbol: "CVE", yahoo: "CVE.TO", name: "Cenovus", tier: "large" },
  { symbol: "CNR", yahoo: "CNR.TO", name: "CN Rail", tier: "large" },
  { symbol: "CP", yahoo: "CP.TO", name: "CPKC", tier: "large" },
  { symbol: "SHOP", yahoo: "SHOP.TO", name: "Shopify", tier: "large" },
  { symbol: "CSU", yahoo: "CSU.TO", name: "Constellation Software", tier: "large" },
  { symbol: "BCE", yahoo: "BCE.TO", name: "BCE", tier: "large" },
  { symbol: "T", yahoo: "T.TO", name: "TELUS", tier: "large" },
  { symbol: "ABX", yahoo: "ABX.TO", name: "Barrick", tier: "large" },
  { symbol: "AEM", yahoo: "AEM.TO", name: "Agnico Eagle", tier: "large" },
  { symbol: "FTS", yahoo: "FTS.TO", name: "Fortis", tier: "large" },
  { symbol: "MFC", yahoo: "MFC.TO", name: "Manulife", tier: "large" },
  { symbol: "SLF", yahoo: "SLF.TO", name: "Sun Life", tier: "large" },
  { symbol: "ATD", yahoo: "ATD.TO", name: "Couche-Tard", tier: "large" },
  { symbol: "L", yahoo: "L.TO", name: "Loblaw", tier: "large" },
  { symbol: "DOL", yahoo: "DOL.TO", name: "Dollarama", tier: "large" },
  { symbol: "WCN", yahoo: "WCN.TO", name: "Waste Connections", tier: "large" },
  { symbol: "WSP", yahoo: "WSP.TO", name: "WSP Global", tier: "large" },
  { symbol: "BN", yahoo: "BN.TO", name: "Brookfield", tier: "large" },
  { symbol: "OTEX", yahoo: "OTEX.TO", name: "OpenText", tier: "mid" },
  { symbol: "EMA", yahoo: "EMA.TO", name: "Emera", tier: "mid" },
  { symbol: "IFC", yahoo: "IFC.TO", name: "Intact Financial", tier: "mid" },
  { symbol: "K", yahoo: "K.TO", name: "Kinross", tier: "mid" },
  { symbol: "MG", yahoo: "MG.TO", name: "Magna", tier: "mid" },
  { symbol: "TFII", yahoo: "TFII.TO", name: "TFI International", tier: "mid" },
];
