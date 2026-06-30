import { prisma } from "@/lib/db";
import { getQuotes } from "@/lib/broker/quotes";
import { usdCadRate, toCadCents } from "@/lib/fx";
import { getPortfolio } from "@/lib/portfolio";
import { modelLabel } from "@/lib/race/models";

// Read side for the Bull Races: value every bull's own book LIVE (mark positions to current
// quotes), rank them, and assemble the per-bull detail + the NAV-over-time series (from the
// snapshots the engine wrote). Reads only the Race* tables (+ getPortfolio for the optional real-
// fund reference) — the real fund's book is never mutated here.

export type BullHolding = { symbol: string; qty: number; avgCostCents: number; currency: string; lastNative: number; mvCadCents: number; unrealCadCents: number };
export type BullTradeView = { at: Date; side: string; symbol: string; qty: number; priceCents: number; currency: string; realizedPnlCents: number | null };
export type BullCallView = { sessionAt: Date; action: string | null; symbol: string | null; qty: number | null; confidence: number | null; thesis: string | null; filled: boolean; rejectReason: string | null };
export type BullStanding = {
  entrantId: number;
  label: string;
  model: string;
  dial: string;
  navCadCents: number;
  startingStakeCents: number;
  returnPct: number;
  cashCents: number;
  cashPct: number;
  positionsCadCents: number;
  tradeCount: number;
  holdings: BullHolding[];
  trades: BullTradeView[];
  calls: BullCallView[];
  navHistory: { at: Date; returnPct: number }[];
};
export type BullRaceView = {
  race: { id: number; name: string; cadence: string; status: string; startingStakeCents: number; startedAt: Date | null };
  bulls: BullStanding[]; // leader-first
  realFund: { returnPct: number; navCents: number } | null;
  fxUsdCad: number | null;
};

export type RaceSummary = {
  id: number;
  name: string;
  status: string;
  cadence: string;
  startingStakeCents: number;
  entrantCount: number;
  startedAt: Date | null;
  leader: { label: string; returnPct: number } | null;
};

/** All races, with a cheap leader read (latest NAV snapshot per bull — no live re-mark). For the
 *  hub switcher. */
export async function listRaces(): Promise<RaceSummary[]> {
  const races = await prisma.race.findMany({
    orderBy: { id: "asc" },
    include: { entrants: { include: { navSnaps: { orderBy: { at: "desc" }, take: 1 }, _count: { select: { trades: true } } } } },
  });
  return races.map((r) => {
    let leader: { label: string; returnPct: number } | null = null;
    for (const e of r.entrants) {
      if (e._count.trades === 0) continue; // a bull that's never traded isn't placed — can't be leader (D-A)
      const nav = e.navSnaps[0]?.navCadCents ?? e.cashCents;
      const returnPct = r.startingStakeCents > 0 ? ((nav - r.startingStakeCents) / r.startingStakeCents) * 100 : 0;
      if (!leader || returnPct > leader.returnPct) leader = { label: e.label, returnPct };
    }
    return { id: r.id, name: r.name, status: r.status, cadence: r.cadence, startingStakeCents: r.startingStakeCents, entrantCount: r.entrants.length, startedAt: r.startedAt, leader };
  });
}

/** A specific race's full detail, or (no id) the first running/paused race. */
export async function loadBullRace(raceId?: number): Promise<BullRaceView | null> {
  const race = raceId
    ? await prisma.race.findUnique({ where: { id: raceId } })
    : (await prisma.race.findFirst({ where: { status: { in: ["RUNNING", "PAUSED"] } }, orderBy: { id: "asc" } })) ??
      (await prisma.race.findFirst({ orderBy: { id: "asc" } }));
  if (!race) return null;

  const entrants = await prisma.raceEntrant.findMany({ where: { raceId: race.id }, orderBy: { id: "asc" } });
  const ids = entrants.map((e) => e.id);
  const [positions, trades, calls, navSnaps, fx] = await Promise.all([
    prisma.racePosition.findMany({ where: { entrantId: { in: ids } } }),
    prisma.raceTrade.findMany({ where: { entrantId: { in: ids } }, orderBy: { at: "desc" }, take: 300 }),
    prisma.raceCall.findMany({ where: { entrantId: { in: ids } }, orderBy: { sessionAt: "desc" }, take: 300 }),
    prisma.raceNavSnapshot.findMany({ where: { entrantId: { in: ids } }, orderBy: { at: "asc" } }),
    usdCadRate().catch(() => null),
  ]);
  const quotes = await getQuotes([...new Set(positions.map((p) => p.symbol))]);
  const stake = race.startingStakeCents;
  const retOf = (navCents: number) => (stake > 0 ? ((navCents - stake) / stake) * 100 : 0);

  const bulls: BullStanding[] = entrants
    .map((e) => {
      const myPos = positions.filter((p) => p.entrantId === e.id);
      let positionsCad = 0;
      const holdings = myPos.map((p) => {
        const q = quotes.get(p.symbol.toUpperCase());
        const lastNative = q && q.midCents > 0 ? q.midCents : p.avgCostCents;
        const mvCadCents = toCadCents(p.qty * lastNative, p.currency, fx);
        positionsCad += mvCadCents;
        return { symbol: p.symbol, qty: p.qty, avgCostCents: p.avgCostCents, currency: p.currency, lastNative, mvCadCents, unrealCadCents: toCadCents(p.qty * (lastNative - p.avgCostCents), p.currency, fx) };
      });
      const navCadCents = e.cashCents + positionsCad;
      const myTradeRows = trades.filter((t) => t.entrantId === e.id);
      return {
        entrantId: e.id,
        label: e.label,
        model: e.model,
        dial: e.dial,
        navCadCents,
        startingStakeCents: stake,
        returnPct: retOf(navCadCents),
        cashCents: e.cashCents,
        cashPct: navCadCents > 0 ? (e.cashCents / navCadCents) * 100 : 100,
        positionsCadCents: positionsCad,
        tradeCount: myTradeRows.length,
        holdings: holdings.sort((a, b) => b.mvCadCents - a.mvCadCents),
        trades: myTradeRows.slice(0, 12).map((t) => ({ at: t.at, side: t.side, symbol: t.symbol, qty: t.qty, priceCents: t.priceCents, currency: t.currency, realizedPnlCents: t.realizedPnlCents })),
        calls: calls.filter((c) => c.entrantId === e.id).slice(0, 12).map((c) => ({ sessionAt: c.sessionAt, action: c.action, symbol: c.symbol, qty: c.qty, confidence: c.confidence, thesis: c.thesis, filled: c.filled, rejectReason: c.rejectReason })),
        navHistory: navSnaps.filter((n) => n.entrantId === e.id).map((n) => ({ at: n.at, returnPct: retOf(n.navCadCents) })),
      };
    })
    .sort((a, b) => {
      // Untraded bulls aren't placed — they sort below everyone with ≥1 fill (D-A). Among the
      // rest, rank by live NAV.
      const at = a.tradeCount > 0 ? 1 : 0;
      const bt = b.tradeCount > 0 ? 1 : 0;
      if (at !== bt) return bt - at;
      return b.navCadCents - a.navCadCents;
    });

  let realFund: { returnPct: number; navCents: number } | null = null;
  try {
    const pf = await getPortfolio();
    realFund = { returnPct: pf.contributionsCents > 0 ? (pf.totalPnlCents / pf.contributionsCents) * 100 : 0, navCents: pf.navCents };
  } catch {
    /* reference only — fine to omit */
  }

  return { race, bulls, realFund, fxUsdCad: fx };
}

// Stable color per bull for the chart + dial badge tones.
export const BULL_COLORS = ["#5eead4", "#fbbf24", "#f472b6", "#60a5fa", "#a78bfa", "#34d399", "#fb923c", "#f87171", "#22d3ee", "#c084fc"];
export function dialTone(dial: string): "green" | "teal" | "red" {
  return dial === "AGGRESSIVE" ? "red" : dial === "CAUTIOUS" ? "green" : "teal";
}
export { modelLabel };
