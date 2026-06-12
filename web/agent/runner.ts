/**
 * GRQ agent orchestrator — the always-on, deterministic half of the agent.
 * Watches markets cheaply; wakes Claude sessions at decision points.
 *
 *   npx tsx agent/runner.ts
 */
import { prisma } from "../lib/db";
import { refreshAllQuotes, refreshQuotesFor, getQuotes } from "../lib/broker/quotes";
import { BENCHMARK } from "../lib/universe";
import { SimBroker, writeNavSnapshot } from "../lib/broker/sim";
import { getPortfolio } from "../lib/portfolio";
import { etDateStr, etParts, isMarketDay, isMarketOpen } from "./calendar";
import { HARD, DIALS, AGENT_VERSION } from "./policy";
import { markBoot, isDailyLossPaused } from "./validator";
import { alert, heartbeat } from "./alerts";
import { runMorningResearch, runMiddayCheckIn, runTriage, runEodReport, runWeeklyReview } from "./sessions";

const broker = new SimBroker();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// In-memory day state (rebuilt from DB checks on restart, so restarts are safe).
let lastFullRefresh = 0;
let lastFastRefresh = 0;
let lastSnapshot = 0;
let decisionSessionsToday = 0;
let decisionsDate = "";
let dailyLossAlerted = "";
const triggerCooldown = new Map<string, number>();
let sessionRunning = false;

function resetDayCounters() {
  const today = etDateStr();
  if (decisionsDate !== today) {
    decisionsDate = today;
    decisionSessionsToday = 0;
  }
}

// Polite cadence: full universe every 10 min (market hours) / hourly (closed);
// holdings + watchlist + benchmark every 2 min while open (stops & triggers).
async function refreshQuotes(open: boolean) {
  const now = Date.now();
  if (now - lastFullRefresh >= (open ? 10 * 60_000 : 60 * 60_000)) {
    const n = await refreshAllQuotes();
    lastFullRefresh = now;
    lastFastRefresh = now;
    if (n === 0) await alert("warning", "Quote refresh returned 0 symbols", "Yahoo may be unhappy. Engine staleness guard will refuse blind fills.");
    return;
  }
  if (open && now - lastFastRefresh >= 2 * 60_000) {
    const [positions, watch] = await Promise.all([
      prisma.position.findMany({ select: { symbol: true } }),
      prisma.watchlist.findMany({ select: { symbol: true } }),
    ]);
    const syms = [...new Set([...positions.map((p) => p.symbol), ...watch.map((w) => w.symbol), BENCHMARK])];
    await refreshQuotesFor(syms);
    lastFastRefresh = now;
  }
}

async function enforceStops() {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  if (settings?.killSwitch) return;
  const dial = DIALS[settings?.riskLevel ?? "BALANCED"];
  const positions = await prisma.position.findMany();
  if (positions.length === 0) return;
  const quotes = await getQuotes(positions.map((p) => p.symbol));
  for (const p of positions) {
    const q = quotes.get(p.symbol);
    if (!q) continue;
    const stopLevel = Math.round(p.avgCostCents * (1 - dial.stopPct / 100));
    if (q.midCents <= stopLevel) {
      const res = await broker.placeOrder({
        symbol: p.symbol,
        side: "SELL",
        type: "MARKET",
        qty: p.qty,
        placedBy: "system-stop",
        reason: `Deterministic stop: ${p.symbol} hit ${(q.midCents / 100).toFixed(2)}, ${dial.stopPct}% below ACB ${(p.avgCostCents / 100).toFixed(2)}. Protection is code, not vibes.`,
      });
      await alert(
        res.ok ? "warning" : "critical",
        res.ok ? `Stop triggered: sold ${p.qty} ${p.symbol}` : `Stop FAILED for ${p.symbol}`,
        res.ok ? `Filled at ~$${(q.bidCents / 100).toFixed(2)} (${dial.stopPct}% stop).` : `Rejection: ${(res as { rejectReason?: string }).rejectReason}`,
      );
    }
  }
}

async function checkDrawdown() {
  const hwmRow = await prisma.navSnapshot.aggregate({ _max: { navCents: true } });
  const hwm = hwmRow._max.navCents ?? 0;
  if (hwm <= 0) return;
  const pf = await getPortfolio();
  const ddBps = Math.round(((pf.navCents - hwm) / hwm) * 10_000);
  if (ddBps <= HARD.drawdownKillBps && !pf.killSwitch) {
    await prisma.settings.update({
      where: { id: 1 },
      data: { killSwitch: true, killSwitchBy: "system-drawdown", killSwitchAt: new Date() },
    });
    await alert(
      "critical",
      "DRAWDOWN KILL SWITCH ENGAGED",
      `NAV $${(pf.navCents / 100).toFixed(2)} is ${(ddBps / 100).toFixed(1)}% off the high-water mark $${(hwm / 100).toFixed(2)}. All trading halted until a human re-enables.`,
    );
  }
}

async function checkDailyLossPause() {
  const today = etDateStr();
  if (dailyLossAlerted === today) return;
  if (await isDailyLossPaused()) {
    dailyLossAlerted = today;
    await alert("warning", "Daily-loss pause engaged", "Day P&L ≤ −3% NAV: no new buys today. Risk-reducing sells still allowed.");
  }
}

async function evaluateTriggers() {
  if (sessionRunning || decisionSessionsToday >= HARD.maxDecisionSessionsPerDay) return;
  const positions = await prisma.position.findMany();
  if (positions.length === 0) return;
  const quotes = await getQuotes(positions.map((p) => p.symbol));
  for (const p of positions) {
    const q = quotes.get(p.symbol);
    if (!q || typeof q.dayChangeBps !== "number") continue;
    if (Math.abs(q.dayChangeBps) < 400) continue;
    const last = triggerCooldown.get(p.symbol) ?? 0;
    if (Date.now() - last < HARD.triageCooldownMs) continue;
    triggerCooldown.set(p.symbol, Date.now());

    const event = `Holding ${p.symbol} (${p.qty} sh, ACB $${(p.avgCostCents / 100).toFixed(2)}) has moved ${(q.dayChangeBps / 100).toFixed(2)}% today, now $${(q.midCents / 100).toFixed(2)}.`;
    console.log(`[trigger] ${event}`);
    const action = await runTriage(event);
    if (action === "escalate" && decisionSessionsToday < HARD.maxDecisionSessionsPerDay) {
      decisionSessionsToday++;
      sessionRunning = true;
      try {
        await runMiddayCheckIn(event);
      } finally {
        sessionRunning = false;
      }
    } else if (action === "note") {
      await alert("info", `Noted: ${p.symbol} moved ${(q.dayChangeBps / 100).toFixed(1)}% (no action)`);
    }
  }
}

async function maybeScheduledSessions() {
  if (sessionRunning) return;
  const p = etParts();
  const m = p.minutesSinceMidnight;
  const dayStart = (await import("./calendar")).startOfEtDay();

  // 9:00–9:30 pre-market research on market days
  if (isMarketDay() && m >= 9 * 60 && m < 9 * 60 + 30) {
    const existing = await prisma.journalEntry.count({
      where: { kind: "RESEARCH", at: { gte: dayStart }, title: { startsWith: "Game plan" } },
    });
    if (existing === 0) {
      sessionRunning = true;
      try {
        await runMorningResearch();
      } finally {
        sessionRunning = false;
      }
      return;
    }
  }

  // 16:15+ EOD report on market days
  if (isMarketDay() && m >= 16 * 60 + 15) {
    const existing = await prisma.report.count({ where: { date: dayStart, kind: "EOD" } });
    if (existing === 0) {
      sessionRunning = true;
      try {
        await runEodReport();
      } finally {
        sessionRunning = false;
      }
      return;
    }
  }

  // Sunday 10:00+ weekly review
  if (p.weekday === 0 && m >= 10 * 60) {
    const recent = await prisma.report.count({
      where: { kind: "WEEKLY", createdAt: { gte: new Date(Date.now() - 6 * 24 * 60 * 60_000) } },
    });
    if (recent === 0) {
      sessionRunning = true;
      try {
        await runWeeklyReview();
      } finally {
        sessionRunning = false;
      }
    }
  }
}

async function tick() {
  resetDayCounters();
  const open = isMarketOpen();

  await refreshQuotes(open);
  await heartbeat({ lastTickAt: new Date(), note: open ? "market open" : "market closed" });

  if (open) {
    const swept = await broker.sweepPendingOrders();
    if (swept > 0) await alert("info", `Resting orders filled: ${swept}`);
    await enforceStops();
    await checkDrawdown();
    await checkDailyLossPause();
    if (Date.now() - lastSnapshot > 30 * 60_000) {
      await writeNavSnapshot("intraday");
      lastSnapshot = Date.now();
    }
    await evaluateTriggers();
  }

  await maybeScheduledSessions();
}

async function main() {
  markBoot();
  await heartbeat({ bootAt: new Date(), note: "booting" });
  await prisma.settings.updateMany({ data: { agentVersion: AGENT_VERSION } });
  await alert("warning", `Agent restarted (${AGENT_VERSION})`, `Warm-up: no trading for ${HARD.warmupMs / 60_000} minutes. Resuming watch.`);
  console.log(`[grq-agent] ${AGENT_VERSION} up. Market ${isMarketOpen() ? "OPEN" : "closed"}.`);

  for (;;) {
    try {
      await tick();
    } catch (e) {
      console.error("[tick] error", e);
      await alert("warning", "Agent tick error", e instanceof Error ? e.message : String(e)).catch(() => {});
    }
    await sleep(isMarketOpen() ? 60_000 : 5 * 60_000);
  }
}

process.on("unhandledRejection", (e) => console.error("[unhandledRejection]", e));
main().catch(async (e) => {
  console.error("[fatal]", e);
  await alert("critical", "Agent crashed at top level", e instanceof Error ? e.message : String(e)).catch(() => {});
  process.exit(1);
});
