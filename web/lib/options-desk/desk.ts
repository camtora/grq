import { prisma } from "@/lib/db";
import { getQuotes } from "@/lib/broker/quotes";
import { usdCadRate, toCadCents } from "@/lib/fx";
import { getPortfolio } from "@/lib/portfolio";
import { daysToExpiry } from "@/lib/options/price";
import { modelLabel } from "@/lib/race/models";

// Read side for the Options Desk: value each arm's own book LIVE (stocks → live quotes, options →
// the engine's stored per-share mark), rank, and assemble per-arm detail + the NAV-over-time series.
// Reads only the OptionsDesk/Desk* tables (+ getPortfolio for the optional real-fund reference) — the
// real fund's book is never mutated here. The plain-English option cards are the literacy surface.

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

export type DeskHolding = {
  kind: "STOCK" | "CALL" | "PUT";
  underlying: string;
  qty: number;
  avgCostCents: number;
  currency: string;
  markCents: number; // per-share (stock price / option premium)
  mvCadCents: number;
  unrealCadCents: number;
  // option-only teaching fields
  strikeCents?: number;
  expiry?: string;
  daysLeft?: number;
  breakevenCents?: number;
  maxLossCadCents?: number;
  card?: string; // plain-English explainer
};
export type DeskTradeView = { at: Date; side: string; kind: string; underlying: string; strikeCents: number | null; expiry: string | null; qty: number; priceCents: number; currency: string; realizedPnlCents: number | null };
export type DeskCallView = { sessionAt: Date; action: string | null; underlying: string | null; right: string | null; strikeCents: number | null; expiry: string | null; qty: number | null; confidence: number | null; thesis: string | null; filled: boolean; rejectReason: string | null };
export type DeskStanding = {
  entrantId: number;
  label: string;
  arm: string;
  model: string;
  navCadCents: number;
  startingStakeCents: number;
  returnPct: number;
  cashCents: number;
  cashPct: number;
  positionsCadCents: number;
  optionsCadCents: number;
  openOptionCount: number;
  tradeCount: number;
  holdings: DeskHolding[];
  trades: DeskTradeView[];
  calls: DeskCallView[];
  navHistory: { at: Date; returnPct: number }[];
};
export type DeskView = {
  desk: { id: number; name: string; cadence: string; status: string; startingStakeCents: number; startedAt: Date | null };
  arms: DeskStanding[]; // control first, then treatment
  realFund: { returnPct: number; navCents: number } | null;
  fxUsdCad: number | null;
};

function optionCard(right: "CALL" | "PUT", underlying: string, strikeCents: number, expiry: string, qty: number, avgCostCents: number, breakevenCents: number, daysLeft: number, maxLossCadCents: number): string {
  const dir = right === "CALL" ? "rises above" : "falls below";
  const decay = daysLeft > 0 ? ` It has ${daysLeft} day${daysLeft === 1 ? "" : "s"} left — options lose value as expiry nears, so ${underlying} needs to move, not drift.` : " It has expired and will settle to its intrinsic value.";
  return `Bought ${qty} ${underlying} ${expiry} ${money(strikeCents)} ${right.toLowerCase()}${qty === 1 ? "" : "s"} at ${money(avgCostCents)}/share. It's a bet that ${underlying} ${dir} ${money(breakevenCents)} (the strike ${right === "CALL" ? "+" : "−"} the premium) by ${expiry}. The most it can lose is ${money(maxLossCadCents)} CAD — the premium paid, nothing more.${decay}`;
}

export async function listDesks(): Promise<{ id: number; name: string; status: string }[]> {
  const desks = await prisma.optionsDesk.findMany({ orderBy: { id: "asc" }, select: { id: true, name: true, status: true } });
  return desks;
}

/** A specific desk's full detail, or (no id) the first running/paused desk. */
export async function loadDesk(deskId?: number): Promise<DeskView | null> {
  const desk = deskId
    ? await prisma.optionsDesk.findUnique({ where: { id: deskId } })
    : (await prisma.optionsDesk.findFirst({ where: { status: { in: ["RUNNING", "PAUSED"] } }, orderBy: { id: "asc" } })) ?? (await prisma.optionsDesk.findFirst({ orderBy: { id: "asc" } }));
  if (!desk) return null;

  const entrants = await prisma.deskEntrant.findMany({ where: { deskId: desk.id }, orderBy: { id: "asc" } });
  const ids = entrants.map((e) => e.id);
  const now = new Date();
  const [positions, trades, calls, navSnaps, fx] = await Promise.all([
    prisma.deskPosition.findMany({ where: { entrantId: { in: ids } } }),
    prisma.deskTrade.findMany({ where: { entrantId: { in: ids } }, orderBy: { at: "desc" }, take: 300 }),
    prisma.deskCall.findMany({ where: { entrantId: { in: ids } }, orderBy: { sessionAt: "desc" }, take: 300 }),
    prisma.deskNavSnapshot.findMany({ where: { entrantId: { in: ids } }, orderBy: { at: "asc" } }),
    usdCadRate().catch(() => null),
  ]);
  const stockSyms = [...new Set(positions.filter((p) => p.kind === "STOCK").map((p) => p.underlying))];
  const quotes = stockSyms.length ? await getQuotes(stockSyms) : new Map();
  const stake = desk.startingStakeCents;
  const retOf = (navCents: number) => (stake > 0 ? ((navCents - stake) / stake) * 100 : 0);

  const arms: DeskStanding[] = entrants
    .map((e) => {
      const myPos = positions.filter((p) => p.entrantId === e.id);
      let positionsCad = 0;
      let optionsCad = 0;
      const holdings: DeskHolding[] = myPos.map((p) => {
        if (p.kind === "STOCK") {
          const q = quotes.get(p.underlying.toUpperCase());
          const mark = q && q.midCents > 0 ? q.midCents : p.avgCostCents;
          const mvCad = toCadCents(p.qty * mark, p.currency, fx);
          positionsCad += mvCad;
          return { kind: "STOCK" as const, underlying: p.underlying, qty: p.qty, avgCostCents: p.avgCostCents, currency: p.currency, markCents: mark, mvCadCents: mvCad, unrealCadCents: toCadCents(p.qty * (mark - p.avgCostCents), p.currency, fx) };
        }
        const right = p.kind as "CALL" | "PUT";
        const mark = p.lastMarkCents != null && p.lastMarkCents > 0 ? p.lastMarkCents : p.avgCostCents;
        const mvCad = toCadCents(p.qty * 100 * mark, p.currency, fx);
        positionsCad += mvCad;
        optionsCad += mvCad;
        const strikeCents = p.strikeCents ?? 0;
        const breakevenCents = right === "CALL" ? strikeCents + p.avgCostCents : strikeCents - p.avgCostCents;
        const daysLeft = p.expiry ? daysToExpiry(p.expiry, now) : 0;
        const maxLossCadCents = toCadCents(p.qty * 100 * p.avgCostCents, p.currency, fx);
        return {
          kind: right,
          underlying: p.underlying,
          qty: p.qty,
          avgCostCents: p.avgCostCents,
          currency: p.currency,
          markCents: mark,
          mvCadCents: mvCad,
          unrealCadCents: toCadCents(p.qty * 100 * (mark - p.avgCostCents), p.currency, fx),
          strikeCents,
          expiry: p.expiry ?? undefined,
          daysLeft,
          breakevenCents,
          maxLossCadCents,
          card: optionCard(right, p.underlying, strikeCents, p.expiry ?? "", p.qty, p.avgCostCents, breakevenCents, daysLeft, maxLossCadCents),
        };
      });
      const navCadCents = e.cashCents + positionsCad;
      const myTrades = trades.filter((t) => t.entrantId === e.id);
      return {
        entrantId: e.id,
        label: e.label,
        arm: e.arm,
        model: e.model,
        navCadCents,
        startingStakeCents: stake,
        returnPct: retOf(navCadCents),
        cashCents: e.cashCents,
        cashPct: navCadCents > 0 ? (e.cashCents / navCadCents) * 100 : 100,
        positionsCadCents: positionsCad,
        optionsCadCents: optionsCad,
        openOptionCount: holdings.filter((h) => h.kind !== "STOCK").length,
        tradeCount: myTrades.length,
        holdings: holdings.sort((a, b) => b.mvCadCents - a.mvCadCents),
        trades: myTrades.slice(0, 14).map((t) => ({ at: t.at, side: t.side, kind: t.kind, underlying: t.underlying, strikeCents: t.strikeCents, expiry: t.expiry, qty: t.qty, priceCents: t.priceCents, currency: t.currency, realizedPnlCents: t.realizedPnlCents })),
        calls: calls.filter((c) => c.entrantId === e.id).slice(0, 14).map((c) => ({ sessionAt: c.sessionAt, action: c.action, underlying: c.underlying, right: c.right, strikeCents: c.strikeCents, expiry: c.expiry, qty: c.qty, confidence: c.confidence, thesis: c.thesis, filled: c.filled, rejectReason: c.rejectReason })),
        navHistory: navSnaps.filter((n) => n.entrantId === e.id).map((n) => ({ at: n.at, returnPct: retOf(n.navCadCents) })),
      };
    })
    // control first, treatment second (stable, readable order — not leaderboard-ranked, it's a 2-arm A/B)
    .sort((a, b) => (a.arm === "control" ? -1 : 1) - (b.arm === "control" ? -1 : 1));

  let realFund: { returnPct: number; navCents: number } | null = null;
  try {
    const pf = await getPortfolio();
    realFund = { returnPct: pf.contributionsCents > 0 ? (pf.totalPnlCents / pf.contributionsCents) * 100 : 0, navCents: pf.navCents };
  } catch {
    /* reference only */
  }

  return { desk, arms, realFund, fxUsdCad: fx };
}

export const ARM_COLORS: Record<string, string> = { control: "#5eead4", treatment: "#fbbf24" };
export { modelLabel };
