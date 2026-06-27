import { prisma } from "../db";

// Market Base Layer — Tier 0 (docs/MARKET-BASE-LAYER.md). A deterministic, LLM-free
// screen over the whole investable market (NASDAQ/NYSE/TSX/TSXV, ETFs + mutual funds
// excluded), producing a coarse 0–100 "real, tradeable, worth-a-look" rank per name.
// NOT alpha (that's Tier 1/2) — its job is to de-junk the long tail and point the cheap
// Haiku tagger (Tier 1) at the interesting subset. Total coverage, ~free (FMP only).
// Own fetch (vs lib/fmp.ts's wrapper) so it can read isFund + volume for the screen.

const BASE = "https://financialmodelingprep.com/stable";
const EXCHANGES = ["NASDAQ", "NYSE", "AMEX", "TSX", "TSXV", "NEO"];
const FLOOR_CAP_M = 50; // skip sub-$50M micro-junk
const FLOOR_PRICE_CENTS = 100; // skip sub-$1 penny stocks
const FLOOR_DOLLAR_VOL = 50_000; // skip ~dead names (< $50k traded/day)

// Canadian venues are CAD; US venues USD (the raw screener omits currency).
const CA_EXCHANGES = new Set(["TSX", "TSXV", "NEO"]);
const CURRENCY_BY_EXCHANGE: Record<string, string> = { TSX: "CAD", TSXV: "CAD", NEO: "CAD", NASDAQ: "USD", NYSE: "USD", AMEX: "USD" };
const SUFFIX_BY_EXCHANGE: Record<string, string> = { TSX: ".TO", TSXV: ".V", NEO: ".NE" };

const bareKey = (s: string) => s.trim().toUpperCase().replace(/\.(TO|V|NE|CN|US)$/i, "");

type RawScreen = {
  symbol: string; companyName: string; marketCap: number; sector: string | null;
  price: number; volume: number; country: string | null;
  isEtf: boolean; isFund: boolean; isActivelyTrading: boolean;
};

async function fetchScreener(exchange: string): Promise<RawScreen[]> {
  const k = process.env.FMP_API_KEY ?? "";
  if (!k) return [];
  try {
    const r = await fetch(`${BASE}/company-screener?exchange=${encodeURIComponent(exchange)}&isActivelyTrading=true&limit=100000&apikey=${k}`, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
    if (!r.ok) return [];
    const data = await r.json();
    return Array.isArray(data) ? (data as RawScreen[]) : [];
  } catch {
    return [];
  }
}

// v1 screen score (0–100) — TUNABLE (like lib/heat.ts / the KG weights). Favors the
// investable mid-band (mid + small caps — the GRQ sweet spot) over mega-caps (already
// well-covered) and nano-caps (often junk); rewards a known sector, a sane share price,
// and real liquidity. Returns null for names that don't clear the floor (they're dropped).
function scoreOf(capM: number, priceCents: number, dollarVol: number, sector: string | null): number | null {
  if (capM < FLOOR_CAP_M || priceCents < FLOOR_PRICE_CENTS || dollarVol < FLOOR_DOLLAR_VOL) return null;
  // log10(capM-in-millions): $50M→1.7, $2B→3.3, $200B→5.3. Peak the band near ~$2B.
  const band = Math.max(0, 60 - Math.abs(Math.log10(capM) - 3.3) * 20); // gaussian-ish, 0..60
  const sectorBonus = sector ? 12 : 0;
  const priceBonus = priceCents >= 500 && priceCents <= 50000 ? 13 : 4; // $5–$500 = sane
  const liqBonus = Math.min(15, Math.max(0, (Math.log10(dollarVol) - 5) * 6)); // $100k→0 … $1M+→up to 15
  return Math.round(Math.min(100, band + sectorBonus + priceBonus + liqBonus));
}

/** Full deterministic re-screen. Replaces the table but PRESERVES Tier-1 tags
 *  (tag/take/obscurity) across runs. Safe to re-run; ~free. */
export async function runMarketScreen(opts?: { exchanges?: string[] }): Promise<{ scanned: number; kept: number }> {
  const exchanges = opts?.exchanges ?? EXCHANGES;

  // 1. fetch + score
  let scanned = 0;
  const keep: Array<{
    symbol: string; ticker: string; name: string; exchange: string;
    sector: string | null; country: string | null; marketCapM: number | null;
    priceCents: number | null; currency: string | null; screenScore: number;
  }> = [];
  for (const ex of exchanges) {
    const rows = await fetchScreener(ex);
    scanned += rows.length;
    for (const r of rows) {
      if (r.isEtf || r.isFund || !r.isActivelyTrading) continue; // stocks only — no ETFs / mutual funds
      const capM = r.marketCap ? Math.round(r.marketCap / 1_000_000) : 0;
      const priceCents = r.price ? Math.round(r.price * 100) : 0;
      const dollarVol = (r.price || 0) * (r.volume || 0);
      const score = scoreOf(capM, priceCents, dollarVol, r.sector);
      if (score == null) continue;
      // FMP returns bare CA tickers — qualify them so quotes/links resolve the right listing.
      const suffix = SUFFIX_BY_EXCHANGE[ex];
      const symbol = suffix && !/\.[A-Z]{1,3}$/i.test(r.symbol) ? `${r.symbol}${suffix}` : r.symbol;
      keep.push({
        symbol, ticker: bareKey(r.symbol), name: r.companyName, exchange: ex,
        sector: r.sector, country: r.country ?? (CA_EXCHANGES.has(ex) ? "CA" : "US"),
        marketCapM: capM, priceCents, currency: CURRENCY_BY_EXCHANGE[ex] ?? "USD", screenScore: score,
      });
    }
  }

  // 2. preserve Tier-1 tags (they survive a Tier-0 re-screen)
  const prior = await prisma.marketScreen.findMany({ select: { symbol: true, exchange: true, tag: true, take: true, obscurity: true, taggedAt: true } });
  const tagBy = new Map(prior.map((p) => [`${p.symbol}|${p.exchange}`, p] as const));

  // 3. replace
  await prisma.marketScreen.deleteMany({});
  const now = new Date();
  const withTags = keep.map((r) => {
    const t = tagBy.get(`${r.symbol}|${r.exchange}`);
    return { ...r, screenedAt: now, tag: t?.tag ?? null, take: t?.take ?? null, obscurity: t?.obscurity ?? null, taggedAt: t?.taggedAt ?? null };
  });
  for (let i = 0; i < withTags.length; i += 1000) {
    await prisma.marketScreen.createMany({ data: withTags.slice(i, i + 1000) });
  }
  return { scanned, kept: withTags.length };
}

export type ScreenRow = {
  symbol: string; ticker: string; name: string; exchange: string;
  sector: string | null; country: string | null; marketCapM: number | null;
  priceCents: number | null; currency: string | null; screenScore: number;
  tag: string | null; take: string | null; obscurity: number | null;
};

/** Ranked read for Browse — the screened market, best-score first, with the same
 *  exchange/sector/country/cap filters Browse already exposes. */
export async function topScreened(opts: {
  exchange?: string; sector?: string; country?: string;
  capMinM?: number; capMaxM?: number; limit?: number;
}): Promise<ScreenRow[]> {
  const capFilter = opts.capMinM != null || opts.capMaxM != null
    ? { marketCapM: { ...(opts.capMinM != null ? { gte: opts.capMinM } : {}), ...(opts.capMaxM != null ? { lt: opts.capMaxM } : {}) } }
    : {};
  const rows = await prisma.marketScreen.findMany({
    where: {
      ...(opts.exchange ? { exchange: opts.exchange } : {}),
      ...(opts.sector ? { sector: opts.sector } : {}),
      ...(opts.country ? { country: opts.country } : {}),
      ...capFilter,
    },
    orderBy: [{ screenScore: "desc" }, { marketCapM: "desc" }],
    take: opts.limit ?? 60,
  });
  return rows.map((r) => ({
    symbol: r.symbol, ticker: r.ticker, name: r.name, exchange: r.exchange,
    sector: r.sector, country: r.country, marketCapM: r.marketCapM,
    priceCents: r.priceCents, currency: r.currency, screenScore: r.screenScore,
    tag: r.tag, take: r.take, obscurity: r.obscurity,
  }));
}
