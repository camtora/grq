// Day-Trading Lab engine + read layer (docs/DAY-TRADE-LAB.md, D103). A MODELED sandbox: a Trader arm
// (you, churning) vs a Holder arm (buy once, hold), same name + day + cash. Every Trader fill crosses
// the spread (buy@ask/sell@bid) + pays a commission; the Holder mirrors the Trader's FIRST buy and sits.
// Marking is pure math + quotes → ZERO model tokens. Never executable; the fund can't day-trade (§6).
import { prisma } from "../db";
import { getQuotes } from "../broker/quotes";
import { ibkrFixedCommissionCents } from "../broker/sim";
import { currencyForSymbol } from "../universe";
import { money } from "../money";
import { etDateStr } from "../../agent/calendar";
import { buyFillCents, sellFillCents, spreadCostCents, equityCents, sellRealizedCents, newAvgCostCents, bottomLineCents } from "./mechanics";

const plWord = (c: number) => (c >= 0 ? "gain" : "loss");

/** The most recent lab for a book (owner null = shared house lab), or null. */
export async function currentDayLab(owner: string | null = null) {
  return prisma.dayLab.findFirst({ where: { owner }, orderBy: { id: "desc" } });
}

/** Start a fresh lab on `symbol` (closes nothing — the prior lab stays as history). */
export async function startDayLab(symbol: string, owner: string | null = null): Promise<{ ok: true; id: number } | { error: string }> {
  const sym = symbol.trim().toUpperCase();
  if (!/^[A-Z0-9.\-]{1,12}$/.test(sym)) return { error: "Enter a valid ticker." };
  const q = (await getQuotes([sym])).get(sym);
  if (!q || q.midCents <= 0) return { error: `No live quote for ${sym} (try a liquid US/CA ticker).` };
  const currency = await currencyForSymbol(sym).catch(() => (sym.endsWith(".TO") ? "CAD" : "USD"));
  const start = 5_000_000; // $50k per book — matches the Options Desk / Bull Race stakes
  const lab = await prisma.dayLab.create({
    data: { owner, symbol: sym, currency, tradingDate: etDateStr(), startingCashCents: start, traderCashCents: start, holderCashCents: start, lastMarkCents: q.midCents },
  });
  return { ok: true, id: lab.id };
}

/** Trader BUYS `shares` at the live ask. On the FIRST buy, the Holder mirrors it (same shares/fill) and
 *  then never trades again — so everything the Trader does after is pure added cost vs just holding. */
export async function traderBuy(labId: number, shares: number): Promise<{ ok: true } | { error: string }> {
  const lab = await prisma.dayLab.findUnique({ where: { id: labId } });
  if (!lab || lab.status !== "OPEN") return { error: "Lab not open." };
  if (!Number.isInteger(shares) || shares < 1) return { error: "Whole shares only." };
  const q = (await getQuotes([lab.symbol])).get(lab.symbol.toUpperCase());
  if (!q || q.midCents <= 0) return { error: "No live quote right now." };
  const fill = buyFillCents(q.askCents, q.midCents);
  const commission = ibkrFixedCommissionCents(shares, fill);
  const cost = shares * fill + commission;
  if (cost > lab.traderCashCents) return { error: `Not enough Trader cash (need ${money(cost)}).` };

  const firstBuy = lab.holderEntryCents == null;
  const holderPatch = firstBuy && cost <= lab.holderCashCents
    ? { holderShares: shares, holderEntryCents: fill, holderCashCents: lab.holderCashCents - cost }
    : {};
  await prisma.dayLab.update({
    where: { id: labId },
    data: {
      traderCashCents: lab.traderCashCents - cost,
      traderShares: lab.traderShares + shares,
      traderAvgCents: newAvgCostCents(lab.traderShares, lab.traderAvgCents, shares, fill),
      feesCents: lab.feesCents + commission,
      spreadCents: lab.spreadCents + spreadCostCents(fill, q.midCents, shares),
      lastMarkCents: q.midCents,
      ...holderPatch,
    },
  });
  await prisma.dayTrade.create({
    data: { labId, side: "BUY", shares, priceCents: fill, midCents: q.midCents, commissionCents: commission, spreadCostCents: spreadCostCents(fill, q.midCents, shares), card: `Bought ${shares} at the ask ${money(fill)} (mid ${money(q.midCents)}) + ${money(commission)} commission.${firstBuy ? " The Holder just bought the same lot — and won't trade again." : ""}` },
  });
  await markDayLab(labId);
  return { ok: true };
}

/** Trader SELLS `shares` (or all) at the live bid. Books realized P&L + counts a round trip. */
export async function traderSell(labId: number, shares?: number): Promise<{ ok: true } | { error: string }> {
  const lab = await prisma.dayLab.findUnique({ where: { id: labId } });
  if (!lab || lab.status !== "OPEN") return { error: "Lab not open." };
  if (lab.traderShares < 1) return { error: "No Trader shares to sell." };
  const qty = Math.min(shares && shares > 0 ? Math.floor(shares) : lab.traderShares, lab.traderShares);
  const q = (await getQuotes([lab.symbol])).get(lab.symbol.toUpperCase());
  if (!q || q.midCents <= 0) return { error: "No live quote right now." };
  const fill = sellFillCents(q.bidCents, q.midCents);
  const commission = ibkrFixedCommissionCents(qty, fill);
  const realized = sellRealizedCents(qty, lab.traderAvgCents, fill, commission);
  await prisma.dayLab.update({
    where: { id: labId },
    data: {
      traderCashCents: lab.traderCashCents + qty * fill - commission,
      traderShares: lab.traderShares - qty,
      realizedCents: lab.realizedCents + realized,
      feesCents: lab.feesCents + commission,
      spreadCents: lab.spreadCents + spreadCostCents(fill, q.midCents, qty),
      roundTrips: lab.roundTrips + 1,
      lastMarkCents: q.midCents,
    },
  });
  await prisma.dayTrade.create({
    data: { labId, side: "SELL", shares: qty, priceCents: fill, midCents: q.midCents, commissionCents: commission, spreadCostCents: spreadCostCents(fill, q.midCents, qty), realizedPnlCents: realized, card: `Sold ${qty} at the bid ${money(fill)} (mid ${money(q.midCents)}) − ${money(commission)} commission → realized ${plWord(realized)} of ${money(Math.abs(realized))}.` },
  });
  await markDayLab(labId);
  return { ok: true };
}

/** Flatten the Trader (sell everything at the bid) and CLOSE the lab for a final verdict. */
export async function flattenDayLab(labId: number): Promise<{ ok: true } | { error: string }> {
  const lab = await prisma.dayLab.findUnique({ where: { id: labId } });
  if (!lab || lab.status !== "OPEN") return { error: "Lab not open." };
  if (lab.traderShares > 0) {
    const r = await traderSell(labId);
    if ("error" in r) return r;
  }
  await markDayLab(labId);
  await prisma.dayLab.update({ where: { id: labId }, data: { status: "CLOSED", closedAt: new Date() } });
  return { ok: true };
}

/** Mark both books to the live mid + append an equity point (no LLM). */
export async function markDayLab(labId: number): Promise<void> {
  const lab = await prisma.dayLab.findUnique({ where: { id: labId } });
  if (!lab) return;
  const q = (await getQuotes([lab.symbol])).get(lab.symbol.toUpperCase());
  const mid = q && q.midCents > 0 ? q.midCents : lab.lastMarkCents ?? lab.traderAvgCents;
  const traderEquity = equityCents(lab.traderCashCents, lab.traderShares, mid);
  const holderEquity = equityCents(lab.holderCashCents, lab.holderShares, mid);
  await prisma.dayMark.create({ data: { labId, traderEquityCents: traderEquity, holderEquityCents: holderEquity } });
  if (q && q.midCents > 0 && q.midCents !== lab.lastMarkCents) await prisma.dayLab.update({ where: { id: labId }, data: { lastMarkCents: mid } });
}

export async function resetDayLab(owner: string | null = null): Promise<void> {
  const lab = await currentDayLab(owner);
  if (lab) await prisma.dayLab.delete({ where: { id: lab.id } }); // cascades trades + marks
}

// ── read layer ───────────────────────────────────────────────────────────────
export type DayTradeView = { at: Date; side: string; shares: number; priceCents: number; midCents: number; commissionCents: number; realizedPnlCents: number | null; card: string | null };
export type DayVerdict = { id: number; symbol: string; tradingDate: string; traderPlCents: number; holderPlCents: number; roundTrips: number; feesCents: number; status: string };
export type DayLabView = {
  lab: {
    id: number; symbol: string; companyName: string | null; currency: string; tradingDate: string; status: string;
    startingCashCents: number; markCents: number;
    traderShares: number; traderCashCents: number; traderAvgCents: number; traderEquityCents: number; traderPlCents: number;
    holderShares: number; holderCashCents: number; holderEntryCents: number | null; holderEquityCents: number; holderPlCents: number;
    realizedCents: number; feesCents: number; spreadCents: number; roundTrips: number;
  } | null;
  chart: { at: Date; traderPct: number; holderPct: number }[];
  trades: DayTradeView[];
  history: DayVerdict[]; // prior labs' verdicts (the accumulating "does churning win?" scoreboard)
};

export async function loadDayLab(owner: string | null = null): Promise<DayLabView> {
  const lab = await currentDayLab(owner);
  const allLabs = await prisma.dayLab.findMany({ where: { owner }, orderBy: { id: "desc" }, take: 12, include: { marks: { orderBy: { at: "asc" } }, trades: { orderBy: { at: "desc" }, take: 40 } } });

  // History verdicts (skip the current one — it's shown in full).
  const history: DayVerdict[] = allLabs
    .filter((l) => !lab || l.id !== lab.id)
    .map((l) => {
      const mid = l.lastMarkCents ?? l.traderAvgCents;
      return { id: l.id, symbol: l.symbol, tradingDate: l.tradingDate, traderPlCents: bottomLineCents(equityCents(l.traderCashCents, l.traderShares, mid), l.startingCashCents), holderPlCents: bottomLineCents(equityCents(l.holderCashCents, l.holderShares, mid), l.startingCashCents), roundTrips: l.roundTrips, feesCents: l.feesCents, status: l.status };
    });

  if (!lab) return { lab: null, chart: [], trades: [], history };

  const detailed = allLabs.find((l) => l.id === lab.id)!;
  const q = lab.status === "OPEN" ? (await getQuotes([lab.symbol])).get(lab.symbol.toUpperCase()) : null;
  const mid = q && q.midCents > 0 ? q.midCents : lab.lastMarkCents ?? lab.traderAvgCents;
  const traderEquity = equityCents(lab.traderCashCents, lab.traderShares, mid);
  const holderEquity = equityCents(lab.holderCashCents, lab.holderShares, mid);
  const start = lab.startingCashCents;
  const pctOf = (equity: number) => (start > 0 ? ((equity - start) / start) * 100 : 0);

  return {
    lab: {
      id: lab.id, symbol: lab.symbol, companyName: lab.companyName, currency: lab.currency, tradingDate: lab.tradingDate, status: lab.status,
      startingCashCents: start, markCents: mid,
      traderShares: lab.traderShares, traderCashCents: lab.traderCashCents, traderAvgCents: lab.traderAvgCents, traderEquityCents: traderEquity, traderPlCents: bottomLineCents(traderEquity, start),
      holderShares: lab.holderShares, holderCashCents: lab.holderCashCents, holderEntryCents: lab.holderEntryCents, holderEquityCents: holderEquity, holderPlCents: bottomLineCents(holderEquity, start),
      realizedCents: lab.realizedCents, feesCents: lab.feesCents, spreadCents: lab.spreadCents, roundTrips: lab.roundTrips,
    },
    chart: detailed.marks.map((m) => ({ at: m.at, traderPct: pctOf(m.traderEquityCents), holderPct: pctOf(m.holderEquityCents) })),
    trades: detailed.trades.map((t) => ({ at: t.at, side: t.side, shares: t.shares, priceCents: t.priceCents, midCents: t.midCents, commissionCents: t.commissionCents, realizedPnlCents: t.realizedPnlCents, card: t.card })),
    history,
  };
}
