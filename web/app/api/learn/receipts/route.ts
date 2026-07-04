import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sessionFromRequest } from "@/lib/session";
import { PAPER_INCEPTION } from "@/lib/portfolio";
import { HARD, DIALS, SELF_INVEST } from "@/agent/policy";
import { money, signedMoney } from "@/lib/money";

// The Learn portal's "receipts" for GRQ Go (components/learn/Receipts.tsx serialized) —
// each block pulls the fund's OWN live numbers so lesson claims can't drift from reality.
// One GET returns all six; the app renders whichever a lesson embeds. Viewer-readable
// (the web Learn portal is too). Every query is scoped to PAPER_INCEPTION.
export const dynamic = "force-dynamic";
export const maxDuration = 20;

const NICE_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric" });
const ET_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" });
const pct = (bps: number) => `${(bps / 100).toFixed(1)}%`;

type Stat = { label: string; value: string; tone?: "pos" | "neg" | "warn" };
type Block =
  | { title: string; empty: string }
  | { title: string; footer: string; stats?: Stat[]; fills?: { side: string; qty: number; symbol: string; priceCents: number; commissionCents: number; day: string }[] };

export async function GET(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Sign in to view this." }, { status: 403 });

  const blocks: Record<string, Block> = {};

  // real-fills
  try {
    const [fills, agg] = await Promise.all([
      prisma.trade.findMany({ where: { at: { gte: PAPER_INCEPTION }, secType: "STK" }, orderBy: { at: "desc" }, take: 3 }),
      prisma.trade.aggregate({ where: { at: { gte: PAPER_INCEPTION }, secType: "STK" }, _count: true, _sum: { commissionCents: true } }),
    ]);
    blocks["real-fills"] = !fills.length
      ? { title: "real fills", empty: "No trades yet this soak — the moment the fund pays its first toll, it shows up here." }
      : {
          title: "real fills",
          footer: `${agg._count} fills this soak, ${money(agg._sum.commissionCents ?? 0)} in commissions — and that's only the VISIBLE toll. The spread was paid invisibly on top of every single one, exactly as above.`,
          fills: fills.map((t) => ({ side: t.side, qty: t.qty, symbol: t.symbol, priceCents: t.priceCents, commissionCents: t.commissionCents, day: NICE_DAY.format(t.at) })),
        };
  } catch {
    blocks["real-fills"] = { title: "real fills", empty: "The live numbers couldn't be loaded right now — the lesson stands on its own." };
  }

  // drawdown
  try {
    const snaps = await prisma.navSnapshot.findMany({ where: { at: { gte: PAPER_INCEPTION } }, orderBy: { at: "asc" }, select: { navCents: true } });
    if (snaps.length < 2) {
      blocks["drawdown"] = { title: "the fund's drawdown", empty: "Not enough NAV history yet this soak to chart a drawdown — check back after a few sessions." };
    } else {
      let hwm = 0;
      let worstBps = 0;
      for (const s of snaps) {
        if (s.navCents > hwm) hwm = s.navCents;
        if (hwm > 0) worstBps = Math.min(worstBps, Math.round(((s.navCents - hwm) / hwm) * 10_000));
      }
      const nav = snaps[snaps.length - 1].navCents;
      const nowBps = hwm > 0 ? Math.round(((nav - hwm) / hwm) * 10_000) : 0;
      blocks["drawdown"] = {
        title: "the fund's drawdown",
        footer: `The tripwires are live code, not intentions: a day at ${pct(HARD.dailyLossPauseBps)} pauses all new buys; ${pct(HARD.drawdownKillBps)} from the high-water mark trips the kill switch automatically.`,
        stats: [
          { label: "NAV now", value: money(nav) },
          { label: "high-water mark", value: money(hwm) },
          { label: "drawdown now", value: pct(nowBps), tone: nowBps < 0 ? "neg" : "pos" },
          { label: "worst this soak", value: pct(worstBps), tone: worstBps < 0 ? "neg" : undefined },
        ],
      };
    }
  } catch {
    blocks["drawdown"] = { title: "the fund's drawdown", empty: "The live numbers couldn't be loaded right now — the lesson stands on its own." };
  }

  // vs-xic
  try {
    const [snap, contrib] = await Promise.all([
      prisma.navSnapshot.findFirst({ orderBy: { at: "desc" } }),
      prisma.contribution.aggregate({ _sum: { amountCents: true } }),
    ]);
    const put = contrib._sum.amountCents ?? 0;
    if (!snap || !put) {
      blocks["vs-xic"] = { title: "the fund vs the couch", empty: "No scoreboard yet — contributions and NAV snapshots have to exist before anyone can lose to a couch." };
    } else {
      const gap = snap.benchmarkCents !== null ? snap.navCents - snap.benchmarkCents : null;
      blocks["vs-xic"] = {
        title: "the fund vs the couch",
        footer:
          gap === null
            ? "The XIC benchmark is momentarily unavailable — the honest cells stay blank rather than guessing."
            : `Same dollars, two universes: everything GRQ actually did, versus shoving every contribution into XIC and going for a nap. Right now the fund is ${signedMoney(gap)} ${gap >= 0 ? "ahead of" : "behind"} the couch. Measured from this soak's inception (${NICE_DAY.format(PAPER_INCEPTION)}).`,
        stats: [
          { label: "put in", value: money(put) },
          { label: "NAV now", value: money(snap.navCents) },
          { label: "if it were all XIC", value: snap.benchmarkCents !== null ? money(snap.benchmarkCents) : "—" },
          { label: "total P&L", value: signedMoney(snap.navCents - put), tone: snap.navCents - put >= 0 ? "pos" : "neg" },
        ],
      };
    }
  } catch {
    blocks["vs-xic"] = { title: "the fund vs the couch", empty: "The live numbers couldn't be loaded right now — the lesson stands on its own." };
  }

  // fees
  try {
    const parts = ET_DAY.formatToParts(new Date());
    const y = Number(parts.find((p) => p.type === "year")?.value);
    const m = Number(parts.find((p) => p.type === "month")?.value);
    const monthStart = new Date(Date.UTC(y, m - 1, 1, 4));
    const [settings, month, soak] = await Promise.all([
      prisma.settings.findUnique({ where: { id: 1 } }),
      prisma.trade.aggregate({ where: { at: { gte: monthStart } }, _sum: { commissionCents: true }, _count: true }),
      prisma.trade.aggregate({ where: { at: { gte: PAPER_INCEPTION } }, _sum: { commissionCents: true }, _count: true }),
    ]);
    const budget = settings?.feeBudgetCentsMonth ?? 0;
    const spent = month._sum.commissionCents ?? 0;
    blocks["fees"] = {
      title: "what the fund pays in fees",
      footer: `Two of the defenses from this lesson, live: the monthly budget above is enforced by the order gate (a trade that would bust it is rejected), and no trade is taken unless its thesis clears ≥${HARD.feeEdgeMultiple}× the round-trip commission.`,
      stats: [
        { label: "commissions this month", value: money(spent) },
        { label: "monthly budget", value: budget ? money(budget) : "—", tone: budget && spent > budget * 0.8 ? "warn" : undefined },
        { label: "this soak, total", value: money(soak._sum.commissionCents ?? 0) },
        { label: "across", value: `${soak._count} trades` },
      ],
    };
  } catch {
    blocks["fees"] = { title: "what the fund pays in fees", empty: "The live numbers couldn't be loaded right now — the lesson stands on its own." };
  }

  // guardrails
  try {
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    const dialName = (settings?.riskLevel ?? "BALANCED") as keyof typeof DIALS;
    const dial = DIALS[dialName];
    blocks["guardrails"] = {
      title: "the live dials",
      footer: `These are code, not vibes. Members set the dial and edit the rules; Alfred can't touch either — it can only propose orders that survive them. Also live: buys need ≥${HARD.minBuyConfidence}% conviction, ≤${HARD.maxOrdersPerDay} orders/day, ≤${HARD.maxOrdersPerHour}/hour, none in the first or last ${HARD.noEntriesFirstMin} minutes of the session, and a self-promotion ceiling of ${SELF_INVEST.maxPerRollingWeek}/week into a max-${SELF_INVEST.maxUniverseSize}-name universe.`,
      stats: [
        { label: "risk dial", value: dialName },
        { label: "max position", value: `${dial.maxPositionPct}% of NAV` },
        { label: "cash floor", value: `${dial.cashFloorPct}% per currency` },
        { label: "stop-loss", value: `−${dial.stopPct}%` },
        { label: "take-profit", value: `+${dial.takeProfitPct}%` },
        { label: "new buys / week", value: `≤${dial.maxNewTradesPerWeek}` },
        { label: "day-loss pause", value: pct(HARD.dailyLossPauseBps) },
        { label: "auto kill switch", value: pct(HARD.drawdownKillBps) },
        { label: "kill switch now", value: settings?.killSwitch ? "ENGAGED" : "armed, off", tone: settings?.killSwitch ? "neg" : "pos" },
        { label: "margin / shorting", value: "banned" },
        { label: "options", value: settings?.allowOptions ? "enabled" : "OFF (toggle, off)" },
        { label: "rule changes", value: "humans only" },
      ],
    };
  } catch {
    blocks["guardrails"] = { title: "the live dials", empty: "The live numbers couldn't be loaded right now — the lesson stands on its own." };
  }

  // soak
  try {
    const [settings, snaps] = await Promise.all([
      prisma.settings.findUnique({ where: { id: 1 } }),
      prisma.navSnapshot.findMany({ where: { at: { gte: PAPER_INCEPTION } }, orderBy: { at: "asc" }, select: { at: true } }),
    ]);
    const days = new Set(snaps.map((s) => ET_DAY.format(s.at))).size;
    blocks["soak"] = {
      title: "where the soak stands",
      footer: "The gate to real money: at least 4 clean weeks total, at least 2 of them on IBKR paper — clean meaning no blown guardrails and honest reconciliation against the broker every day. Until it passes, not one real dollar trades. The soak has already earned its keep once: it caught a broker account reset masquerading as a crash before real money could have been hurt.",
      stats: [
        { label: "broker", value: process.env.BROKER ?? "sim" },
        { label: "soak inception", value: NICE_DAY.format(PAPER_INCEPTION) },
        { label: "market days logged", value: String(days || "—") },
        { label: "kill switch", value: settings?.killSwitch ? "ENGAGED" : "armed, off", tone: settings?.killSwitch ? "neg" : "pos" },
      ],
    };
  } catch {
    blocks["soak"] = { title: "where the soak stands", empty: "The live numbers couldn't be loaded right now — the lesson stands on its own." };
  }

  return NextResponse.json({ blocks });
}
