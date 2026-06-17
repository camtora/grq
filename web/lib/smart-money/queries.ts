// Smart Money read models (D27) — turns the cache tables into the view models the
// /market/smart-money page renders. Everything here is SERIALIZABLE (bigint →
// number) so a server component can hand it straight to client cards. Dollar
// figures are USD reference values, not fund cents.

import { prisma } from "../db";
import { bareTicker } from "../universe";
import { ROSTER_FUNDS, ROSTER_CONGRESS, type RosterPerson } from "./portfolios";
import { fmtUsd } from "./types";
import type {
  SmHolding,
  SmPortfolio,
  CongressLeader,
  FundLeader,
  InsiderBuy,
  InsiderCluster,
  CongressTrade,
} from "./types";

export type {
  SmHolding,
  SmPortfolio,
  CongressLeader,
  FundLeader,
  InsiderBuy,
  InsiderCluster,
  CongressTrade,
} from "./types";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

// Normalize an insider name for cross-source dedup ("Ra Capital Management, L.P."
// and "RA CAPITAL MANAGEMENT, L.P." → same key).
const normName = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

const TOP_HOLDINGS = 12;

/** Roster funds, each with its latest 13F snapshot + top holdings. */
export async function getPortfolios(): Promise<SmPortfolio[]> {
  const out: SmPortfolio[] = [];
  for (const f of ROSTER_FUNDS) {
    const snap = await prisma.portfolioSnapshot.findFirst({
      where: { cik: f.cik },
      orderBy: { asOf: "desc" },
      include: { holdings: { orderBy: { rank: "asc" } } },
    });
    if (!snap) continue;
    const holdings: SmHolding[] = snap.holdings.map((h) => ({
      symbol: h.symbol,
      name: h.name,
      shares: Number(h.shares),
      valueUsd: Number(h.valueUsd),
      pctOfPort: h.pctOfPort,
      putCall: (h.putCall as "PUT" | "CALL" | null) ?? null,
      action: h.action,
      qoqSharesPct: h.qoqSharesPct,
      rank: h.rank,
    }));
    out.push({
      slug: f.slug,
      name: f.name,
      firm: f.firm,
      blurb: f.blurb,
      accent: f.accent ?? null,
      avatar: f.avatar ?? null,
      cik: f.cik,
      asOf: snap.asOf.toISOString().slice(0, 10),
      totalValueUsd: Number(snap.totalValueUsd),
      holdingsCount: snap.holdingsCount,
      securitiesAdded: snap.securitiesAdded,
      securitiesRemoved: snap.securitiesRemoved,
      perf1yPct: snap.perf1yPct,
      topHoldings: holdings.slice(0, TOP_HOLDINGS),
      hasPuts: holdings.some((h) => h.putCall === "PUT"),
    });
  }
  return out;
}

/** Most-bought by Congress over a window, ranked by distinct members then trades. */
export async function getCongressLeaderboard(days = 90, limit = 8): Promise<CongressLeader[]> {
  const rows = await prisma.politicalTrade.findMany({
    where: { side: "BUY", txnDate: { gte: daysAgo(days) } },
    select: { symbol: true, assetName: true, memberName: true },
  });
  const by = new Map<string, { assetName: string; members: Set<string>; trades: number }>();
  for (const r of rows) {
    if (!r.symbol) continue;
    let e = by.get(r.symbol);
    if (!e) by.set(r.symbol, (e = { assetName: r.assetName, members: new Set(), trades: 0 }));
    e.members.add(r.memberName);
    e.trades++;
  }
  return [...by.entries()]
    .map(([symbol, e]) => ({ symbol, assetName: e.assetName, buyers: e.members.size, trades: e.trades, members: [...e.members] }))
    .sort((a, b) => b.buyers - a.buyers || b.trades - a.trades)
    .slice(0, limit);
}

/** Names the most roster funds NEWLY bought or ADDED to in their latest 13F. */
export async function getFundsPilingIn(limit = 8): Promise<FundLeader[]> {
  const by = new Map<string, { name: string; funds: Set<string>; value: number }>();
  for (const f of ROSTER_FUNDS) {
    const snap = await prisma.portfolioSnapshot.findFirst({
      where: { cik: f.cik },
      orderBy: { asOf: "desc" },
      include: { holdings: { where: { action: { in: ["NEW", "ADD"] }, putCall: null } } },
    });
    if (!snap) continue;
    for (const h of snap.holdings) {
      let e = by.get(h.symbol);
      if (!e) by.set(h.symbol, (e = { name: h.name, funds: new Set(), value: 0 }));
      e.funds.add(f.name);
      e.value += Number(h.valueUsd);
    }
  }
  return [...by.entries()]
    .map(([symbol, e]) => ({ symbol, name: e.name, funds: e.funds.size, fundNames: [...e.funds], totalValueUsd: e.value }))
    .sort((a, b) => b.funds - a.funds || b.totalValueUsd - a.totalValueUsd)
    .slice(0, limit);
}

/** Biggest open-market insider purchases over a window (FMP ∪ OpenInsider, deduped). */
export async function getInsiderTopBuys(days = 14, limit = 12): Promise<InsiderBuy[]> {
  const rows = await prisma.insiderTrade.findMany({
    where: { side: "BUY", txnDate: { gte: daysAgo(days) } },
    orderBy: { valueUsd: "desc" },
  });
  const seen = new Set<string>();
  const out: InsiderBuy[] = [];
  for (const r of rows) {
    // One row per insider+stock (FMP and OpenInsider report the same buy with
    // different name casing / lot dates) — keep the largest, since rows are
    // already value-desc.
    const k = `${r.symbol}|${normName(r.insiderName)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({
      symbol: r.symbol,
      companyName: r.companyName,
      insiderName: r.insiderName,
      insiderTitle: r.insiderTitle,
      valueUsd: r.valueUsd,
      shares: r.shares,
      priceUsd: r.priceUsd,
      txnDate: r.txnDate.toISOString().slice(0, 10),
      source: r.source,
      link: r.link,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** Stocks several DIFFERENT insiders bought recently — the cluster-buy signal. */
export async function getInsiderClusters(days = 30, limit = 6): Promise<InsiderCluster[]> {
  const rows = await prisma.insiderTrade.findMany({
    where: { side: "BUY", txnDate: { gte: daysAgo(days) } },
    select: { symbol: true, insiderName: true, valueUsd: true },
  });
  const by = new Map<string, { insiders: Map<string, number>; value: number }>();
  for (const r of rows) {
    let e = by.get(r.symbol);
    if (!e) by.set(r.symbol, (e = { insiders: new Map(), value: 0 }));
    // Count DISTINCT insiders, taking the larger value when one appears via both
    // sources — so a single buyer reported twice isn't a "cluster" and isn't double-counted.
    const nm = normName(r.insiderName);
    e.insiders.set(nm, Math.max(e.insiders.get(nm) ?? 0, r.valueUsd));
  }
  return [...by.entries()]
    .map(([symbol, e]) => ({ symbol, insiders: e.insiders.size, totalValueUsd: [...e.insiders.values()].reduce((s, v) => s + v, 0) }))
    .filter((c) => c.insiders >= 2)
    .sort((a, b) => b.insiders - a.insiders || b.totalValueUsd - a.totalValueUsd)
    .slice(0, limit);
}

export type CongressMemberTrades = { person: RosterPerson; trades: CongressTrade[] };

/** Recent disclosed trades for the roster's tracked members of Congress. */
export async function getCongressMembers(days = 180, perMember = 10): Promise<CongressMemberTrades[]> {
  const out: CongressMemberTrades[] = [];
  for (const p of ROSTER_CONGRESS) {
    const rows = await prisma.politicalTrade.findMany({
      where: { memberName: { contains: p.matchLastName, mode: "insensitive" }, txnDate: { gte: daysAgo(days) } },
      orderBy: { txnDate: "desc" },
      take: perMember,
    });
    out.push({
      person: p,
      trades: rows.map((r) => ({
        symbol: r.symbol,
        assetName: r.assetName,
        side: r.side,
        amountRange: r.amountRange,
        txnDate: r.txnDate.toISOString().slice(0, 10),
        link: r.link,
      })),
    });
  }
  return out;
}

// --- Per-symbol smart money (stock page panel + agent decision context) -------
export type SymbolFundHolder = {
  slug: string;
  name: string;
  firm: string;
  avatar: string | null;
  accent: string | null;
  asOf: string;
  pctOfPort: number;
  shares: number;
  action: string;
  putCall: "PUT" | "CALL" | null;
};
export type SymbolPersonTrade = {
  slug: string;
  name: string;
  role: string;
  avatar: string | null;
  accent: string | null;
  trades: CongressTrade[];
};
export type SymbolSmartMoney = {
  symbol: string;
  fundHolders: SymbolFundHolder[]; // roster funds that hold/short it (latest 13F)
  people: SymbolPersonTrade[]; // roster members of Congress who traded it
  congressBuyers: number; // distinct members (any) who bought, 180d
  congressSellers: number;
  insiderBuyers: number; // distinct insiders who bought, 90d
  insiderBuyValueUsd: number;
  hasAny: boolean;
};

/** Everything smart-money we know about ONE symbol — the tracked roster's
 *  positions/trades in it, plus aggregate congress/insider activity. Shared by
 *  the stock-page panel and the agent's decision context. */
export async function getSmartMoneyForSymbol(symbol: string): Promise<SymbolSmartMoney> {
  const sym = bareTicker(symbol); // tables store bare US tickers (cross-listings included)
  const ciks = ROSTER_FUNDS.map((f) => f.cik);

  const [holdingRows, congressBuys, congressSells, insiderBuyRows] = await Promise.all([
    prisma.portfolioHolding.findMany({
      where: { symbol: sym, snapshot: { cik: { in: ciks } } },
      include: { snapshot: { select: { cik: true, asOf: true } } },
    }),
    prisma.politicalTrade.findMany({ where: { symbol: sym, side: "BUY", txnDate: { gte: daysAgo(180) } }, select: { memberName: true } }),
    prisma.politicalTrade.findMany({ where: { symbol: sym, side: "SELL", txnDate: { gte: daysAgo(180) } }, select: { memberName: true } }),
    prisma.insiderTrade.findMany({ where: { symbol: sym, side: "BUY", txnDate: { gte: daysAgo(90) } }, select: { insiderName: true, valueUsd: true } }),
  ]);

  // Keep only each fund's LATEST snapshot, then map to roster faces.
  const latestByCik = new Map<string, Date>();
  for (const h of holdingRows) {
    const cur = latestByCik.get(h.snapshot.cik);
    if (!cur || h.snapshot.asOf > cur) latestByCik.set(h.snapshot.cik, h.snapshot.asOf);
  }
  const fundHolders: SymbolFundHolder[] = [];
  for (const f of ROSTER_FUNDS) {
    const latest = latestByCik.get(f.cik);
    if (!latest) continue;
    for (const h of holdingRows) {
      if (h.snapshot.cik !== f.cik || h.snapshot.asOf.getTime() !== latest.getTime()) continue;
      if (!h.putCall && h.pctOfPort < 0.0005) continue; // skip negligible (~0.0%) lines
      fundHolders.push({
        slug: f.slug,
        name: f.name,
        firm: f.firm,
        avatar: f.avatar ?? null,
        accent: f.accent ?? null,
        asOf: latest.toISOString().slice(0, 10),
        pctOfPort: h.pctOfPort,
        shares: Number(h.shares),
        action: h.action,
        putCall: (h.putCall as "PUT" | "CALL" | null) ?? null,
      });
    }
  }
  fundHolders.sort((a, b) => b.pctOfPort - a.pctOfPort);

  const people: SymbolPersonTrade[] = [];
  for (const p of ROSTER_CONGRESS) {
    const rows = await prisma.politicalTrade.findMany({
      where: { memberName: { contains: p.matchLastName, mode: "insensitive" }, symbol: sym },
      orderBy: { txnDate: "desc" },
      take: 6,
    });
    if (rows.length === 0) continue;
    people.push({
      slug: p.slug,
      name: p.name,
      role: p.role,
      avatar: p.avatar ?? null,
      accent: p.accent ?? null,
      trades: rows.map((r) => ({ symbol: r.symbol, assetName: r.assetName, side: r.side, amountRange: r.amountRange, txnDate: r.txnDate.toISOString().slice(0, 10), link: r.link })),
    });
  }

  const insiderMax = new Map<string, number>();
  for (const r of insiderBuyRows) insiderMax.set(normName(r.insiderName), Math.max(insiderMax.get(normName(r.insiderName)) ?? 0, r.valueUsd));
  const congressBuyers = new Set(congressBuys.map((r) => r.memberName)).size;
  const congressSellers = new Set(congressSells.map((r) => r.memberName)).size;
  const insiderBuyers = insiderMax.size;
  const insiderBuyValueUsd = [...insiderMax.values()].reduce((s, v) => s + v, 0);

  return {
    symbol: sym,
    fundHolders,
    people,
    congressBuyers,
    congressSellers,
    insiderBuyers,
    insiderBuyValueUsd,
    hasAny: fundHolders.length > 0 || people.length > 0 || congressBuyers > 0 || congressSellers > 0 || insiderBuyers > 0,
  };
}

/** One-line smart-money summary for a symbol — for the agent's prompt/context.
 *  Returns "" when there's nothing disclosed (so callers can skip it cleanly). */
export function smartMoneySummaryLine(sm: SymbolSmartMoney): string {
  if (!sm.hasAny) return "";
  const parts: string[] = [];
  for (const f of sm.fundHolders) {
    const tag = f.putCall === "PUT" ? "PUT — bearish" : f.putCall === "CALL" ? "CALL — bullish" : `${(f.pctOfPort * 100).toFixed(1)}% ${f.action}`;
    parts.push(`${f.name} holds (${tag}, 13F ${f.asOf})`);
  }
  for (const p of sm.people) {
    const t = p.trades[0];
    parts.push(`${p.name} ${t.side === "BUY" ? "bought" : "sold"} (${t.amountRange}, ${t.txnDate})`);
  }
  if (sm.congressBuyers > 0 || sm.congressSellers > 0) parts.push(`Congress 180d: ${sm.congressBuyers} bought / ${sm.congressSellers} sold`);
  if (sm.insiderBuyers > 0) parts.push(`${sm.insiderBuyers} insider buy(s) ~${fmtUsd(sm.insiderBuyValueUsd)} (90d)`);
  return parts.join("; ");
}

/** When did we last pull each feed? (for the page's honest "as of" line) */
export async function getSmartMoneyFreshness(): Promise<{ congress: Date | null; insider: Date | null; portfolio: Date | null }> {
  const [c, i, p] = await Promise.all([
    prisma.politicalTrade.findFirst({ orderBy: { fetchedAt: "desc" }, select: { fetchedAt: true } }),
    prisma.insiderTrade.findFirst({ orderBy: { fetchedAt: "desc" }, select: { fetchedAt: true } }),
    prisma.portfolioSnapshot.findFirst({ orderBy: { fetchedAt: "desc" }, select: { fetchedAt: true } }),
  ]);
  return { congress: c?.fetchedAt ?? null, insider: i?.fetchedAt ?? null, portfolio: p?.fetchedAt ?? null };
}
