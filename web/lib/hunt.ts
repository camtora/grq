import { prisma } from "./db";
import { universeEntry, bareTicker } from "./universe";

// Queue a FULL dossier for a discovery-hunt find — researched and ready for when a
// member clicks it, WITHOUT adding it to the universe/Watchlist (Cam, 2026-06-17, D30).
// The hunt surfaces a lot of names; members don't want them all on the Watchlist —
// just the research waiting on the stock page. Watching a find (the member's choice)
// is what adds it as a tracked CANDIDATE.
//
// The full dossier (runStockDossier → "Dossier — TICKER") is web-research-driven, so
// it's useful even for a bare TSX/TSXV ticker we don't yet track (no live quote/signals
// until the member watches it and it becomes tracked). Skips names already tracked,
// already researched, or with a dossier in flight.
export type HuntQueue = "queued" | "tracked" | "exists" | "pending";

export async function queueHuntDossier(symbol: string): Promise<HuntQueue> {
  const key = bareTicker(symbol);

  // Already a universe member (watchlist/active/retired) — it has its own research flow.
  if (await universeEntry(key)) return "tracked";

  const pending = await prisma.researchRequest.count({
    where: { symbol: key, status: { in: ["QUEUED", "RUNNING"] } },
  });
  if (pending > 0) return "pending";

  const haveDossier = await prisma.journalEntry.count({
    where: { kind: "RESEARCH", symbol: key, title: { startsWith: "Dossier" } },
  });
  if (haveDossier > 0) return "exists";

  await prisma.researchRequest.create({ data: { symbol: key, requestedBy: "hunt" } });
  return "queued";
}
