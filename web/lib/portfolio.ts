import { prisma } from "./db";
import { getQuoteSource } from "./broker/quotes";

export type PositionView = {
  symbol: string;
  qty: number;
  avgCostCents: number;
  lastCents: number;
  marketValueCents: number;
  unrealizedPnlCents: number;
  openedAt: Date;
};

export type PortfolioView = {
  cashCents: number;
  positions: PositionView[];
  positionsCents: number;
  navCents: number;
  contributionsCents: number;
  totalPnlCents: number;
  feeSpentMonthCents: number;
  feeBudgetCentsMonth: number;
  riskLevel: "CAUTIOUS" | "BALANCED" | "AGGRESSIVE";
  killSwitch: boolean;
  killSwitchBy: string | null;
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

  const quotes = getQuoteSource();
  const views: PositionView[] = positions.map((p) => {
    const lastCents = quotes.get(p.symbol)?.midCents ?? p.avgCostCents;
    const marketValueCents = p.qty * lastCents;
    return {
      symbol: p.symbol,
      qty: p.qty,
      avgCostCents: p.avgCostCents,
      lastCents,
      marketValueCents,
      unrealizedPnlCents: marketValueCents - p.qty * p.avgCostCents,
      openedAt: p.openedAt,
    };
  });

  const cashCents = account?.cashCents ?? 0;
  const positionsCents = views.reduce((s, p) => s + p.marketValueCents, 0);
  const navCents = cashCents + positionsCents;
  const contributionsCents = contributions._sum.amountCents ?? 0;

  return {
    cashCents,
    positions: views,
    positionsCents,
    navCents,
    contributionsCents,
    totalPnlCents: navCents - contributionsCents,
    feeSpentMonthCents: fees._sum.commissionCents ?? 0,
    feeBudgetCentsMonth: settings?.feeBudgetCentsMonth ?? 2000,
    riskLevel: settings?.riskLevel ?? "BALANCED",
    killSwitch: settings?.killSwitch ?? false,
    killSwitchBy: settings?.killSwitchBy ?? null,
  };
}

export async function getNavHistory(limit = 60) {
  const rows = await prisma.navSnapshot.findMany({
    orderBy: { at: "desc" },
    take: limit,
  });
  return rows.reverse();
}
