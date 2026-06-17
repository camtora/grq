import { prisma } from "./db";
import { probeYahooSymbol } from "./broker/yahoo";
import { refreshQuotesFor } from "./broker/quotes";
import { refreshBars } from "./bars";
import { universeEntry, invalidateUniverseCache, bareTicker, CANDIDATE_CAP } from "./universe";

// Promote a discovery-hunt find to a tracked CANDIDATE so it runs the FULL dossier
// pipeline (resolved quotes + bars + a queued full Dossier) and therefore gets a
// full stock page — not just the lightweight hunt lead (D, Cam 2026-06-17).
//
// Hunt names are bare TSX/TSXV tickers; we probe US → .TO → .V for a live listing.
// Never revives a RETIRED (dismissed) name, and respects the candidate cap. The
// agent still can't TRADE these — promotion into the tradeable universe remains the
// two-member decision; this only makes "researched" automatic for every find.
export type HuntPromotion = "added" | "exists" | "dismissed" | "unresolved" | "capped";

export async function promoteHuntFindToCandidate(symbol: string, name?: string | null): Promise<HuntPromotion> {
  const key = bareTicker(symbol);
  const existing = await universeEntry(key);
  if (existing) return existing.status === "RETIRED" ? "dismissed" : "exists";

  const count = await prisma.universeMember.count({ where: { status: "CANDIDATE" } });
  if (count >= CANDIDATE_CAP) return "capped";

  const tries = key.includes(".") ? [key] : [key, `${key}.TO`, `${key}.V`];
  let resolved: { yahoo: string; priceCents: number; name: string | null } | null = null;
  for (const y of tries) {
    const probe = await probeYahooSymbol(y);
    if (probe) {
      resolved = { yahoo: y, ...probe };
      break;
    }
  }
  if (!resolved) return "unresolved";

  const isCad = /\.(TO|V|NE|CN)$/i.test(resolved.yahoo);
  await prisma.universeMember.create({
    data: {
      symbol: key,
      yahoo: resolved.yahoo,
      name: name ?? resolved.name ?? key,
      status: "CANDIDATE",
      addedBy: "hunt",
      currency: isCad ? "CAD" : null,
      country: isCad ? "CA" : null,
    },
  });
  invalidateUniverseCache();
  await refreshQuotesFor([key]).catch(() => 0);
  await refreshBars([key], "1y").catch(() => 0);
  await prisma.researchRequest.create({ data: { symbol: key, requestedBy: "hunt" } });
  await prisma.journalEntry.create({
    data: {
      kind: "SYSTEM",
      symbol: key,
      title: `Hunt added ${key} to research`,
      body: `The discovery hunt surfaced ${name ?? key} (${resolved.yahoo}) — added as a CANDIDATE and queued a full dossier so it gets a complete stock page. Members decide whether to promote it into the tradeable universe.`,
    },
  });
  return "added";
}
