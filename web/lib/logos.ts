import { prisma } from "./db";

// Automated company-logo resolution — no hand-map (Cam, 2026-06-14). Company
// name → Clearbit autocomplete (gives the official domain) → DuckDuckGo favicon
// by that domain. Cached on UniverseMember.logoUrl: null = not yet tried,
// "" = tried, none found, URL = use it. When an FMP key lands, FMP's
// ticker-keyed logos become the higher-fidelity upgrade (see docs/DATA-PROCUREMENT.md).

const TIMEOUT_MS = 8000;
const CONCURRENCY = 4;

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
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
    const nq = norm(q);
    // Require the suggestion's name to actually correspond to ours — never blindly
    // take the first result. Better a monogram than a confidently-wrong logo
    // (e.g. "BCE" matching Boston College / bc.edu).
    const best =
      arr.find((c) => c.name && norm(c.name) === nq) ??
      arr.find((c) => {
        if (!c.name) return false;
        const cn = norm(c.name);
        return cn.length >= 4 && nq.length >= 4 && (cn.startsWith(nq) || nq.startsWith(cn));
      });
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
