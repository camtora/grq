import { prisma } from "./db";
import { getQuotes } from "./broker/quotes";
import { benchmarkValueCents } from "./broker/sim";

// The fund's real track record begins at the IBKR-paper open (2026-06-17, 9:30 ET
// = 13:30 UTC). The sim run before that was a rehearsal on a different (5k) account,
// so performance views — the NAV chart, day-open baselines — reference this inception,
// not the sim history (which stays in the DB). See docs/DECISIONS.md D33.
export const PAPER_INCEPTION = new Date("2026-06-17T13:30:00Z");

export type PositionView = {
  symbol: string;
  qty: number;
  avgCostCents: number;
  lastCents: number;
  marketValueCents: number;
  unrealizedPnlCents: number;
  dayChangeBps: number;
  openedAt: Date;
};

export type PortfolioView = {
  cashCents: number;
  positions: PositionView[];
  positionsCents: number;
  navCents: number;
  contributionsCents: number;
  totalPnlCents: number;
  benchmarkCents: number | null;
  feeSpentMonthCents: number;
  feeBudgetCentsMonth: number;
  riskLevel: "CAUTIOUS" | "BALANCED" | "AGGRESSIVE";
  killSwitch: boolean;
  killSwitchBy: string | null;
  quotesAsOf: Date | null;
};

export async function getPortfolio(): Promise<PortfolioView> {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [account, positions, contributions, settings, fees] = await Promise.all([
    prisma.account.findUnique({ where: { id: 1 } }),
    prisma.position.findMany({ orderBy: { symbol: "asc" } }),
    prisma.contribution.aggregate({ _sum: { amountCents: true } }),
    prisma.settings.findUnique({ where: { id: 1 } }),
    prisma.trade.aggregate({ where: { at: { gte: monthStart } }, _sum: { commissionCents: true } }),
  ]);

  const quotes = await getQuotes(positions.map((p) => p.symbol));
  let quotesAsOf: Date | null = null;
  const views: PositionView[] = positions.map((p) => {
    const q = quotes.get(p.symbol);
    const lastCents = q?.midCents ?? p.avgCostCents;
    if (q && (!quotesAsOf || q.at < quotesAsOf)) quotesAsOf = q.at;
    const marketValueCents = p.qty * lastCents;
    return {
      symbol: p.symbol,
      qty: p.qty,
      avgCostCents: p.avgCostCents,
      lastCents,
      marketValueCents,
      unrealizedPnlCents: marketValueCents - p.qty * p.avgCostCents,
      dayChangeBps: q?.dayChangeBps ?? 0,
      openedAt: p.openedAt,
    };
  });

  const cashCents = account?.cashCents ?? 0;
  const positionsCents = views.reduce((s, p) => s + p.marketValueCents, 0);
  const navCents = cashCents + positionsCents;
  const contributionsCents = contributions._sum.amountCents ?? 0;
  const benchmarkCents = await benchmarkValueCents().catch(() => null);

  return {
    cashCents,
    positions: views,
    positionsCents,
    navCents,
    contributionsCents,
    totalPnlCents: navCents - contributionsCents,
    benchmarkCents,
    feeSpentMonthCents: fees._sum.commissionCents ?? 0,
    feeBudgetCentsMonth: settings?.feeBudgetCentsMonth ?? 2000,
    riskLevel: settings?.riskLevel ?? "BALANCED",
    killSwitch: settings?.killSwitch ?? false,
    killSwitchBy: settings?.killSwitchBy ?? null,
    quotesAsOf,
  };
}

export async function getNavHistory(limit = 60) {
  const rows = await prisma.navSnapshot.findMany({
    where: { at: { gte: PAPER_INCEPTION } },
    orderBy: { at: "desc" },
    take: limit,
  });
  return rows.reverse();
}
