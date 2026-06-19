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

// Batch-queue full dossiers for a set of symbols surfaced on a page (e.g. Smart
// Money), so every ticker links to a researched — or at least "researching…" —
// stock page rather than a 404. Skips names already researched or with a request
// already on file, and caps how many NEW names enter the queue per call so a big
// page can't flood the agent's research queue: it catches up over repeat visits
// (idempotent). Symbols are normalized to bare uppercase, matching the stock page's
// route handling + the dossier journal key. Returns the number newly queued.
export async function queueDossiers(symbols: string[], requestedBy: string, cap = 12): Promise<number> {
  const keys = Array.from(new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean)));
  if (keys.length === 0) return 0;

  const [haveReq, haveJournal] = await Promise.all([
    prisma.researchRequest.findMany({ where: { symbol: { in: keys } }, select: { symbol: true } }),
    prisma.journalEntry.findMany({ where: { symbol: { in: keys } }, select: { symbol: true } }),
  ]);
  const known = new Set([...haveReq, ...haveJournal].map((r) => r.symbol));
  const toQueue = keys.filter((s) => !known.has(s)).slice(0, cap);
  if (toQueue.length === 0) return 0;

  await prisma.researchRequest.createMany({ data: toQueue.map((symbol) => ({ symbol, requestedBy })) });
  return toQueue.length;
}
