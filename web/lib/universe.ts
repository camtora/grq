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
// 200 → 300 (Cam 2026-08-15): the pool hit 200 dead-on and started REJECTING new watches
// ("Candidate cap reached"). Two things changed since 200 was set — the D112 gate now does
// the real budget work (the weekly sweep is 7.4M tokens, not 73.8M), so the cap no longer
// has to stand in for a cost bound; and the prune that was meant to drain the pool had an
// unreachable floor (REFRESH.demoteStaleDays, fixed in the same change). The prune is the
// fix; this is headroom so a full pool can't silently eat a member's watch again.
export const CANDIDATE_CAP = 300;
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
  return pickCanonical(await load(), ticker);
}

const CA_SUFFIX = /\.(TO|V|NE|CN)$/i;

/** Share-class / unit notation → the dash form we store and Yahoo quotes: the TSX (and
 *  most US sources) write Hammond's class A as `HPS.A`, Yahoo as `HPS-A` (+ `.TO`), and so
 *  do our rows. Any venue suffix (.TO/.V/.NE/.CN/.US) is left in place; every OTHER dot is
 *  a class separator (`HPS.A`, `BRK.B`, `REI.UN`, `HPS.A.TO`). North-America only — a
 *  foreign single-letter venue (`.L`) would be misread, which is why callers use this to
 *  MATCH a tracked member or with a known NA exchange in hand, never as a blind rewrite. */
export function classDash(symbol: string): string {
  const s = symbol.trim().toUpperCase();
  const m = s.match(/\.(TO|V|NE|CN|US)$/);
  const venue = m ? m[0] : "";
  return s.slice(0, s.length - venue.length).replace(/\./g, "-") + venue;
}

/** The pure rule behind canonicalMember (rows in, member out) — pinned in
 *  test/symbol-resolution.test.ts. */
export function pickCanonical(rows: UniverseRow[], ticker: string): UniverseRow | null {
  const t = ticker.trim().toUpperCase();
  const exact = rows.find((r) => r.symbol === t);
  if (exact) return exact;
  const bare = (s: string) => classDash(s).replace(/\.(TO|V|NE|CN|US)$/i, "");
  const target = bare(t);
  // An explicit listing in the URL names a LISTING, not just a ticker, and bare tickers
  // collide across the border. `.US` must not be captured by a Canadian member that merely
  // shares the ticker (US T = AT&T, our T = Telus/T.TO); and a Canadian suffix must not be
  // captured by a US one (NEO.TO = Neo Performance Materials, bare NEO = NeoGenomics —
  // 2026-10-08, the wrong company got researched). Cross-listed members still match their
  // own side.
  const wantsUs = /\.US$/i.test(t);
  const wantsCa = CA_SUFFIX.test(t);
  const caListed = (r: UniverseRow) => CA_SUFFIX.test((r.yahoo ?? "").toUpperCase());
  return (
    rows.find(
      (r) =>
        r.status !== "RETIRED" &&
        r.symbol !== t &&
        bare(r.symbol) === target &&
        !(wantsUs && caListed(r)) &&
        !(wantsCa && !caListed(r)),
    ) ?? null
  );
}

/** The tracked member that IS a given listing — for joining something that names a stock
 *  from outside (a Chess play, a board piece) onto our universe. A bare-ticker join is not
 *  enough: tickers collide across the border, and the join silently swaps the company
 *  (the rare-earth board's NEO.TO play joined NeoGenomics the moment bare NEO was tracked).
 *   1. the exact Yahoo listing, when the caller knows it;
 *   2. else a same-ticker member whose NAME says it's the same company (a cross-listing
 *      named by its other side — SHOP on the NYSE vs our SHOP.TO);
 *   3. else, only when there is no name to compare, a same-ticker member on the same side
 *      of the border.
 *  Anything else is null: untracked beats wrong-company. */
export function memberForListing(
  rows: UniverseRow[],
  want: { symbol: string; yahoo?: string | null; name?: string | null },
): UniverseRow | null {
  const live = rows.filter((r) => r.status !== "RETIRED");
  const bare = (x: string) => classDash(x).replace(/\.(TO|V|NE|CN|US)$/i, "");
  const asked = (want.yahoo || want.symbol).trim().toUpperCase();
  if (want.yahoo) {
    const y = classDash(want.yahoo).replace(/\.US$/, "");
    const exact = live.find((r) => classDash(r.yahoo ?? "") === y);
    if (exact) return exact;
  }
  const cands = live.filter((r) => bare(r.yahoo || r.symbol) === bare(asked));
  if (cands.length === 0) return null;
  const named = cands.find((r) => sameCompanyName(r.name, want.name));
  if (named) return named;
  if (want.name && want.name.trim()) return null;
  const ca = CA_SUFFIX.test(asked);
  return cands.find((r) => CA_SUFFIX.test((r.yahoo ?? "").toUpperCase()) === ca) ?? null;
}

/** The key a symbol's research + journal live under. Tracked → the member's own symbol.
 *  Untracked → the symbol AS GIVEN, Canadian suffix included: everything downstream reads a
 *  bare ticker as the US listing (toYahoo), so stripping `.TO` off an untracked name doesn't
 *  shorten it, it renames it to a different company. Only `.US` (our tag, never a real
 *  suffix) is dropped. */
export async function researchKey(symbol: string): Promise<string> {
  const m = await canonicalMember(symbol);
  if (m && m.status !== "RETIRED") return m.symbol;
  return symbol.trim().toUpperCase().replace(/\.US$/, "");
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
  // so their quotes/bars came back empty. `.US` is OUR disambiguation tag, not a
  // Yahoo suffix — strip it (Yahoo's US symbols are bare).
  return symbol.trim().toUpperCase().replace(/\.US$/, "");
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
  // `.US` is GRQ's internal "the US listing" tag (never a real wire suffix) —
  // strip it and treat the result as an explicit US pick (bare on Yahoo).
  const s = symbol.trim().toUpperCase().replace(/\.US$/, "");
  if (s !== symbol.trim().toUpperCase()) return s;
  const suf = exchange ? EXCHANGE_SUFFIX[exchange.trim().toUpperCase()] : undefined;
  // On a Canadian venue a trailing `.A` is a share CLASS, not a listing (HPS.A on the TSX
  // is Yahoo's HPS-A.TO) — it used to be "trusted as already qualified", which quoted
  // nothing and labelled a Toronto stock USD.
  if (suf && !CA_SUFFIX.test(s)) return `${classDash(s)}${suf}`;
  if (/\.[A-Z]{1,3}$/.test(s)) return s; // FMP often already qualifies (RY.TO)
  return s;
}

/** Bare ticker (suffix stripped) — the natural storage key when it's free. */
export function bareTicker(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/\.(TO|V|NE|CN)$/i, "");
}

// Company-name comparison for the bare-ticker collision check below. Normalizes
// away punctuation + boilerplate suffix words, then compares the leading tokens —
// enough to tell "CELESTICA INC" ≈ "Celestica Inc." (cross-listing) apart from
// "AT&T Inc." vs "TELUS" (different companies sharing bare ticker T).
const NAME_NOISE = new Set([
  "INC", "CORP", "CORPORATION", "LTD", "LIMITED", "PLC", "CO", "COMPANY", "COMPANIES",
  "THE", "HOLDINGS", "HOLDING", "GROUP", "LP", "SA", "NV", "AG", "CLASS", "NEW", "COM",
  "ORD", "SHS", "ADR",
]);
function nameTokens(s: string): string[] {
  return s
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t && !NAME_NOISE.has(t));
}
function sameCompanyName(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.length === 0 || tb.length === 0) return false;
  const n = Math.min(ta.length, tb.length, 2);
  return ta.slice(0, n).join(" ") === tb.slice(0, n).join(" ");
}

/** Map a US-source bare ticker (13F / congress / insider feeds are US-listed) to the
 *  GRQ symbol whose stock page shows THAT company. The trap: bare tickers collide
 *  across exchanges — US "T" is AT&T while our tracked bare "T" is Telus (T.TO), so a
 *  raw `/stocks/T` link lands on the wrong company (bit us 2026-07-04). Rules:
 *   - tracked `SYM.US` → that member;
 *   - tracked bare SYM on a US listing (bare yahoo) → same company → SYM;
 *   - tracked bare SYM on a CANADIAN listing → SYM only when the names say it's the
 *     same company cross-listed (CLS/Celestica, SHOP/Shopify); otherwise `SYM.US` —
 *     the explicit-US URL, which canonicalMember will NOT hand to the CA namesake.
 *     Never wrong-company; worst case a cross-listing misses its dossier page;
 *   - untracked → SYM (bare = US listing everywhere downstream).
 */
export async function usTickerToGrqSymbol(ticker: string, usName?: string | null): Promise<string> {
  const sym = ticker.trim().toUpperCase();
  if (!sym || /\./.test(sym)) return sym; // already qualified (or junk) — pass through
  const rows = await load();
  if (rows.some((r) => r.status !== "RETIRED" && r.symbol === `${sym}.US`)) return `${sym}.US`;
  const bare = rows.find((r) => r.status !== "RETIRED" && r.symbol === sym);
  if (!bare) return sym;
  const caListed = /\.(TO|V|NE|CN)$/i.test((bare.yahoo ?? "").toUpperCase());
  if (!caListed) return sym;
  return sameCompanyName(bare.name, usName) ? sym : `${sym}.US`;
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
