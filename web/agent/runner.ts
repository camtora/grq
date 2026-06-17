/**
 * GRQ agent orchestrator — the always-on, deterministic half of the agent.
 * Watches markets cheaply; wakes Claude sessions at decision points.
 *
 *   npx tsx agent/runner.ts
 */
import { prisma } from "../lib/db";
import { refreshAllQuotes, refreshQuotesFor, getQuotes } from "../lib/broker/quotes";
import { BENCHMARK } from "../lib/universe";
import { writeNavSnapshot } from "../lib/broker/sim";
import { getBroker } from "../lib/broker";
import { IBKRBroker } from "../lib/broker/ibkr";
import { getPortfolio } from "../lib/portfolio";
import { refreshBars } from "../lib/bars";
import { backfillLogos } from "../lib/logos";
import { backfillFundamentals } from "../lib/fundamentals";
import { trackedSymbols, WEEKLY_REFRESH_WEEKDAY, WEEKLY_REFRESH_START_MIN } from "../lib/universe";
import { etDateStr, etParts, isMarketDay, isMarketOpen } from "./calendar";
import { HARD, DIALS, AGENT_VERSION } from "./policy";
import { markBoot, isDailyLossPaused } from "./validator";
import { alert, heartbeat } from "./alerts";
import { runMorningResearch, runMiddayCheckIn, runTriage, runEodReport, runWeeklyReview, runStockDossier, runDiscoveryHunt, runMiddayReport, runSmartMoneyScan } from "./sessions";

const broker = getBroker();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// In-memory day state (rebuilt from DB checks on restart, so restarts are safe).
let lastFullRefresh = 0;
let lastFastRefresh = 0;
let lastSnapshot = 0;
let decisionSessionsToday = 0;
let decisionsDate = "";
let lastBarsDay = "";
let lastLogoBackfill = 0;
let lastFundamentalsBackfill = 0;
let lastWeeklyRefreshDay = "";
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
    const [positions, focus] = await Promise.all([
      prisma.position.findMany({ select: { symbol: true } }),
      prisma.agentFocus.findMany({ select: { symbol: true } }),
    ]);
    const syms = [...new Set([...positions.map((p) => p.symbol), ...focus.map((w) => w.symbol), BENCHMARK])];
    await refreshQuotesFor(syms);
    lastFastRefresh = now;
  }
}

// Deterministic exits on every position: protective stop-loss AND take-profit.
// Both rest in code like a broker-side bracket — protection (and claiming the
// gain) is rules, not vibes.
async function enforceExits() {
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
    const takeProfitLevel = Math.round(p.avgCostCents * (1 + dial.takeProfitPct / 100));
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
    } else if (q.midCents >= takeProfitLevel) {
      const res = await broker.placeOrder({
        symbol: p.symbol,
        side: "SELL",
        type: "MARKET",
        qty: p.qty,
        placedBy: "system-takeprofit",
        reason: `Take-profit: ${p.symbol} hit ${(q.midCents / 100).toFixed(2)}, +${dial.takeProfitPct}% over ACB ${(p.avgCostCents / 100).toFixed(2)}. Claiming the gain — discipline, not greed.`,
      });
      await alert(
        res.ok ? "info" : "warning",
        res.ok ? `Take-profit: sold ${p.qty} ${p.symbol} (+${dial.takeProfitPct}%)` : `Take-profit FAILED for ${p.symbol}`,
        res.ok ? `Filled at ~$${(q.bidCents / 100).toFixed(2)}.` : `Rejection: ${(res as { rejectReason?: string }).rejectReason}`,
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

  // On-demand hunt refresh — a member hit "refresh" on the Discover tab. Runs the
  // hunt off-schedule (any time), then clears the flag so it fires once per request.
  const state = await prisma.agentState.findUnique({ where: { id: 1 } });
  if (state?.huntRequestedAt) {
    await prisma.agentState.update({ where: { id: 1 }, data: { huntRequestedAt: null, huntRequestedBy: null } });
    sessionRunning = true;
    try {
      await runDiscoveryHunt();
      await alert("info", "Hunt refreshed on request", "Fresh under-the-radar names on the Discover tab.");
    } finally {
      sessionRunning = false;
    }
    return;
  }

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

  // 10:00–10:30 discovery hunt on market days (once/day) — surfaces new names.
  if (isMarketDay() && m >= 10 * 60 && m < 10 * 60 + 30) {
    const existing = await prisma.journalEntry.count({
      where: { kind: "RESEARCH", at: { gte: dayStart }, title: { startsWith: "Hunt dossier" } },
    });
    if (existing === 0) {
      sessionRunning = true;
      try {
        await runDiscoveryHunt();
        await alert("info", "Discovery hunt posted", "Fresh under-the-radar names on the Ideas page.");
      } finally {
        sessionRunning = false;
      }
      return;
    }
  }

  // Weekly smart-money scan (first market-day 11:00 window each week) — what
  // notable public portfolios (Pelosi/congress, funds, insiders) are doing.
  if (isMarketDay() && m >= 11 * 60 && m < 11 * 60 + 30) {
    const recent = await prisma.journalEntry.count({
      where: { kind: "RESEARCH", title: { startsWith: "Smart money" }, at: { gte: new Date(Date.now() - 6 * 24 * 60 * 60_000) } },
    });
    if (recent === 0) {
      sessionRunning = true;
      try {
        await runSmartMoneyScan();
        await alert("info", "Smart-money scan posted", "What notable public portfolios are buying — on the Ideas page.");
      } finally {
        sessionRunning = false;
      }
      return;
    }
  }

  // 12:30–13:00 midday brief on market days (once/day) — the lunch read.
  if (isMarketDay() && m >= 12 * 60 + 30 && m < 13 * 60) {
    const existing = await prisma.journalEntry.count({
      where: { kind: "RESEARCH", at: { gte: dayStart }, title: { startsWith: "Midday brief" } },
    });
    if (existing === 0) {
      sessionRunning = true;
      try {
        await runMiddayReport();
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
    if (broker.kind === "ibkr") {
      await (broker as IBKRBroker).keepAlive();
      await (broker as IBKRBroker).reconcile().catch((e) => alert("warning", "IBKR reconcile failed", String(e)));
    }
    const swept = await broker.sweepPendingOrders();
    if (swept > 0) await alert("info", `Resting orders filled: ${swept}`);
    await enforceExits();
    await checkDrawdown();
    await checkDailyLossPause();
    if (Date.now() - lastSnapshot > 30 * 60_000) {
      await writeNavSnapshot("intraday");
      lastSnapshot = Date.now();
    }
    await evaluateTriggers();
  }

  // Nightly bars maintenance: after close on market days, once per day.
  const p = etParts();
  if (isMarketDay() && p.minutesSinceMidnight >= 16 * 60 + 30 && lastBarsDay !== p.dateStr) {
    lastBarsDay = p.dateStr;
    const n = await refreshBars(await trackedSymbols(), "5d").catch(() => 0);
    console.log(`[bars] nightly refresh stored ${n} rows`);
  }

  // Company-logo backfill (hourly; resolves everything on the first tick).
  if (Date.now() - lastLogoBackfill > 60 * 60_000) {
    lastLogoBackfill = Date.now();
    const n = await backfillLogos().catch(() => 0);
    if (n > 0) console.log(`[logos] resolved ${n} company logo(s)`);
  }

  // FMP fundamentals backfill (hourly, a few at a time) — sector/cap/country for the filters.
  if (Date.now() - lastFundamentalsBackfill > 60 * 60_000) {
    lastFundamentalsBackfill = Date.now();
    const n = await backfillFundamentals().catch(() => 0);
    if (n > 0) console.log(`[fmp] refreshed ${n} fundamentals`);
  }

  await maybeScheduledSessions();
  await maybeWeeklyRefreshEnqueue();
  await processResearchQueue();
}

// Weekly full-universe dossier refresh: Saturday from 02:00 ET, every tracked
// symbol gets re-researched overnight — all fresh for Sunday's 10:00 review.
async function maybeWeeklyRefreshEnqueue() {
  const p = etParts();
  if (p.weekday !== WEEKLY_REFRESH_WEEKDAY || p.minutesSinceMidnight < WEEKLY_REFRESH_START_MIN) return;
  if (lastWeeklyRefreshDay === p.dateStr) return;
  lastWeeklyRefreshDay = p.dateStr;
  const symbols = await trackedSymbols();
  const inFlight = new Set(
    (
      await prisma.researchRequest.findMany({
        where: { status: { in: ["QUEUED", "RUNNING"] } },
        select: { symbol: true },
      })
    ).map((r) => r.symbol),
  );
  let queued = 0;
  for (const s of symbols) {
    if (inFlight.has(s)) continue;
    await prisma.researchRequest.create({ data: { symbol: s, requestedBy: "weekly-refresh" } });
    queued++;
  }
  console.log(`[weekly-refresh] queued ${queued} dossiers for the Sunday review`);
  await alert("info", `Weekly research refresh started: ${queued} dossiers queued`, "All universe names get fresh dossiers before Sunday's review.");
}

// Work the research queue one dossier at a time. Uncapped (Cam removed the daily
// ceiling 2026-06-13 and the on-demand cap 2026-06-15); the weekly-refresh size
// is the only remaining upstream bound.
async function processResearchQueue() {
  if (sessionRunning) return;
  const next = await prisma.researchRequest.findFirst({
    where: { status: "QUEUED" },
    orderBy: { at: "asc" },
  });
  if (!next) return;

  await prisma.researchRequest.update({ where: { id: next.id }, data: { status: "RUNNING" } });
  sessionRunning = true;
  const startedAt = new Date();
  try {
    const result = await runStockDossier(next.symbol, next.requestedBy);
    // DONE only if the session returned (didn't error) AND actually wrote its
    // RESEARCH entry. Otherwise the queue lies and the UI shows stale dossiers
    // as fresh — the 2026-06-13 model-outage failure mode where 41 errored
    // sessions were all silently marked DONE.
    const wrote = await prisma.journalEntry.count({
      where: { kind: "RESEARCH", symbol: next.symbol.toUpperCase(), at: { gte: startedAt } },
    });
    if (result === null || wrote === 0) {
      await prisma.researchRequest.update({
        where: { id: next.id },
        data: {
          status: "FAILED",
          error: result === null ? "session errored (model/SDK — see SYSTEM alerts)" : "session wrote no dossier entry",
        },
      });
      // runSession already alerts on a hard error; this catches the quiet
      // "ran but produced nothing" case it can't see.
      if (result !== null) {
        await alert("warning", `Dossier produced nothing: ${next.symbol}`, "Session ended without writing a RESEARCH entry.");
      }
    } else {
      await prisma.researchRequest.update({
        where: { id: next.id },
        data: { status: "DONE", completedAt: new Date() },
      });
      if (next.requestedBy !== "rotation" && next.requestedBy !== "weekly-refresh" && next.requestedBy !== "movers") {
        await alert("info", `Dossier ready: ${next.symbol}`, `Requested by ${next.requestedBy} — on the stock page now.`);
      }
    }
  } catch (e) {
    await prisma.researchRequest.update({
      where: { id: next.id },
      data: { status: "FAILED", error: e instanceof Error ? e.message : String(e) },
    });
    await alert("warning", `Dossier failed: ${next.symbol}`, e instanceof Error ? e.message : String(e));
  } finally {
    sessionRunning = false;
  }
}

async function main() {
  markBoot();
  await heartbeat({ bootAt: new Date(), note: "booting" });
  await prisma.settings.updateMany({ data: { agentVersion: AGENT_VERSION } });
  // A restart interrupts any in-flight dossier — requeue orphaned RUNNING
  // requests so they retry instead of being stuck RUNNING forever.
  const requeued = await prisma.researchRequest.updateMany({
    where: { status: "RUNNING" },
    data: { status: "QUEUED" },
  });
  if (requeued.count > 0) console.log(`[boot] requeued ${requeued.count} orphaned RUNNING dossier(s)`);
  await alert("warning", `Agent restarted (${AGENT_VERSION})`, `Warm-up: no trading for ${HARD.warmupMs / 60_000} minutes. Resuming watch.`);
  console.log(`[grq-agent] ${AGENT_VERSION} up. Market ${isMarketOpen() ? "OPEN" : "closed"}.`);

  for (;;) {
    try {
      await tick();
    } catch (e) {
      console.error("[tick] error", e);
      await alert("warning", "Agent tick error", e instanceof Error ? e.message : String(e)).catch(() => {});
    }
    // Tick fast while research is queued (batch nights), otherwise relax off-hours.
    const queuedCount = await prisma.researchRequest.count({ where: { status: "QUEUED" } }).catch(() => 0);
    await sleep(isMarketOpen() || queuedCount > 0 ? 60_000 : 5 * 60_000);
  }
}

process.on("unhandledRejection", (e) => console.error("[unhandledRejection]", e));
main().catch(async (e) => {
  console.error("[fatal]", e);
  await alert("critical", "Agent crashed at top level", e instanceof Error ? e.message : String(e)).catch(() => {});
  process.exit(1);
});
