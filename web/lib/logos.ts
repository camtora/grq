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

/** Resolve logos for any universe members not yet tried. Stores the URL on a
 *  hit, "" on a miss, so each name is attempted exactly once. Returns hits. */
export async function backfillLogos(): Promise<number> {
  const rows = await prisma.universeMember.findMany({ where: { logoUrl: null } });
  let hits = 0;
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const batch = rows.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (r) => {
        const url = await resolveLogo(r.name);
        await prisma.universeMember.update({ where: { symbol: r.symbol }, data: { logoUrl: url ?? "" } });
        if (url) hits++;
      }),
    );
  }
  return hits;
}
