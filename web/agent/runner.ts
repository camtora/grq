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
import { runMarketScreenNightly } from "../lib/market-screen/nightly";
import { runSmartMoneyIngest } from "../lib/smart-money/ingest";
import { runOptionsRefresh } from "../lib/options/store";
import { runSocialRefresh } from "../lib/social/store";
import { runMacroEventScan, refreshEconomicCalendar } from "../lib/macro-events";
import { runNewsIngest } from "../lib/news/ingest";
import { triageNews } from "./news-triage";
import { trackedSymbols, trackedUniverse, WEEKLY_REFRESH_WEEKDAY, WEEKLY_REFRESH_START_MIN } from "../lib/universe";
import { etDateStr, etParts, isMarketDay, isMarketOpen } from "./calendar";
import { HARD, DIALS, AGENT_VERSION, CHECKIN_TIMES_ET, CHESS } from "./policy";
import { markBoot, dayPnlBps, setDailyLossPauseConfirmed } from "./validator";
import { alert, heartbeat } from "./alerts";
import { pushNotify } from "../lib/push/notify";
import { apnsConfigured } from "../lib/push/apns";
import { runPremorningRead, runMorningResearch, runPositionCheck, runTriage, runEodReport, runWeeklyReview, runStockDossier, runDiscoveryHunt, runMiddayReport, runSmartMoneyScan, runStartupUniverseReview, runScheduledCheckin, runDailyChangeReport, runChessMoves } from "./sessions";
import { runRaceTick } from "./race/engine";
import { runDeskTick } from "./options-desk/engine";

const broker = getBroker();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// In-memory day state (rebuilt from DB checks on restart, so restarts are safe).
// NB: the ad-hoc decision budget and the held-position trigger anchors are NOT kept
// here — they live in AgentState (DB) so a restart can't reset them. (Cam 2026-06-24:
// they used to be in-memory, and ~8 restarts/day defeated both the daily cap and the
// per-symbol cooldown, letting one name re-escalate ~13×.)
let lastFullRefresh = 0;
let lastFastRefresh = 0;
let lastSnapshot = 0;
let lastBarsDay = "";
let lastLogoBackfill = 0;
let lastFundamentalsBackfill = 0;
let lastWeeklyRefreshDay = "";
let lastSatHeldRefreshDay = "";
let lastDailyRefreshDay = "";
let lastSmartMoneyDay = "";
let lastOptionsMs = 0;
let lastSocialMs = 0;
let lastMacroEventDay = "";
let lastNewsRun = 0;
let startupReviewChecked = false;
let dailyLossAlerted = "";
let sessionRunning = false;

// The research queue drains up to N dossiers CONCURRENTLY (Cam 2026-06-26). Dossiers are
// independent units — each reads market data → writes ONE JournalEntry, no trades, no
// cross-dossier deps — so a bounded pool turns a big refresh batch (weekly/daily/Saturday
// enqueue dozens) from a ~2h one-per-tick crawl into 5-wide bursts. The pool is still held
// under `sessionRunning` for the duration of each batch, so it NEVER overlaps a decision /
// check-in session — the agent does one *kind* of thing at a time, dossiers just go N-wide.
// Each batch is capped at N so a huge queue doesn't starve check-ins (next tick grabs the
// next N). Tunable via RESEARCH_CONCURRENCY; 1 = the old strictly-sequential behavior.
const RESEARCH_CONCURRENCY = Math.max(1, Math.floor(Number(process.env.RESEARCH_CONCURRENCY ?? 5)) || 1);

// --- Persisted ad-hoc decision budget (AgentState) ---------------------------
// The count of ad-hoc decision sessions used today (held-position escalations +
// self-scheduled wakeups). Auto-resets when the ET date rolls over.
async function getAdhocBudget(): Promise<number> {
  const today = etDateStr();
  const s = await prisma.agentState.findUnique({ where: { id: 1 } });
  return s && s.adhocDate === today ? s.adhocCount : 0;
}
async function bumpAdhocBudget(): Promise<void> {
  const today = etDateStr();
  const s = await prisma.agentState.findUnique({ where: { id: 1 } });
  const count = s && s.adhocDate === today ? s.adhocCount + 1 : 1;
  await prisma.agentState.upsert({
    where: { id: 1 },
    create: { id: 1, adhocDate: today, adhocCount: count },
    update: { adhocDate: today, adhocCount: count },
  });
}

// --- Persisted held-position trigger anchors (AgentState) --------------------
// The day-% at which we last CHECKED each held name. evaluateTriggers fires on the
// move SINCE that anchor (a fresh ±4% leg), not the absolute day-move.
type TriggerAnchor = { bps: number; day: string };
async function loadAnchors(): Promise<Map<string, TriggerAnchor>> {
  const s = await prisma.agentState.findUnique({ where: { id: 1 } });
  if (!s?.triggerAnchorsJson) return new Map();
  try {
    return new Map(Object.entries(JSON.parse(s.triggerAnchorsJson) as Record<string, TriggerAnchor>));
  } catch {
    return new Map();
  }
}
async function saveAnchors(anchors: Map<string, TriggerAnchor>): Promise<void> {
  const json = JSON.stringify(Object.fromEntries(anchors));
  await prisma.agentState.upsert({
    where: { id: 1 },
    create: { id: 1, triggerAnchorsJson: json },
    update: { triggerAnchorsJson: json },
  });
}

// Polite cadence: full universe every 10 min (market hours) / hourly (closed);
// holdings + watchlist + benchmark every 2 min while open (stops & triggers).
async function refreshQuotes(open: boolean) {
  const now = Date.now();
  if (now - lastFullRefresh >= (open ? 10 * 60_000 : 60 * 60_000)) {
    const n = await refreshAllQuotes();
    lastFullRefresh = now;
    lastFastRefresh = now;
    if (n === 0) await alert("warning", "Quote refresh returned 0 symbols", "Yahoo may be unhappy. Engine staleness guard will refuse blind fills.", { category: "system" });
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
        { category: "trades", symbol: p.symbol },
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
        { category: "trades", symbol: p.symbol },
      );
    }
  }
}

// Per-user price alerts (Phase 2 — The Wire). Members set "ping me when SYMBOL
// crosses $X" from the stock page or The Wire; each market-hours tick we compare
// the active alerts to fresh quotes and push the OWNER ONLY on the first crossing,
// then one-shot the alert (active=false, firedAt). Quotes are already refreshed at
// the top of the tick. Best-effort: a missing quote just skips that alert this tick.
async function checkPriceAlerts() {
  // Push IS the whole point of a price alert. If APNs isn't configured yet (APNS_*
  // unset), DON'T consume the one-shot — leave alerts active so they start firing
  // once push goes live, instead of silently flipping to "fired" with no delivery.
  if (!apnsConfigured()) return;
  const alerts = await prisma.priceAlert.findMany({ where: { active: true } });
  if (alerts.length === 0) return;
  const quotes = await getQuotes([...new Set(alerts.map((a) => a.symbol))]);
  for (const a of alerts) {
    const q = quotes.get(a.symbol);
    if (!q || q.midCents == null) continue;
    const crossed = a.direction === "above" ? q.midCents >= a.thresholdCents : q.midCents <= a.thresholdCents;
    if (!crossed) continue;
    // One-shot FIRST (atomic guard): only push if this update is the one that flips
    // the alert inactive, so a slow push can't double-fire across overlapping ticks.
    const flipped = await prisma.priceAlert.updateMany({
      where: { id: a.id, active: true },
      data: { active: false, firedAt: new Date() },
    });
    if (flipped.count === 0) continue;
    const money = (c: number) => (a.currency && a.currency !== "CAD" ? `${a.currency} ` : "$") + (c / 100).toFixed(2);
    const moved = a.direction === "above" ? "rose above" : "fell below";
    await pushNotify({
      category: "priceTargets",
      severity: "info",
      title: `${a.symbol} ${moved} ${money(a.thresholdCents)}`,
      body: `${a.symbol} is at ${money(q.midCents)}.${a.note ? ` — ${a.note}` : ""} Your price alert fired.`,
      onlyEmail: a.email,
      symbol: a.symbol,
    });
  }
}

// Consecutive ticks the drawdown has breached the kill threshold. The kill switch
// is severe and sticky (halts the fund until a human re-enables), so we require the
// breach to PERSIST across two ticks — a single transient NAV misread (e.g. a
// reconcile blip that briefly drops a position) must never halt trading. A real
// drawdown persists; a blip clears on the next tick. Resets on restart (safe
// direction: errs toward not-halting).
let drawdownBreaches = 0;
async function checkDrawdown() {
  const hwmRow = await prisma.navSnapshot.aggregate({ _max: { navCents: true } });
  const hwm = hwmRow._max.navCents ?? 0;
  if (hwm <= 0) return;
  const pf = await getPortfolio();
  const ddBps = Math.round(((pf.navCents - hwm) / hwm) * 10_000);
  if (ddBps > HARD.drawdownKillBps) {
    drawdownBreaches = 0; // healthy — clear any prior single breach
    return;
  }
  drawdownBreaches++;
  if (drawdownBreaches < 2) {
    await alert(
      "warning",
      "Drawdown threshold breached — confirming",
      `NAV $${(pf.navCents / 100).toFixed(2)} is ${(ddBps / 100).toFixed(1)}% off the high-water mark $${(hwm / 100).toFixed(2)}. Re-checking next tick before engaging the kill switch (guards against a transient misread).`,
      { category: "risk" },
    );
    return;
  }
  if (!pf.killSwitch) {
    await prisma.settings.update({
      where: { id: 1 },
      data: { killSwitch: true, killSwitchBy: "system-drawdown", killSwitchAt: new Date() },
    });
    await alert(
      "critical",
      "DRAWDOWN KILL SWITCH ENGAGED",
      `NAV $${(pf.navCents / 100).toFixed(2)} is ${(ddBps / 100).toFixed(1)}% off the high-water mark $${(hwm / 100).toFixed(2)} for two consecutive ticks. All trading halted until a human re-enables.`,
      { category: "risk" },
    );
  }
}

// Consecutive ticks day P&L has breached the pause threshold. Like the drawdown kill
// above, the pause requires the breach to PERSIST across two ticks — a single transient
// NAV misread (a just-filled position not yet mirrored → NAV understated by the trade
// amount for a tick) must never block buys. A real −3% day persists; a marking blip
// clears the moment reconcile catches up. Counter is scoped to the ET day.
let dailyLossBreaches = 0;
let dailyLossBreachDate = "";
async function checkDailyLossPause() {
  const today = etDateStr();
  if (dailyLossBreachDate !== today) {
    dailyLossBreaches = 0;
    dailyLossBreachDate = today;
  }
  if (dailyLossAlerted === today) return; // already confirmed + paused for the day
  const bps = await dayPnlBps();
  if (bps > HARD.dailyLossPauseBps) {
    dailyLossBreaches = 0; // healthy / recovered — clear a transient single breach
    return;
  }
  dailyLossBreaches++;
  if (dailyLossBreaches < 2) {
    await alert(
      "warning",
      "Daily-loss threshold breached — confirming",
      `Day P&L ${(bps / 100).toFixed(1)}% ≤ −3%. Re-checking next tick before pausing buys (guards against a transient NAV misread, e.g. a fill not yet mirrored).`,
      { category: "risk" },
    );
    return;
  }
  dailyLossAlerted = today;
  setDailyLossPauseConfirmed(today);
  await alert("warning", "Daily-loss pause engaged", "Day P&L ≤ −3% NAV for two consecutive checks: no new buys today. Risk-reducing sells still allowed.", { category: "risk" });
}

// Held-position trigger (every 2-min tick): fire a check when a holding has moved
// ≥4% SINCE THE LAST TIME WE CHECKED IT — a fresh ±4% leg — not when its absolute
// day-move is ≥4%. So a name that gaps +14% and sits there is checked ONCE; a run to
// +18% or a reversal to +10% earns a NEW check; the same move never re-reports. The
// anchor (the day-% at the last check) is persisted, so restarts can't resurrect the
// drumbeat. A "note"/"ignore" triage is a non-event — it's logged, NOT pushed. (Cam
// 2026-06-24: replaces the old absolute-≥4% + in-memory-30-min-cooldown trigger.)
async function evaluateTriggers() {
  if (sessionRunning) return;
  if ((await getAdhocBudget()) >= HARD.maxDecisionSessionsPerDay) return;
  const positions = await prisma.position.findMany();
  if (positions.length === 0) return;
  const quotes = await getQuotes(positions.map((p) => p.symbol));
  const today = etDateStr();
  const anchors = await loadAnchors();
  for (const p of positions) {
    const q = quotes.get(p.symbol);
    if (!q || typeof q.dayChangeBps !== "number") continue;
    const sym = p.symbol.toUpperCase();
    const anchor = anchors.get(sym);
    // Baseline = the day-% at our last check on this name (or the open, 0%, for the
    // first check of the day). Suppress unless it has moved another ±4% off that.
    const baselineBps = anchor && anchor.day === today ? anchor.bps : 0;
    if (Math.abs(q.dayChangeBps - baselineBps) < HARD.triggerMoveBps) continue;

    // A genuine new move. Anchor it NOW (before triage/escalation) and PERSIST, so the
    // same move can't re-fire — even if the process restarts mid-session.
    anchors.set(sym, { bps: q.dayChangeBps, day: today });
    await saveAnchors(anchors);

    const fromLabel = baselineBps === 0 ? "the open" : `${(baselineBps / 100).toFixed(1)}% at last check`;
    const event = `Holding ${sym} (${p.qty} sh, ACB $${(p.avgCostCents / 100).toFixed(2)}) has moved to ${(q.dayChangeBps / 100).toFixed(2)}% today (from ${fromLabel}), now $${(q.midCents / 100).toFixed(2)}.`;
    console.log(`[trigger] ${event}`);
    const action = await runTriage(event);
    if (action === "escalate") {
      if ((await getAdhocBudget()) >= HARD.maxDecisionSessionsPerDay) {
        console.log(`[trigger] ${sym} escalation skipped — ad-hoc decision budget spent for today`);
        continue;
      }
      await bumpAdhocBudget();
      sessionRunning = true;
      try {
        await runPositionCheck(event, sym);
      } finally {
        sessionRunning = false;
      }
    } else {
      // "note"/"ignore": a no-action move. The anchor is already updated so it won't
      // re-trigger; we log it but DON'T push — a no-action move is noise on the phone
      // (Cam 2026-06-24: "IFC moved 5.6% (no action) — I don't care").
      console.log(`[trigger] ${sym} triage=${action} — logged, no push`);
    }
  }
}

// Fire the agent's own self-scheduled check-ins (schedule_checkin). Market hours
// only; a wakeup missed by >30 min (a crash/downtime gap, or yesterday's leftover)
// is expired rather than fired stale. Self-scheduled wakeups DRAW on the ad-hoc
// decision budget (shared with held-position trigger escalations).
async function fireDueWakeups() {
  if (sessionRunning || !isMarketOpen()) return;
  const now = Date.now();
  await prisma.agentWakeup.updateMany({
    where: { status: "PENDING", dueAt: { lt: new Date(now - 30 * 60_000) } },
    data: { status: "CANCELLED" },
  });
  const due = await prisma.agentWakeup.findFirst({
    where: { status: "PENDING", dueAt: { lte: new Date(now) } },
    orderBy: { dueAt: "asc" },
  });
  if (!due) return;
  if ((await getAdhocBudget()) >= HARD.maxDecisionSessionsPerDay) {
    await prisma.agentWakeup.update({ where: { id: due.id }, data: { status: "CANCELLED" } });
    await alert("warning", "Self-scheduled check-in skipped — budget spent", `"${due.reason}" came due, but today's ${HARD.maxDecisionSessionsPerDay} ad-hoc decision sessions are used up.`, { category: "system" });
    return;
  }
  await prisma.agentWakeup.update({ where: { id: due.id }, data: { status: "FIRED", firedAt: new Date() } });
  await bumpAdhocBudget();
  sessionRunning = true;
  try {
    // The check-in itself writes its "Intraday Check-in — …" note and pushes under
    // "checkins" (notifyCheckinDecision). No separate "ran" ping — that was redundant.
    await runScheduledCheckin(`self-scheduled — ${due.reason}`);
  } finally {
    sessionRunning = false;
  }
}

async function maybeScheduledSessions() {
  if (sessionRunning) return;
  const p = etParts();
  const m = p.minutesSinceMidnight;
  const dayStart = (await import("./calendar")).startOfEtDay();

  // Startup universe review (D30, Cam 2026-06-17): on process boot the agent reviews the
  // watchlist, self-promotes the names it would invest in, then plans entries. This is a BIG
  // session — it fans out to ~12 subagents and burns multiple MILLION tokens of Cam's shared
  // Claude Max quota in one go. Because it runs on EVERY boot, a morning of agent dev (each
  // rebuild → restart firing a fresh scan) used to drain the day's quota by ~11am (Cam, ack
  // 2026-06-24). Guard: run it at most ONCE PER ET DAY (was 6h). We write a "started" marker
  // BEFORE running, so even a restart that kills the scan mid-flight can't re-trigger it later
  // the same day — the universe persists in the DB, so a skipped boot just reuses today's
  // already-built universe. (Force a fresh scan: delete today's "Startup universe review"
  // JournalEntry rows, or use the hunt/on-demand research paths intraday.)
  if (!startupReviewChecked) {
    startupReviewChecked = true;
    const [todayReviews, candidates] = await Promise.all([
      prisma.journalEntry.count({ where: { title: { startsWith: "Startup universe review" }, at: { gte: dayStart } } }),
      prisma.universeMember.count({ where: { status: "CANDIDATE" } }),
    ]);
    if (todayReviews === 0 && candidates > 0) {
      // Mark STARTED before running — this is the durable per-day guard against re-runs.
      await prisma.journalEntry.create({
        data: { kind: "SYSTEM", title: "Startup universe review — started", body: "Boot review of the watchlist began; re-runs are guarded for the rest of the ET day.", agentVersion: AGENT_VERSION },
      });
      sessionRunning = true;
      try {
        await runStartupUniverseReview();
        await prisma.journalEntry.create({
          data: { kind: "SYSTEM", title: "Startup universe review — completed", body: "Boot review of the watchlist completed; the agent built its universe.", agentVersion: AGENT_VERSION },
        });
        await alert("info", "Startup universe review complete", "The agent reviewed the watchlist and built its universe from the names it would invest in.", { category: "agentMoves" });
      } finally {
        sessionRunning = false;
      }
      return;
    }
  }

  // On-demand hunt refresh — a member hit "refresh" on the Discover tab. Runs the
  // hunt off-schedule (any time), then clears the flag so it fires once per request.
  const state = await prisma.agentState.findUnique({ where: { id: 1 } });
  if (state?.huntRequestedAt) {
    const brief = state.huntBrief?.trim() || undefined;
    // Clear only the pending trigger — leave huntBrief as the record that powers the
    // Hunt page's "directed hunt" banner until a blank refresh (or the daily hunt) resets it.
    await prisma.agentState.update({ where: { id: 1 }, data: { huntRequestedAt: null, huntRequestedBy: null } });
    sessionRunning = true;
    try {
      await runDiscoveryHunt(brief);
      await alert(
        "info",
        brief ? "Directed hunt complete" : "Hunt refreshed on request",
        brief ? `Focused on your brief: ${brief}` : "Fresh under-the-radar names on The Hunt.",
        { category: "hunt" },
      );
    } finally {
      sessionRunning = false;
    }
    return;
  }

  // On-demand Chess Moves (docs/CHESS-MOVES.md) — a member briefed a theme (or the
  // weekly self-pick was queued). Runs off-schedule, any time (research-only; market
  // needn't be open). Rate-guarded per ET day (Opus is expensive); over the cap the
  // theme stays PENDING and runs once the day rolls over. Restart-safe (orphaned
  // RUNNING themes are requeued on boot in main()).
  if (CHESS.enabled) {
    const pendingTheme = await prisma.chessTheme.findFirst({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" } });
    if (pendingTheme) {
      const ranToday = await prisma.chessTheme.count({ where: { status: { in: ["READY", "FAILED"] }, completedAt: { gte: dayStart } } });
      if (ranToday < CHESS.maxThemesPerDay) {
        await prisma.chessTheme.update({ where: { id: pendingTheme.id }, data: { status: "RUNNING" } });
        sessionRunning = true;
        try {
          await runChessMoves({ id: pendingTheme.id, brief: pendingTheme.brief });
          const done = await prisma.chessTheme.findUnique({ where: { id: pendingTheme.id }, select: { status: true, title: true } });
          if (done?.status === "READY") {
            await alert("info", `Chess Moves board ready: ${done.title}`, "A fresh value-chain board is live on Chess Moves.", { category: "hunt" });
          }
        } finally {
          sessionRunning = false;
        }
        return;
      }
    }
  }

  // 6:00–6:30 pre-morning read on market days (once/day) — a quick early scan, hours
  // before the heavy 9:00 game plan. It catches overnight/post-market moves (earnings,
  // gaps, downgrades), can request_research a fresh dossier on the few names a real
  // catalyst changes (so the research lands before 9:00), and writes ONE short read
  // that owns the Portfolio briefing slot until the game plan supersedes it (Cam 2026-06-25).
  if (isMarketDay() && m >= 6 * 60 && m < 6 * 60 + 30) {
    const existing = await prisma.journalEntry.count({
      where: { kind: "RESEARCH", at: { gte: dayStart }, title: { startsWith: "Pre-morning read" } },
    });
    if (existing === 0) {
      sessionRunning = true;
      try {
        await runPremorningRead();
      } finally {
        sessionRunning = false;
      }
      return;
    }
  }

  // 9:00–9:30 pre-market research on market days (the morning brief — the Game
  // plan shown on the Portfolio page). At 9:00 (not 8:00) so the plan reflects the
  // 8:30 ET US macro prints — CPI/jobs/PPI, the day's biggest scheduled movers —
  // and the latest pre-market; still ~30 min before the 9:30 open. (Cam 2026-06-17)
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
        // The daily hunt is broad — clear any lingering directed brief so the banner resets.
        if (state?.huntBrief) await prisma.agentState.update({ where: { id: 1 }, data: { huntBrief: null } });
        await runDiscoveryHunt();
        await alert("info", "Discovery hunt posted", "Fresh under-the-radar names on The Hunt.", { category: "hunt" });
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
        await alert("info", "Smart-money scan posted", "What notable public portfolios are buying — on the Ideas page.", { category: "hunt" });
      } finally {
        sessionRunning = false;
      }
      return;
    }
  }

  // Weekly Chess Moves "board of the week" (docs/CHESS-MOVES.md) — Alfred self-picks a
  // timely value chain. Sunday ~12:00 ET (market closed). Just ENQUEUES a PENDING WEEKLY
  // theme; the on-demand pickup above runs it next tick (one code path for running).
  // Guarded once-per-week by a recent-WEEKLY count (mirrors the smart-money scan).
  if (CHESS.enabled && CHESS.weeklyEnabled && p.weekday === CHESS.weeklyWeekday && m >= CHESS.weeklyStartMin && m < CHESS.weeklyStartMin + 30) {
    const recent = await prisma.chessTheme.count({
      where: { kind: "WEEKLY", createdAt: { gte: new Date(Date.now() - 6 * 24 * 60 * 60_000) } },
    });
    if (recent === 0) {
      await prisma.chessTheme.create({ data: { kind: "WEEKLY", title: "Board of the week", anchor: "", requestedBy: "Alfred" } });
      await alert("info", "Chess Moves: board of the week queued", "Alfred is about to map a fresh value chain.", { category: "hunt" });
      return;
    }
  }

  // 12:30–13:00 midday brief on market days (once/day) — the lunch read, a readable summary,
  // NOT a decision session. Moved back to 12:30 (Cam 2026-06-25) so noon can be a real check-in:
  // the noon check-in fires 12:00–12:30 via the check-in loop below, this brief 12:30–13:00. This
  // block runs before the loop and returns, but it's once/day so it won't starve the noon check-in
  // (which has already run by 12:30). Check-ins are now 10/11/12/13/14/15.
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

  // Fixed intraday trading check-ins (HOURLY 10:00–15:00 ET) — decision-capable
  // sessions that act on the standing game plan. Each fires once/day inside a 60-min
  // window (wide enough that a same-slot research/brief, which returns earlier in this
  // function, runs first and the check-in falls through on a later tick). Restart-safe
  // via a SYSTEM marker. EXEMPT from the decision budget (a short fixed list).
  if (isMarketOpen()) {
    for (const hhmm of CHECKIN_TIMES_ET) {
      const [hh, mm] = hhmm.split(":").map(Number);
      const slot = hh * 60 + mm;
      if (m < slot || m >= slot + 60) continue;
      const marker = `Scheduled check-in ${hhmm}`;
      const done = await prisma.journalEntry.count({ where: { kind: "SYSTEM", title: marker, at: { gte: dayStart } } });
      if (done > 0) continue;
      sessionRunning = true;
      try {
        await runScheduledCheckin(`scheduled ${hhmm} ET`);
        await prisma.journalEntry.create({
          data: { kind: "SYSTEM", title: marker, body: `Ran the ${hhmm} ET trading check-in.`, agentVersion: AGENT_VERSION },
        });
      } finally {
        sessionRunning = false;
      }
      return;
    }
  }

  // 3:00–3:30 ET daily: the "build diary" — a plain-English summary of the day's app
  // changes for Graham (D-buildlog). Runs EVERY day (incl. weekends — Cam codes then
  // too) and covers the 3am→3am window, so it's dated YESTERDAY; guard on a CHANGE
  // report already written for that day (the −26h lower bound is DST-safe).
  if (m >= 3 * 60 && m < 3 * 60 + 30) {
    const prevDayStart = new Date(dayStart.getTime() - 26 * 60 * 60_000);
    const existing = await prisma.report.count({ where: { kind: "CHANGE", date: { gte: prevDayStart, lt: dayStart } } });
    if (existing === 0) {
      sessionRunning = true;
      try {
        await runDailyChangeReport();
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

  // Saturday 09:00+ weekly review (Cam 2026-06-21, was Sunday 10:00). It takes the
  // portfolio page's briefing slot and stays there all weekend until Monday's 9:00
  // game plan supersedes it. It's a retrospective (RETROs, attribution, lessons, source
  // grades, capital rec) and only needs HELD names fresh for open-thesis grading — the
  // Saturday 06:00 held-names refresh (maybeSaturdayHeldRefreshEnqueue) handles that ~3h
  // earlier; the heavy full-pool refresh is decoupled to Sunday 02:00 (Cam 2026-06-25).
  // Dedupe on a WEEKLY already dated today (mirrors the EOD guard above).
  if (p.weekday === 6 && m >= 9 * 60) {
    const existing = await prisma.report.count({ where: { date: dayStart, kind: "WEEKLY" } });
    if (existing === 0) {
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
  const open = isMarketOpen();

  await refreshQuotes(open);
  await heartbeat({ lastTickAt: new Date(), note: open ? "market open" : "market closed" });

  if (open) {
    if (broker.kind === "ibkr") {
      await (broker as IBKRBroker).keepAlive();
      // Finalise any PENDING orders whose fill landed after the synchronous poll
      // window BEFORE reconcile, so a sell's realized P&L reads the pre-fill ACB.
      const fills = await (broker as IBKRBroker).finalizePending().catch(async (e) => {
        await alert("warning", "IBKR finalize-pending failed", String(e), { category: "system" });
        return [];
      });
      for (const f of fills) {
        // System stops/take-profits already pinged at trigger time — don't double-alert.
        if (f.placedBy === "system-stop" || f.placedBy === "system-takeprofit") continue;
        await alert(
          "info",
          `${f.side === "BUY" ? "Bought" : "Sold"} ${f.qty} ${f.symbol} @ $${(f.priceCents / 100).toFixed(2)}`,
          (f.reason ?? "Filled — confirmed from broker truth after the order rested.").slice(0, 280),
          { category: "trades", symbol: f.symbol },
        );
      }
      const frozen = await (broker as IBKRBroker)
        .reconcile()
        .catch((e) => { alert("warning", "IBKR reconcile failed", String(e), { category: "system" }); return [] as string[]; });
      if (frozen.length) {
        await alert(
          "critical",
          `Suspected account reset — reconcile frozen (${frozen.length})`,
          `${frozen.join(", ")} vanished from IBKR with no sell on record. The mirror is FROZEN to avoid a false drawdown/kill-switch trip. Verify the account, then re-anchor + force a reconcile.`,
          { category: "risk" },
        );
      }
    }
    const swept = await broker.sweepPendingOrders();
    if (swept > 0) await alert("info", `Resting orders filled: ${swept}`, "", { category: "trades" });
    await enforceExits();
    await checkPriceAlerts();
    await checkDrawdown();
    await checkDailyLossPause();
    // Snapshot NAV every ~2 min while open — matched to the holdings quote refresh
    // (lastFastRefresh, also 2 min), so each point reflects fresh prices and the NAV
    // tape draws a smooth intraday curve instead of jagged 30-min jumps (Cam 2026-06-24).
    // NAV is recomputed fresh each time (writeNavSnapshot), and every reader of these rows
    // is day-scoped or a pre-day lookup, so finer points only help the tape. (Fills/FX
    // still snapshot at the moment they happen, on top of this cadence.)
    if (Date.now() - lastSnapshot > 2 * 60_000) {
      await writeNavSnapshot("intraday");
      lastSnapshot = Date.now();
    }
    await evaluateTriggers();
    await fireDueWakeups();
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

  // Smart Money ingest (D27) — once per ET day: congress + insider trades file
  // continuously (daily), and 13Fs only re-pull when a new filing date appears.
  if (lastSmartMoneyDay !== p.dateStr) {
    lastSmartMoneyDay = p.dateStr;
    runSmartMoneyIngest()
      .then((r) => console.log(`[smartmoney] ingest: ${r.congress} congress · ${r.insiders} insider · ${r.portfolios.fresh} fresh 13F`))
      .catch((e) => console.error("[smartmoney] ingest failed:", e instanceof Error ? e.message : e));
  }

  // Tier 3 — options positioning (Graham's ask): ~HOURLY during market hours, cache CBOE dealer-
  // gamma / put-call / IV-skew for held+watched+focus US names (lib/options). refreshOptions self-
  // throttles per name via its 55-min freshness window + a day-scoped negative cache, so this stays
  // cheap. A SIGNAL the agent weighs (dossiers + context), NEVER traded. Free feed — no rate cost.
  if (isMarketOpen() && Date.now() - lastOptionsMs > 55 * 60_000) {
    lastOptionsMs = Date.now();
    runOptionsRefresh()
      .then((r) => console.log(`[options] refreshed ${r.covered}/${r.tried} names with listed-options coverage`))
      .catch((e) => console.error("[options] refresh failed:", e instanceof Error ? e.message : e));
  }

  // Tier 8 — social sentiment (D89): ~every 6h, AROUND THE CLOCK (Reddit buzz builds nights/
  // weekends, so this isn't gated on market hours). Pull the free ApeWisdom boards + Stocktwits for
  // held+watched+focus names, compute velocity vs our own history, cache one SocialDaily row per name
  // per ET day. runSocialRefresh self-throttles (6h freshness gate). A CROWDING/RISK signal the agent
  // weighs (context + dossiers) — on probation, NEVER traded. Free feeds — no rate cost, no quota.
  if (Date.now() - lastSocialMs > 6 * 60 * 60_000) {
    lastSocialMs = Date.now();
    runSocialRefresh()
      .then((r) => { if (!r.reused) console.log(`[social] refreshed ${r.covered}/${r.tried} names with retail chatter`); })
      .catch((e) => console.error("[social] refresh failed:", e instanceof Error ? e.message : e));
  }

  // Macro events (D81) — once per ET day: diff the live macro snapshot against
  // yesterday's and record discrete deltas (rate decisions, CPI prints, notable
  // yield/FX moves) the agent reads in context. An INPUT it weighs, never the gate.
  if (lastMacroEventDay !== p.dateStr) {
    lastMacroEventDay = p.dateStr;
    runMacroEventScan()
      .then((r) => { if (r.events > 0) console.log(`[macro] ${r.events} event(s) recorded for ${r.date}`); })
      .catch((e) => console.error("[macro] event scan failed:", e instanceof Error ? e.message : e));
    refreshEconomicCalendar()
      .then((r) => { if (r.events > 0) console.log(`[macro] calendar: ${r.events} upcoming US/CA catalyst(s)`); })
      .catch((e) => console.error("[macro] calendar refresh failed:", e instanceof Error ? e.message : e));
  }

  // News capture + Haiku triage (D81, M2) — every ~90 min, around the clock: pull
  // general + held/watched/focus news (cheap, deterministic), then triage only the NEW
  // rows with one batched Haiku call. Background (must NOT block the tick); the digest
  // feeds the agent context — Opus never sees raw articles, so this stays off the quota.
  if (Date.now() - lastNewsRun > 90 * 60_000) {
    lastNewsRun = Date.now();
    runNewsIngest()
      .then(async (r) => {
        if (r.captured > 0) console.log(`[news] captured ${r.captured} new across ${r.symbols} names`);
        const t = await triageNews();
        if (t.triaged > 0) console.log(`[news] triaged ${t.triaged}`);
      })
      .catch((e) => console.error("[news] ingest/triage failed:", e instanceof Error ? e.message : e));
  }

  await maybeScheduledSessions();
  await maybeWeeklyRefreshEnqueue();
  await maybeSaturdayHeldRefreshEnqueue();
  await maybeDailyRefreshEnqueue();
  await processResearchQueue();

  // Bull Races (background — ~8 model calls; self-guarded against overlap, must NOT block the tick).
  runRaceTick().catch((e) => console.error("[bullrace] tick error", e instanceof Error ? e.message : e));

  // The Options Desk (background — 2 arms; self-guarded against overlap, must NOT block the tick).
  // Pure sandbox (docs/THE-OPTIONS-DESK.md) — never touches the §6 gate, the broker, or real options.
  runDeskTick().catch((e) => console.error("[optionsdesk] tick error", e instanceof Error ? e.message : e));
}

// Weekly full-universe dossier refresh: Sunday from 02:00 ET (= Saturday night), every
// tracked symbol gets re-researched overnight so the whole research library is fresh for
// the trading week ahead. Decoupled from the Saturday 09:00 review (Cam 2026-06-25) — the
// review only needs HELD names fresh (see maybeSaturdayHeldRefreshEnqueue), not the pool.
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
  console.log(`[weekly-refresh] queued ${queued} dossiers for the week ahead`);
  await alert("info", `Weekly research refresh started: ${queued} dossiers queued`, "Every tracked name gets a fresh dossier overnight for the week ahead.", { category: "dossiers" });
}

// Saturday pre-review HELD-names refresh (Cam 2026-06-25): before the 09:00 weekly
// review, re-dossier just the OPEN positions so the review grades open theses on fresh
// data (Friday's close + any weekend news). Cheap — only the held set (~20), not the
// whole pool; the heavy full-pool refresh runs Sunday 02:00. 06:00 ET gives ~3h before
// the review, ample to drain the queue.
const SAT_HELD_REFRESH_MIN = 6 * 60; // 06:00 ET
async function maybeSaturdayHeldRefreshEnqueue() {
  const p = etParts();
  if (p.weekday !== 6 || p.minutesSinceMidnight < SAT_HELD_REFRESH_MIN) return;
  if (lastSatHeldRefreshDay === p.dateStr) return;
  lastSatHeldRefreshDay = p.dateStr;
  const positions = await prisma.position.findMany({ select: { symbol: true } });
  if (positions.length === 0) return;
  const inFlight = new Set(
    (await prisma.researchRequest.findMany({ where: { status: { in: ["QUEUED", "RUNNING"] } }, select: { symbol: true } })).map((r) => r.symbol),
  );
  let queued = 0;
  for (const pos of positions) {
    if (inFlight.has(pos.symbol)) continue;
    await prisma.researchRequest.create({ data: { symbol: pos.symbol, requestedBy: "saturday-held-refresh" } });
    queued++;
  }
  if (queued > 0) console.log(`[saturday-held-refresh] queued ${queued} held-name dossiers ahead of the 09:00 review`);
}

// Daily research-freshness pass (Cam 2026-06-21): once per market day, pre-market.
// HELD positions always re-dossier — real money rides on them. Other tracked names
// re-dossier only when their dossier is STALE *and* the name actually MOVED, so a
// Tuesday catalyst gets a same-day refresh instead of waiting for the Saturday full
// pass — without burning an Opus pass on every quiet name. Deterministic gates only
// (staleness + day-move); no extra LLM call to choose. The Saturday full refresh stays
// as the every-name backstop. Skips weekends/holidays (the Saturday pass covers those).
// Humans tune the knobs.
const DAILY_REFRESH_OPEN_MIN = 5 * 60; // 05:00 ET — pre-market window opens
const DAILY_REFRESH_CLOSE_MIN = 9 * 60; // …closes 09:00 ET (before the morning plan)
const DAILY_REFRESH_STALE_MS = 18 * 60 * 60_000; // skip names re-dossiered within ~18h
const DAILY_REFRESH_MOVE_BPS = 400; // non-held: refresh only on a |day move| ≥ 4%
async function maybeDailyRefreshEnqueue() {
  const p = etParts();
  if (!isMarketDay()) return;
  if (p.minutesSinceMidnight < DAILY_REFRESH_OPEN_MIN || p.minutesSinceMidnight >= DAILY_REFRESH_CLOSE_MIN) return;
  if (lastDailyRefreshDay === p.dateStr) return;
  lastDailyRefreshDay = p.dateStr;

  // Market Base Layer — nightly re-screen (deterministic, ~free; preserves tags) + Haiku-tag
  // any NEW names. Bounded; background so it never blocks the daily refresh. (docs/MARKET-BASE-LAYER.md)
  runMarketScreenNightly()
    .then((r) => console.log(`[market-screen] ${r.kept} screened · ${r.tagged} newly tagged`))
    .catch((e) => console.error("[market-screen] nightly failed", e));

  const [tracked, positions, inFlightRows, quotes] = await Promise.all([
    trackedUniverse(),
    prisma.position.findMany({ select: { symbol: true } }),
    prisma.researchRequest.findMany({ where: { status: { in: ["QUEUED", "RUNNING"] } }, select: { symbol: true } }),
    prisma.quote.findMany({ select: { symbol: true, dayChangeBps: true } }),
  ]);
  const held = new Set(positions.map((x) => x.symbol.toUpperCase()));
  const inFlight = new Set(inFlightRows.map((r) => r.symbol));
  const moveBps = new Map(quotes.map((q) => [q.symbol.toUpperCase(), Math.abs(q.dayChangeBps)]));
  const staleBefore = new Date(Date.now() - DAILY_REFRESH_STALE_MS);

  let queued = 0;
  let heldCount = 0;
  for (const row of tracked) {
    const sym = row.symbol;
    if (inFlight.has(sym)) continue;
    const latest = await prisma.journalEntry.findFirst({
      where: { kind: "RESEARCH", symbol: sym.toUpperCase(), title: { startsWith: "Dossier" } },
      orderBy: { at: "desc" },
      select: { at: true },
    });
    if (latest && latest.at > staleBefore) continue; // re-dossiered recently — leave it
    const isHeld = held.has(sym.toUpperCase());
    const moved = (moveBps.get(sym.toUpperCase()) ?? 0) >= DAILY_REFRESH_MOVE_BPS;
    if (!isHeld && !moved) continue; // non-held names only refresh when they actually moved
    await prisma.researchRequest.create({ data: { symbol: sym, requestedBy: "daily-refresh" } });
    queued++;
    if (isHeld) heldCount++;
  }
  if (queued > 0) console.log(`[daily-refresh] queued ${queued} dossiers (${heldCount} held + ${queued - heldCount} movers, pre-market)`);
}

// Work the research queue one dossier at a time. Uncapped (Cam removed the daily
// ceiling 2026-06-13 and the on-demand cap 2026-06-15); the weekly-refresh size
// is the only remaining upstream bound.
type ResearchRow = NonNullable<Awaited<ReturnType<typeof prisma.researchRequest.findFirst>>>;

// Run ONE dossier and reconcile its queue row. Always resolves (never throws) — it owns its
// own try/catch so a parallel batch's Promise.all can't be torpedoed by one failure.
async function runOneDossier(next: ResearchRow): Promise<void> {
  await prisma.researchRequest.update({ where: { id: next.id }, data: { status: "RUNNING" } });
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
        await alert("warning", `Dossier produced nothing: ${next.symbol}`, "Session ended without writing a RESEARCH entry.", { category: "dossiers", symbol: next.symbol });
      }
    } else {
      await prisma.researchRequest.update({
        where: { id: next.id },
        data: { status: "DONE", completedAt: new Date() },
      });
      if (
        next.requestedBy !== "daily-refresh" &&
        next.requestedBy !== "weekly-refresh" &&
        next.requestedBy !== "movers" &&
        next.requestedBy !== "hunt" &&
        next.requestedBy !== "smart-money"
      ) {
        await alert("info", `Dossier ready: ${next.symbol}`, `Requested by ${next.requestedBy} — on the stock page now.`, { category: "dossiers", symbol: next.symbol });
      }
    }
  } catch (e) {
    await prisma.researchRequest.update({
      where: { id: next.id },
      data: { status: "FAILED", error: e instanceof Error ? e.message : String(e) },
    });
    await alert("warning", `Dossier failed: ${next.symbol}`, e instanceof Error ? e.message : String(e), { category: "dossiers", symbol: next.symbol });
  }
}

async function processResearchQueue() {
  if (sessionRunning) return;
  // Grab up to RESEARCH_CONCURRENCY queued dossiers and drain them in parallel. The whole
  // batch is held under `sessionRunning` so it never overlaps a decision/check-in session;
  // capping at N per tick keeps a huge queue from monopolizing the agent (next tick grabs N more).
  const batch = await prisma.researchRequest.findMany({
    where: { status: "QUEUED" },
    orderBy: { at: "asc" },
    take: RESEARCH_CONCURRENCY,
  });
  if (batch.length === 0) return;

  sessionRunning = true;
  try {
    if (batch.length > 1) {
      console.log(`[research] draining ${batch.length} dossiers in parallel: ${batch.map((b) => b.symbol).join(", ")}`);
    }
    await Promise.all(batch.map((req) => runOneDossier(req)));
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
  // Same for a Chess Moves board interrupted mid-map — back to PENDING so it retries.
  const requeuedChess = await prisma.chessTheme.updateMany({ where: { status: "RUNNING" }, data: { status: "PENDING" } });
  if (requeuedChess.count > 0) console.log(`[boot] requeued ${requeuedChess.count} orphaned RUNNING chess board(s)`);
  await alert("warning", `Agent restarted (${AGENT_VERSION})`, `Warm-up: no trading for ${HARD.warmupMs / 60_000} minutes. Resuming watch.`, { category: "system" });
  console.log(`[grq-agent] ${AGENT_VERSION} up. Market ${isMarketOpen() ? "OPEN" : "closed"}.`);

  for (;;) {
    try {
      await tick();
    } catch (e) {
      console.error("[tick] error", e);
      await alert("warning", "Agent tick error", e instanceof Error ? e.message : String(e), { category: "system" }).catch(() => {});
    }
    // Tick fast while research is queued (batch nights), otherwise relax off-hours.
    const queuedCount = await prisma.researchRequest.count({ where: { status: "QUEUED" } }).catch(() => 0);
    await sleep(isMarketOpen() || queuedCount > 0 ? 60_000 : 5 * 60_000);
  }
}

process.on("unhandledRejection", (e) => console.error("[unhandledRejection]", e));
main().catch(async (e) => {
  console.error("[fatal]", e);
  await alert("critical", "Agent crashed at top level", e instanceof Error ? e.message : String(e), { category: "system" }).catch(() => {});
  process.exit(1);
});
