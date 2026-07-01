import { prisma } from "../db";
import { getQuotes } from "../broker/quotes";
import { MODELS, SHORTDESK } from "../../agent/policy";
import { accrueBorrowCents, shortUnrealizedCents } from "./mechanics";

// Read side for the Short Lab agent A/B (docs/SHORT-LAB.md Phase 2). Reads only the ShortDesk* tables.
// Single-currency virtual book (no FX). The contest auto-seeds one control + one treatment arm, PAUSED
// (it won't run sessions until a member starts it AND GRQ_SHORTLAB_AGENT is on — it spends Opus tokens).
const DAY_MS = 86_400_000;

export async function ensureShortDesk() {
  const existing = await prisma.shortDesk.findFirst({ orderBy: { id: "asc" }, include: { arms: true } });
  if (existing) return existing;
  const stake = 10_000_000;
  const desk = await prisma.shortDesk.create({ data: { name: "Long-only vs Long+Short", startingStakeCents: stake } });
  await prisma.shortDeskArm.createMany({
    data: [
      { deskId: desk.id, arm: "control", model: MODELS.decision, label: "Control · long only", cashCents: stake },
      { deskId: desk.id, arm: "treatment", model: MODELS.decision, label: "Treatment · long + short", cashCents: stake },
    ],
  });
  return (await prisma.shortDesk.findUnique({ where: { id: desk.id }, include: { arms: true } }))!;
}

export type ShortDeskPos = { symbol: string; qty: number; avgCostCents: number; markCents: number; unrealCents: number; borrowBps?: number; accruedBorrowCents?: number };
export type ShortDeskArmView = {
  id: number;
  arm: string;
  label: string;
  model: string;
  dial: string;
  equityCents: number;
  cashCents: number;
  returnPct: number;
  longs: ShortDeskPos[];
  shorts: ShortDeskPos[];
  navHistory: { at: Date; returnPct: number }[];
  calls: { sessionAt: Date; action: string | null; symbol: string | null; qty: number | null; confidence: number | null; thesis: string | null; filled: boolean; rejectReason: string | null }[];
  tradeCount: number;
  realizedCents: number;
};
export type ShortDeskView = {
  desk: { id: number; name: string; status: string; cadence: string; startingStakeCents: number; startedAt: Date | null };
  arms: ShortDeskArmView[];
  agentEnabled: boolean;
};

export async function loadShortDesk(): Promise<ShortDeskView> {
  const desk = await ensureShortDesk();
  const now = Date.now();
  const arms: ShortDeskArmView[] = [];
  for (const a of desk.arms.filter((x) => x.status === "ACTIVE").sort((x, y) => (x.arm === "control" ? -1 : 1) - (y.arm === "control" ? -1 : 1))) {
    const [positions, calls, navs, trades] = await Promise.all([
      prisma.shortDeskPosition.findMany({ where: { armId: a.id, status: "OPEN" } }),
      prisma.shortDeskCall.findMany({ where: { armId: a.id }, orderBy: { sessionAt: "desc" }, take: 12 }),
      prisma.shortDeskNav.findMany({ where: { armId: a.id }, orderBy: { at: "asc" }, take: 400 }),
      prisma.shortDeskTrade.findMany({ where: { armId: a.id }, select: { realizedPnlCents: true } }),
    ]);
    const quotes = positions.length ? await getQuotes(positions.map((p) => p.symbol)) : new Map();
    let longVal = 0;
    let shortVal = 0;
    let borrow = 0;
    const longs: ShortDeskPos[] = [];
    const shorts: ShortDeskPos[] = [];
    for (const p of positions) {
      const mark = quotes.get(p.symbol.toUpperCase())?.midCents || p.lastMarkCents || p.avgCostCents;
      if (p.side === "SHORT") {
        const accrued = p.accruedBorrowCents + accrueBorrowCents(p.qty * mark, p.borrowBps, Math.max(0, (now - p.lastAccruedAt.getTime()) / DAY_MS));
        shortVal += p.qty * mark;
        borrow += accrued;
        shorts.push({ symbol: p.symbol, qty: p.qty, avgCostCents: p.avgCostCents, markCents: mark, borrowBps: p.borrowBps, accruedBorrowCents: accrued, unrealCents: shortUnrealizedCents(p.qty, p.avgCostCents, mark, accrued) });
      } else {
        longVal += p.qty * mark;
        longs.push({ symbol: p.symbol, qty: p.qty, avgCostCents: p.avgCostCents, markCents: mark, unrealCents: p.qty * (mark - p.avgCostCents) });
      }
    }
    const equity = a.cashCents + longVal - shortVal - borrow;
    const retPct = desk.startingStakeCents > 0 ? ((equity - desk.startingStakeCents) / desk.startingStakeCents) * 100 : 0;
    arms.push({
      id: a.id,
      arm: a.arm,
      label: a.label,
      model: a.model,
      dial: a.dial,
      equityCents: equity,
      cashCents: a.cashCents,
      returnPct: retPct,
      longs,
      shorts,
      navHistory: navs.map((n) => ({ at: n.at, returnPct: desk.startingStakeCents > 0 ? ((n.equityCents - desk.startingStakeCents) / desk.startingStakeCents) * 100 : 0 })),
      calls: calls.map((c) => ({ sessionAt: c.sessionAt, action: c.action, symbol: c.symbol, qty: c.qty, confidence: c.confidence, thesis: c.thesis, filled: c.filled, rejectReason: c.rejectReason })),
      tradeCount: trades.length,
      realizedCents: trades.reduce((s, t) => s + (t.realizedPnlCents ?? 0), 0),
    });
  }
  return { desk: { id: desk.id, name: desk.name, status: desk.status, cadence: desk.cadence, startingStakeCents: desk.startingStakeCents, startedAt: desk.startedAt }, arms, agentEnabled: SHORTDESK.enabled };
}

export async function shortDeskControl(op: string): Promise<void> {
  const desk = await ensureShortDesk();
  if (op === "start") await prisma.shortDesk.update({ where: { id: desk.id }, data: { status: "RUNNING", startedAt: desk.startedAt ?? new Date() } });
  else if (op === "pause") await prisma.shortDesk.update({ where: { id: desk.id }, data: { status: "PAUSED" } });
  else if (op === "reset") {
    const armIds = desk.arms.map((a) => a.id);
    await prisma.shortDeskPosition.deleteMany({ where: { armId: { in: armIds } } });
    await prisma.shortDeskTrade.deleteMany({ where: { armId: { in: armIds } } });
    await prisma.shortDeskCall.deleteMany({ where: { armId: { in: armIds } } });
    await prisma.shortDeskNav.deleteMany({ where: { armId: { in: armIds } } });
    await prisma.shortDeskArm.updateMany({ where: { deskId: desk.id }, data: { cashCents: desk.startingStakeCents } });
    await prisma.shortDesk.update({ where: { id: desk.id }, data: { status: "PAUSED", startedAt: null } });
  }
}
