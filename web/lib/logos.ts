import { prisma } from "./db";

// Automated company-logo resolution — no hand-map (Cam, 2026-06-14). Company
// name → Clearbit autocomplete (gives the official domain) → DuckDuckGo favicon
// by that domain. Cached on UniverseMember.logoUrl: null = not yet tried,
// "" = tried, none found, URL = use it. When an FMP key lands, FMP's
// ticker-keyed logos become the higher-fidelity upgrade (see docs/DATA-PROCUREMENT.md).

const TIMEOUT_MS = 8000;
const CONCURRENCY = 4;

// Does a Clearbit suggestion's name correspond to ours? Whole-word prefix match
// in either direction; never a continuation — "Suncor" matches "Suncor Energy"
// but not "Suncorp Bank", and "BCE" matches nothing like "Boston College".
function nameCorresponds(ours: string, suggestion: string): boolean {
  const a = ours.toLowerCase().trim();
  const b = suggestion.toLowerCase().trim();
  if (a.length < 3 || !b) return false;
  if (a === b) return true;
  const boundary = (s: string, i: number) => i >= s.length || /[\s.,&'/-]/.test(s.charAt(i));
  if (b.startsWith(a) && boundary(b, a.length)) return true;
  if (a.startsWith(b) && boundary(a, b.length)) return true;
  return false;
}

// Strip the noise that derails a name lookup (CDR wrappers, legal suffixes…).
function cleanName(name: string): string {
  return name
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(cdr|cad|hedged|ltd|inc|corp|corporation|company|co|plc|sa|ag|nv|the|holdings?|group)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Suggest = { name?: string; domain?: string };

/** Resolve a company name to a logo URL (favicon by domain), or null. */
export async function resolveLogo(name: string): Promise<string | null> {
  const q = cleanName(name) || name;
  try {
    const res = await fetch(
      `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(q)}`,
      { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "User-Agent": "Mozilla/5.0" } },
    );
    if (!res.ok) return null;
    const arr = (await res.json()) as Suggest[];
    if (!Array.isArray(arr) || arr.length === 0) return null;
    // Better a monogram than a confidently-wrong logo: require a real name match.
    const best = arr.find((c) => c.name && nameCorresponds(q, c.name));
    if (!best?.domain) return null;
    return `https://icons.duckduckgo.com/ip3/${best.domain}.ico`;
  } catch {
    return null;
  }
}

/** FMP's ticker-keyed logo image (no API key, no server round-trip — the browser
 *  loads it). Works for both US (bare) and CA (suffixed, e.g. VCM.TO, SYH.V) listings,
 *  and 404s on unknown tickers so <StockLogo>'s onError cleanly falls back to the
 *  monogram. Used for untracked hunt finds that have no resolved UniverseMember logo. */
export function fmpLogo(symbol: string): string {
  return `https://financialmodelingprep.com/image-stock/${encodeURIComponent(symbol.trim().toUpperCase())}.png`;
}

/** White-logo verdict for the app (web StockLogo measures on a canvas; React
 *  Native has no canvas, so the server measures ONCE with sharp and the app asks
 *  in batches via /api/logo-meta). Same math as the web: mean luminance of the
 *  non-transparent mark on a 16×16 sample; > 0.82 = a light mark that needs the
 *  dark chip. Unmeasurable (fetch/decode failure) = false → the white chip, the
 *  same graceful default the web takes on a tainted canvas. Cached per URL for
 *  the process lifetime — logos are static images. */
const lightVerdicts = new Map<string, boolean>();

export async function logoIsLight(url: string): Promise<boolean> {
  const hit = lightVerdicts.get(url);
  if (hit !== undefined) return hit;
  let light = false;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      const sharp = (await import("sharp")).default;
      const { data } = await sharp(buf)
        .resize(16, 16, { fit: "fill" })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      let sum = 0;
      let n = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 40) continue; // ignore (near-)transparent pixels — the mark is what matters
        sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        n++;
      }
      light = n > 0 && sum / n / 255 > 0.82;
    }
  } catch {
    /* unmeasurable → keep the white chip */
  }
  lightVerdicts.set(url, light);
  return light;
}

/** Does FMP actually serve a logo for this ticker? (404 on unknown — checked
 *  server-side once at resolution time so we never cache a URL that would 404
 *  on every render.) */
export async function fmpLogoExists(symbol: string): Promise<boolean> {
  try {
    const res = await fetch(fmpLogo(symbol), { signal: AbortSignal.timeout(TIMEOUT_MS) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Resolve logos for any universe members not yet tried. FMP's ticker-keyed logo
 *  (proper artwork, keyed on the REAL listing ticker — `yahoo`) is tried FIRST;
 *  the legacy name→Clearbit→favicon chain is the fallback for names FMP lacks
 *  (Cam 2026-07-04 — the name-match guard missed TSM + AMD entirely while FMP
 *  had both). Stores the URL on a hit, "" on a miss, so each name is attempted
 *  exactly once. Returns hits. */
export async function backfillLogos(): Promise<number> {
  const rows = await prisma.universeMember.findMany({ where: { logoUrl: null } });
  let hits = 0;
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const batch = rows.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (r) => {
        const ticker = (r.yahoo || r.symbol).trim();
        const url = (await fmpLogoExists(ticker)) ? fmpLogo(ticker) : await resolveLogo(r.name);
        await prisma.universeMember.update({ where: { symbol: r.symbol }, data: { logoUrl: url ?? "" } });
        if (url) hits++;
      }),
    );
  }
  return hits;
}
