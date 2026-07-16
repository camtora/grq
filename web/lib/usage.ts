import { prisma } from "./db";

// Token accounting for every model call the fund makes (AgentUsage rows — see agent/usage.ts).
// Used by the /tokens page and the scripts/token-report.ts CLI.
//
// ⚠ ONE TABLE, TWO WALLETS. This is the thing to keep straight:
//   MAX     — Claude via the Agent SDK, on Cam's shared Claude Max subscription. The TOKENS are the
//             scarce resource (a runaway scan has drained the day's quota by 11am). `costMicroUsd`
//             on these rows is NOTIONAL — what the call WOULD have cost on the metered API. Cam
//             pays a flat subscription; that money never moves.
//   METERED — OpenRouter challengers (The Race, the Options Desk). Real dollars leaving a prepaid
//             balance. The COST is the scarce resource; when it hits zero they silently go dark.
// Summing them is wrong in both directions: it inflates the Max burn alarm with tokens that never
// touched the quota, and it reports notional Max cost as money spent. Until 2026-07-16 both the
// alarm and the /tokens page did exactly that (D118d).

const FIVE_H_MS = 5 * 60 * 60 * 1000;

/** Which wallet a row spends. OpenRouter ids are `vendor/model` (`z-ai/glm-4.6`); Claude on the Max
 *  token is bare (`claude-opus-4-8`). A slash-named `claude-*` would be Claude routed THROUGH
 *  OpenRouter — metered, correctly. Single-sourced here and re-exported as isOpenRouterModel from
 *  agent/openrouter.ts: one rule, one spelling (the D118 lesson). */
export function isMeteredModel(model: string): boolean {
  return model.includes("/") && !model.startsWith("claude-");
}

// A SOFT, configurable estimate of the Max-plan 5-hour token budget. Anthropic does not expose a
// real "remaining quota" number for a subscription, so the page's "remaining" is OUR measured
// burn vs this estimate — clearly labeled as an estimate, never a guarantee. Set GRQ_MAX_5H_TOKENS
// to tune it (e.g. once you learn roughly where the wall is); unset hides the remaining bar.
export const MAX_5H_TOKENS = process.env.GRQ_MAX_5H_TOKENS ? Number(process.env.GRQ_MAX_5H_TOKENS) : null;

export type Totals = {
  calls: number;
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  total: number;
  costMicroUsd: number;
};
export type GroupAgg = Totals & { group: string };

type UsageRow = {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costMicroUsd: number;
  label: string;
  model: string;
  at: Date;
};

/** The day split by wallet. `max.total` is the number the burn alarm and the 5h window care about;
 *  `metered.costMicroUsd` is the only real money on the page. */
export type WalletSplit = { max: Totals; metered: Totals };

export function splitByWallet(rows: UsageRow[]): WalletSplit {
  const max = emptyTotals();
  const metered = emptyTotals();
  for (const r of rows) add(isMeteredModel(r.model) ? metered : max, r);
  return { max, metered };
}

function emptyTotals(): Totals {
  return { calls: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0, total: 0, costMicroUsd: 0 };
}

function add(t: Totals, r: UsageRow): void {
  t.calls++;
  t.input += r.inputTokens;
  t.output += r.outputTokens;
  t.cacheWrite += r.cacheCreationTokens;
  t.cacheRead += r.cacheReadTokens;
  t.total += r.inputTokens + r.outputTokens + r.cacheCreationTokens + r.cacheReadTokens;
  t.costMicroUsd += r.costMicroUsd;
}

// Start of the current Eastern-time day, as a UTC instant. DST-safe (uses the ET wall clock):
// ET-midnight = now − (ET time-of-day elapsed). Off by an hour only on the two DST-switch days.
export function etDayStart(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value || 0);
  const elapsedMs = ((get("hour") * 60 + get("minute")) * 60 + get("second")) * 1000 + now.getMilliseconds();
  return new Date(now.getTime() - elapsedMs);
}

function aggregate(rows: UsageRow[]): { totals: Totals; byGroup: GroupAgg[] } {
  const totals = emptyTotals();
  const groups = new Map<string, GroupAgg>();
  for (const r of rows) {
    add(totals, r);
    // Group by the family before the first ":" — "dossier:ATD" → "dossier", "checkin:11:00" →
    // "checkin" — so the 30+ daily dossiers collapse into one line.
    const g = (r.label.split(":")[0] || r.label).trim() || "(unlabeled)";
    let agg = groups.get(g);
    if (!agg) {
      agg = { group: g, ...emptyTotals() };
      groups.set(g, agg);
    }
    add(agg, r);
  }
  const byGroup = [...groups.values()].sort((a, b) => b.total - a.total);
  return { totals, byGroup };
}

export type UsageDashboard = {
  today: { totals: Totals; byGroup: GroupAgg[] };
  // The day split by wallet (D118d). `todayWallet.max` is Cam's Max-quota burn — the number the
  // headline and the 40M alarm mean; `todayWallet.metered.costMicroUsd` is real OpenRouter money.
  // `today.totals` remains the union (every call, for the by-type table).
  todayWallet: WalletSplit;
  // Per-MODEL breakdown for the viewed day (group = the model id). `costMicroUsd` is real spend for
  // OpenRouter challengers (slash-named) and the metered-EQUIVALENT for claude-* on the Max plan.
  byModel: GroupAgg[];
  rolling5h: Totals;
  recent: Array<{
    id: string;
    at: Date;
    label: string;
    model: string;
    status: string;
    numTurns: number;
    durationMs: number;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    total: number;
    costMicroUsd: number;
  }>;
  maxFiveH: number | null;
  // The current auto-rolled 5h window when an anchor is set: [start, reset]. The owner anchors one
  // reset instant; it then rolls itself forward in 5h steps forever — `rolling5h` is bounded to it.
  window: { start: Date; reset: Date } | null;
  anchorResetAt: Date | null; // the raw owner-set anchor (control pre-fill; agent can't read it)
  generatedAt: Date;
  // Whether the viewed day IS today. The live rolling-5h window only applies to today; a past
  // day shows just its own totals/by-type/recent (window/rolling5h are null/empty).
  isToday: boolean;
};

// Resolve an ET wall-clock time ("HH:MM") to the occurrence NEAREST to `now` (yesterday, today, or
// tomorrow). The window auto-rolls in 5h steps, so the only thing that matters is landing on the
// right 5h grid — nearest-occurrence means an anchor typed just after a reset (e.g. "3:00 PM" at
// 3:10) lands on today's 3pm, not 24h off (24h isn't a multiple of 5h, so the grid would shift).
export function resolveEtClockToInstant(hhmm: string, now = new Date()): Date | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  const base = etDayStart(now).getTime() + (h * 60 + min) * 60_000;
  const candidates = [base - 86_400_000, base, base + 86_400_000];
  let best = candidates[0];
  for (const c of candidates) {
    if (Math.abs(c - now.getTime()) < Math.abs(best - now.getTime())) best = c;
  }
  return new Date(best);
}

// Roll an owner-set anchor forward in 5h steps to the CURRENT window: the first reset strictly after
// `now`, and the start 5h before it. Works for past anchors too — that's the point, the owner sets
// it once and it keeps rolling. Returns null when no anchor is set.
export function currentWindow(anchor: Date | null, now = new Date()): { start: Date; reset: Date } | null {
  if (!anchor) return null;
  const a = anchor.getTime();
  const n = now.getTime();
  const steps = Math.ceil((n - a) / FIVE_H_MS);
  let reset = a + steps * FIVE_H_MS;
  if (reset <= n) reset += FIVE_H_MS; // boundary: exactly at a reset starts the next window
  return { start: new Date(reset - FIVE_H_MS), reset: new Date(reset) };
}

export async function getUsageDashboard(recentLimit = 60, viewAnchor?: Date): Promise<UsageDashboard> {
  const now = new Date();
  const dayStart = etDayStart(viewAnchor ?? now);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const isToday = dayStart.getTime() === etDayStart(now).getTime();

  // The rolling 5h window is a LIVE concept — only meaningful for today. A past day shows just
  // its own [dayStart, dayEnd) totals; no window, no rolling5h.
  const settings = isToday ? await prisma.settings.findUnique({ where: { id: 1 }, select: { maxWindowResetAt: true } }) : null;
  const anchor = settings?.maxWindowResetAt ?? null;
  const win = isToday ? currentWindow(anchor, now) : null;

  // Today: query from whichever start (window vs ET-day) reaches further back, open-ended.
  // A past day: bound to exactly that ET day.
  const windowStart = win ? win.start : new Date(now.getTime() - FIVE_H_MS);
  const where = isToday
    ? { at: { gte: new Date(Math.min(dayStart.getTime(), windowStart.getTime())) } }
    : { at: { gte: dayStart, lt: dayEnd } };
  const rows = await prisma.agentUsage.findMany({ where, orderBy: { at: "desc" } });

  const dayRows = rows.filter((r) => r.at >= dayStart && r.at < dayEnd);
  const today = aggregate(dayRows);
  const todayWallet = splitByWallet(dayRows);
  // The 5h window is a MAX-PLAN concept — it exists to answer "how close am I to the subscription
  // wall?". OpenRouter tokens never touched that quota, so counting them here overstated the burn
  // against MAX_5H_TOKENS and would trip the estimate early (D118d).
  const rolling5h = isToday ? splitByWallet(rows.filter((r) => r.at >= windowStart)).max : emptyTotals();

  // Per-model breakdown — which models ate the tokens (and $), sorted by cost then tokens.
  const modelMap = new Map<string, GroupAgg>();
  for (const r of dayRows) {
    let agg = modelMap.get(r.model);
    if (!agg) {
      agg = { group: r.model, ...emptyTotals() };
      modelMap.set(r.model, agg);
    }
    add(agg, r);
  }
  const byModel = [...modelMap.values()].sort((a, b) => b.costMicroUsd - a.costMicroUsd || b.total - a.total);

  const recent = dayRows.slice(0, recentLimit).map((r) => ({
    id: r.id,
    at: r.at,
    label: r.label,
    model: r.model,
    status: r.status,
    numTurns: r.numTurns,
    durationMs: r.durationMs,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    cacheCreationTokens: r.cacheCreationTokens,
    cacheReadTokens: r.cacheReadTokens,
    total: r.inputTokens + r.outputTokens + r.cacheCreationTokens + r.cacheReadTokens,
    costMicroUsd: r.costMicroUsd,
  }));

  return {
    today,
    todayWallet,
    byModel,
    rolling5h,
    recent,
    maxFiveH: MAX_5H_TOKENS,
    window: win,
    anchorResetAt: anchor,
    generatedAt: now,
    isToday,
  };
}

// Live burn for just the CURRENT 5h window — a cheap, sum-only query for the panel's poll so the
// token number tracks the same window the clock is showing (instead of the page's one-shot prop,
// which froze between window-boundary refreshes — the "drift when updated" bug).
export async function getCurrentWindowBurn(now = new Date()): Promise<{
  window: { start: Date; reset: Date } | null;
  anchorResetAt: Date | null;
  tokensBurned: number;
  calls: number;
  generatedAt: Date;
}> {
  const settings = await prisma.settings.findUnique({ where: { id: 1 }, select: { maxWindowResetAt: true } });
  const anchor = settings?.maxWindowResetAt ?? null;
  const win = currentWindow(anchor, now);
  const windowStart = win ? win.start : new Date(now.getTime() - FIVE_H_MS);
  const rows = await prisma.agentUsage.findMany({
    where: { at: { gte: windowStart } },
    select: { inputTokens: true, outputTokens: true, cacheCreationTokens: true, cacheReadTokens: true },
  });
  let tokensBurned = 0;
  for (const r of rows) tokensBurned += r.inputTokens + r.outputTokens + r.cacheCreationTokens + r.cacheReadTokens;
  return { window: win, anchorResetAt: anchor, tokensBurned, calls: rows.length, generatedAt: now };
}

// Aggregate an arbitrary window (used by the CLI report).
export async function getUsageWindow(since: Date): Promise<{ totals: Totals; byGroup: GroupAgg[]; rows: UsageRow[] }> {
  const rows = (await prisma.agentUsage.findMany({ where: { at: { gte: since } }, orderBy: { at: "desc" } })) as UsageRow[];
  return { ...aggregate(rows), rows };
}

// --- display helpers ---

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

export function fmtUsd(microUsd: number): string {
  return "$" + (microUsd / 1_000_000).toFixed(2);
}

export function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return s + "s";
  return Math.floor(s / 60) + "m " + (s % 60) + "s";
}
