import { prisma } from "./db";
import { getQuotes } from "./broker/quotes";
import { benchmarkValueCents } from "./broker/sim";
import { toCadCents, usdCadRate } from "./fx";

// The fund's real track record begins at the IBKR-paper inception. The original
// paper soak opened 2026-06-17, but on 2026-06-26 a member balance-reset the paper
// account (cleared all positions; see the reset gotcha + DECISIONS) and we RESTARTED
// the soak from a clean $50k USD baseline at noon ET. Performance views — the NAV
// chart, day-open baselines, the soak clock — reference this inception, not the prior
// run (which stays in the DB as honest history). Override with GRQ_PAPER_INCEPTION
// (env change + --force-recreate, no rebuild) once the restart anchor is finalized.
export const PAPER_INCEPTION = (() => {
  const env = process.env.GRQ_PAPER_INCEPTION ? new Date(process.env.GRQ_PAPER_INCEPTION) : null;
  return env && !isNaN(env.getTime()) ? env : new Date("2026-06-26T16:00:00Z");
})();

export type PositionView = {
  symbol: string;
  qty: number;
  avgCostCents: number;
  lastCents: number;
  marketValueCents: number; // native currency
  marketValueCadCents: number; // valued in CAD (USD×fx); == marketValueCents for CAD names
  currency: string;
  unrealizedPnlCents: number; // native currency
  dayChangeBps: number;
  openedAt: Date;
};

export type PortfolioView = {
  // All totals are CAD. cashCents = TOTAL cash valued in CAD (cadCashCents +
  // usdCashCents×fx); raw per-currency balances are below it (D34, multi-currency).
  cashCents: number;
  cadCashCents: number;
  usdCashCents: number;
  fxUsdCad: number | null;
  positions: PositionView[];
  positionsCents: number; // Σ positions valued in CAD
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

  const fxUsdCad = await usdCadRate();
  const quotes = await getQuotes(positions.map((p) => p.symbol));
  let quotesAsOf: Date | null = null;
  const views: PositionView[] = positions.map((p) => {
    const q = quotes.get(p.symbol);
    const lastCents = q?.midCents ?? p.avgCostCents;
    if (q && (!quotesAsOf || q.at < quotesAsOf)) quotesAsOf = q.at;
    const marketValueCents = p.qty * lastCents; // native currency
    return {
      symbol: p.symbol,
      qty: p.qty,
      avgCostCents: p.avgCostCents,
      lastCents,
      marketValueCents,
      marketValueCadCents: toCadCents(marketValueCents, p.currency, fxUsdCad),
      currency: p.currency,
      unrealizedPnlCents: marketValueCents - p.qty * p.avgCostCents,
      dayChangeBps: q?.dayChangeBps ?? 0,
      openedAt: p.openedAt,
    };
  });

  const cadCashCents = account?.cashCents ?? 0;
  const usdCashCents = account?.usdCashCents ?? 0;
  const cashCents = cadCashCents + toCadCents(usdCashCents, "USD", fxUsdCad); // total, in CAD
  const positionsCents = views.reduce((s, p) => s + p.marketValueCadCents, 0); // CAD
  const navCents = cashCents + positionsCents;
  const contributionsCents = contributions._sum.amountCents ?? 0;
  const benchmarkCents = await benchmarkValueCents().catch(() => null);

  return {
    cashCents,
    cadCashCents,
    usdCashCents,
    fxUsdCad,
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
