// Smart Money ingest (D27) — pulls FMP + OpenInsider into the cache tables the
// /market/smart-money page reads. Cadence (driven by the runner): congress +
// insider DAILY (they file continuously); 13F only when a new filing date appears
// (quarterly, ~45-day lag). Every piece is best-effort and isolated so one bad
// source/CIK never sinks the batch.

import { prisma } from "../db";
import {
  fmp13FDates,
  fmp13FHoldings,
  fmp13FSummary,
  fmpSenateLatest,
  fmpHouseLatest,
  fmpCongressByName,
  fmpInsiderLatest,
  type Fmp13FHolding,
  type FmpPoliticalTrade,
} from "../fmp";
import { ROSTER_FUNDS, ROSTER_CONGRESS } from "./portfolios";
import { fetchOpenInsiderTopBuys } from "./openinsider";

const big = (n: number): bigint => BigInt(Math.max(0, Math.round(n)));

// A 13F can split one position across sub-accounts (ARK files TSLA many times).
// Collapse to one line per symbol+put/call so a card shows each holding once.
function aggregateHoldings(rows: Fmp13FHolding[]): Fmp13FHolding[] {
  const by = new Map<string, Fmp13FHolding>();
  for (const h of rows) {
    const k = `${h.symbol}|${h.putCall ?? ""}`;
    const e = by.get(k);
    if (!e) by.set(k, { ...h });
    else {
      e.shares += h.shares;
      e.valueUsd += h.valueUsd;
    }
  }
  return [...by.values()];
}

// "$1,001 - $15,000" → 1001 (the low bound, for ranking congress trades by size).
function parseAmountMin(range: string): number | null {
  const m = range.replace(/[,$]/g, "").match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

function politicalSide(type: string): "BUY" | "SELL" | null {
  const t = type.toLowerCase();
  if (t.includes("purchase")) return "BUY";
  if (t.includes("sale")) return "SELL";
  return null; // "Exchange" and friends — skip
}

// --- 13F portfolios (quarterly) ----------------------------------------------
async function ingestOneFund(cik: string, holderName: string, force: boolean): Promise<"skip" | "fresh" | "none"> {
  const dates = await fmp13FDates(cik);
  if (dates.length === 0) return "none";
  const latest = dates[0]; // dates endpoint returns newest-first
  const asOf = new Date(`${latest.date}T00:00:00Z`);

  const existing = await prisma.portfolioSnapshot.findUnique({ where: { cik_asOf: { cik, asOf } } });
  if (existing && !force) return "skip";

  const [holdingsRaw, priorRaw, summary] = await Promise.all([
    fmp13FHoldings(cik, latest.year, latest.quarter),
    dates[1] ? fmp13FHoldings(cik, dates[1].year, dates[1].quarter) : Promise.resolve([] as Fmp13FHolding[]),
    fmp13FSummary(cik),
  ]);
  if (holdingsRaw.length === 0) return "none";
  const holdings = aggregateHoldings(holdingsRaw);
  const prior = aggregateHoldings(priorRaw);

  // Prior-quarter share counts keyed by symbol+putCall → derive NEW/ADD/TRIM/HOLD.
  const priorShares = new Map<string, number>();
  for (const h of prior) priorShares.set(`${h.symbol}|${h.putCall ?? ""}`, h.shares);

  const totalValue = holdings.reduce((s, h) => s + h.valueUsd, 0) || 1;
  const ranked = [...holdings].sort((a, b) => b.valueUsd - a.valueUsd);

  await prisma.$transaction(async (tx) => {
    if (existing) await tx.portfolioSnapshot.delete({ where: { id: existing.id } }); // cascades holdings
    const snap = await tx.portfolioSnapshot.create({
      data: {
        cik,
        holderName: summary?.investorName || holderName,
        asOf,
        filedAt: null,
        totalValueUsd: big(summary?.marketValueUsd ?? totalValue),
        holdingsCount: summary?.portfolioSize ?? holdings.length,
        securitiesAdded: summary?.securitiesAdded ?? null,
        securitiesRemoved: summary?.securitiesRemoved ?? null,
        perf1yPct: summary?.perf1yPct ?? null,
      },
    });
    await tx.portfolioHolding.createMany({
      data: ranked.map((h, i) => {
        const prev = priorShares.get(`${h.symbol}|${h.putCall ?? ""}`);
        let action: string;
        let qoq: number | null = null;
        if (prev == null) action = "NEW";
        else if (prev === 0) action = "HOLD";
        else {
          qoq = (h.shares - prev) / prev;
          action = h.shares > prev ? "ADD" : h.shares < prev ? "TRIM" : "HOLD";
        }
        return {
          snapshotId: snap.id,
          symbol: h.symbol,
          name: h.name,
          shares: big(h.shares),
          valueUsd: big(h.valueUsd),
          pctOfPort: h.valueUsd / totalValue,
          putCall: h.putCall,
          action,
          qoqSharesPct: qoq,
          rank: i + 1,
        };
      }),
    });
  });
  return "fresh";
}

export async function ingestPortfolios(force = false): Promise<{ fresh: number; skipped: number }> {
  let fresh = 0;
  let skipped = 0;
  for (const f of ROSTER_FUNDS) {
    try {
      const r = await ingestOneFund(f.cik, f.firm, force);
      if (r === "fresh") fresh++;
      else if (r === "skip") skipped++;
    } catch (e) {
      console.error(`[smartmoney] portfolio ${f.slug} failed:`, e instanceof Error ? e.message : e);
    }
  }
  return { fresh, skipped };
}

// --- Congress (daily) --------------------------------------------------------
async function upsertPolitical(chamber: "senate" | "house", t: FmpPoliticalTrade): Promise<boolean> {
  const side = politicalSide(t.type);
  if (!side || !t.txnDate) return false;
  const key = `${chamber}:${t.memberId || t.memberName}:${t.symbol}:${t.txnDate}:${side}:${t.amountRange}`;
  try {
    await prisma.politicalTrade.upsert({
      where: { key },
      create: {
        key,
        chamber,
        memberName: t.memberName,
        memberId: t.memberId || null,
        district: t.district || null,
        symbol: t.symbol,
        assetName: t.assetName,
        side,
        amountRange: t.amountRange,
        amountMinUsd: parseAmountMin(t.amountRange),
        txnDate: new Date(`${t.txnDate}T00:00:00Z`),
        disclosedAt: new Date(`${t.disclosureDate || t.txnDate}T00:00:00Z`),
        link: t.link || null,
      },
      update: {}, // immutable once seen
    });
    return true;
  } catch (e) {
    console.error(`[smartmoney] congress upsert failed:`, e instanceof Error ? e.message : e);
    return false;
  }
}

export async function ingestCongress(): Promise<number> {
  // The market-wide "latest" feeds (the leaderboard) ...
  const [senate, house] = await Promise.all([fmpSenateLatest(3).catch(() => []), fmpHouseLatest(3).catch(() => [])]);
  let n = 0;
  for (const t of senate) if (await upsertPolitical("senate", t)) n++;
  for (const t of house) if (await upsertPolitical("house", t)) n++;
  // ...PLUS each tracked member by name (infrequent filers like Pelosi never
  // surface in the "latest" window, so their card would be empty otherwise).
  for (const p of ROSTER_CONGRESS) {
    const byName = await fmpCongressByName(p.matchLastName).catch(() => []);
    for (const { chamber, trade } of byName) if (await upsertPolitical(chamber, trade)) n++;
  }
  return n;
}

// --- Insiders (daily) — FMP open-market Form 4 + OpenInsider top buys ----------
export async function ingestInsiders(): Promise<number> {
  let n = 0;
  // FMP: keep open-market purchases (P-Purchase) and sales (S-Sale); the board
  // shows buys, but storing both leaves room for a sells view later.
  const fmp = await fmpInsiderLatest(4).catch(() => []);
  for (const t of fmp) {
    const isBuy = /^P-/i.test(t.transactionType) || (t.transactionType.toLowerCase().includes("purchase"));
    const isSell = /^S-/i.test(t.transactionType) || t.transactionType.toLowerCase().includes("sale");
    if (!isBuy && !isSell) continue; // skip M-Exempt/A-Award/G-Gift noise
    if (t.price <= 0 || t.shares <= 0 || !t.txnDate) continue;
    const side = isBuy ? "BUY" : "SELL";
    const key = `fmp:${t.symbol}:${t.reportingName}:${t.txnDate}:${t.transactionType}:${t.shares}`;
    try {
      await prisma.insiderTrade.upsert({
        where: { key },
        create: {
          key,
          symbol: t.symbol,
          companyName: null,
          insiderName: t.reportingName,
          insiderTitle: t.typeOfOwner || null,
          side,
          txnType: t.transactionType,
          shares: Math.min(2_000_000_000, Math.round(t.shares)),
          priceUsd: t.price,
          valueUsd: t.price * t.shares,
          txnDate: new Date(`${t.txnDate}T00:00:00Z`),
          filedAt: new Date(`${(t.filingDate || t.txnDate).slice(0, 10)}T00:00:00Z`),
          source: "fmp",
          link: t.url || null,
        },
        update: {},
      });
      n++;
    } catch (e) {
      console.error(`[smartmoney] insider(fmp) upsert failed:`, e instanceof Error ? e.message : e);
    }
  }

  // OpenInsider: the curated "top purchases of the day" (cross-check / supplement).
  const oi = await fetchOpenInsiderTopBuys();
  for (const t of oi) {
    if (t.shares <= 0 || !t.txnDate) continue;
    const key = `openinsider:${t.symbol}:${t.insiderName}:${t.txnDate}:P:${t.shares}`;
    try {
      await prisma.insiderTrade.upsert({
        where: { key },
        create: {
          key,
          symbol: t.symbol,
          companyName: t.companyName || null,
          insiderName: t.insiderName,
          insiderTitle: t.title || null,
          side: "BUY",
          txnType: "P-Purchase",
          shares: Math.min(2_000_000_000, Math.round(t.shares)),
          priceUsd: t.priceUsd,
          valueUsd: t.valueUsd || t.priceUsd * t.shares,
          txnDate: new Date(`${t.txnDate}T00:00:00Z`),
          filedAt: new Date(`${t.filedAt || t.txnDate}T00:00:00Z`),
          source: "openinsider",
          link: t.link || null,
        },
        update: {},
      });
      n++;
    } catch (e) {
      console.error(`[smartmoney] insider(oi) upsert failed:`, e instanceof Error ? e.message : e);
    }
  }
  return n;
}

/** The full daily-ish run. `forcePortfolios` re-pulls 13Fs even if unchanged. */
export async function runSmartMoneyIngest(opts: { forcePortfolios?: boolean } = {}): Promise<{
  portfolios: { fresh: number; skipped: number };
  congress: number;
  insiders: number;
}> {
  const [portfolios, congress, insiders] = await Promise.all([
    ingestPortfolios(opts.forcePortfolios ?? false),
    ingestCongress(),
    ingestInsiders(),
  ]);
  return { portfolios, congress, insiders };
}
