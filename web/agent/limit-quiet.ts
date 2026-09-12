import { prisma } from "../lib/db";
import { currentWindow, resolveEtClockToInstant } from "../lib/usage";
import { etDateStr } from "./calendar";
import { AGENT_VERSION } from "./policy";
import { alert } from "./alerts";

/**
 * Claude-limit quiet (Cam, 2026-09-11 — D123).
 *
 * Every Claude call the fund makes rides ONE shared Max token. When that token hits a usage or spend
 * limit, every session dies the same way, instantly — and until today each death was its own
 * "Agent session failed" push. The Bull Race + Options Desk turned it into a storm: a race whose bulls
 * all fail writes no RaceCall, so it stays "due" and is retried on EVERY 60s tick → 4 failures a
 * minute → ~90 pushes to Cam's phone in one afternoon.
 *
 * The class fix: a limit error ANYWHERE trips one DB-durable quiet window. While it is on, runSession /
 * the council / chat make NO Claude call (skip + log, no per-session alert) until
 *   1. the reset the error itself names ("resets 3pm", or the "|<epoch>" some CLI builds append), else
 *   2. the next 5-hour window reset rolled from Settings.maxWindowResetAt — the owner-set anchor on
 *      /tokens ("the next window, which we have"), else
 *   3. a 60-minute fallback (and the ping says to set the anchor).
 * At the boundary the first session probes. Still walled → quiet re-arms to the next window and says
 * nothing: ONE ping per ET day, not one per failure. Durable in AgentState so a restart can't forget it
 * and re-storm (the boot-time universe scan is one of the sessions it silences).
 *
 * Scope: the agent's THINKING. OpenRouter challengers are metered and unaffected; the §6 gate, the kill
 * switch, reconcile and the data feeds never touch this. Lift it early (Cam raised the limit):
 *   docker exec grq-db psql -U grq grq -c 'update "AgentState" set "limitQuietUntil"=null where id=1'
 */

const FALLBACK_MS = 60 * 60_000;
const MAX_HORIZON_MS = 7 * 24 * 60 * 60_000; // a named reset further out than a week is a typo, not a plan
const CACHE_TTL_MS = 30_000;

// The message family as Claude Code / the SDK actually word it (real captures, keep adding):
//  - "You've hit your org's monthly spend limit · ask your admin to raise it at claude.ai/settings/usage…"
//    (2026-09-11 — the one that caused the storm)
//  - "You've hit your limit · resets 3pm (America/Toronto)"                (the 5-hour window)
//  - "You've hit your weekly limit · resets Sep 15 at 3pm"
//  - "Claude AI usage limit reached|1757620800"                            (older CLI: epoch seconds)
//  - "You're out of extra usage"
//  - API-level: {"type":"rate_limit_error", …} / "would exceed your organization's rate limit"
const LIMIT_RE =
  /hit your (?:org(?:'s|anization's)? )?(?:monthly |weekly |daily )?(?:spend |usage |rate )?limit|usage limit reached|spend limit|rate[ _-]?limit|out of (?:extra )?usage|quota (?:exceeded|exhausted)/i;

// The ACCESS family (2026-09-12): the token is refused outright, not metered. Same property that
// makes quiet the right response — every Claude call will fail identically until a HUMAN acts
// (flip the org setting, mint a new token) — so retrying is waste and alerting per retry is a storm
// (23 "weekly-review failed" pushes in 2h on the first morning). Real captures:
//  - "Your organization has disabled Claude subscription access for Claude Code · Use an Anthropic
//    API key instead, or ask your admin to enable access"                         (2026-09-12)
//  - API-level: {"type":"authentication_error", …} / "invalid x-api-key" / "OAuth token has expired"
const ACCESS_RE =
  /disabled Claude subscription access|Use an Anthropic API key instead|authentication_error|invalid (?:x-api-key|api key|bearer token)|OAuth token (?:has )?(?:expired|been revoked)|token (?:has )?(?:expired|been revoked)|not logged in|please run \/login/i;

/** Is this error text the shared Claude token hitting a usage/spend/rate limit — OR being refused
 *  outright (org disabled subscription access, dead/expired token)? Both mean "no Claude call can
 *  succeed until a human acts", which is what quiet exists for. Pure. */
export function isClaudeLimitError(text: string | null | undefined): boolean {
  return !!text && (LIMIT_RE.test(text) || ACCESS_RE.test(text));
}

/** Which family — drives the ping's wording: a limit lifts itself, an access refusal never does. */
export function claudeErrorFamily(text: string): "limit" | "access" {
  return ACCESS_RE.test(text) ? "access" : "limit";
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
// "resets 3pm" · "resets 3:30 pm" · "resets at 15:00" · "resets Sep 15 at 3pm" · "resets Sep 15, 3pm"
const RESET_RE =
  /resets?\s+(?:at\s+)?(?:(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(?:at\s+)?)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/i;
const EPOCH_RE = /\|(\d{10})\b/;

/** The reset instant the error itself names, or null. An ET clock resolves to the nearest occurrence
 *  (the /tokens anchor rule) and is bumped a day if that lands in the past; a month-day walks to that
 *  ET date. Pure — pass `now` for tests. */
export function parseResetHint(text: string, now = new Date()): Date | null {
  const epoch = EPOCH_RE.exec(text);
  if (epoch) {
    const d = new Date(Number(epoch[1]) * 1000);
    return d.getTime() > now.getTime() ? d : null;
  }
  const m = RESET_RE.exec(text);
  if (!m) return null;
  let hour = Number(m[3]);
  const minute = m[4] ? Number(m[4]) : 0;
  const ampm = m[5]?.toLowerCase().replace(/\./g, "");
  if (ampm === "pm" && hour < 12) hour += 12;
  if (ampm === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  const hhmm = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

  let at = resolveEtClockToInstant(hhmm, now);
  if (!at) return null;
  if (m[1]) {
    // Walk day by day to the named ET date (this year or next), then re-resolve the clock ON that day
    // so a DST boundary crossed on the way can't skew the hour.
    const monthIdx = MONTHS.indexOf(m[1].toLowerCase().slice(0, 3));
    const day = Number(m[2]);
    const year = Number(etDateStr(now).slice(0, 4));
    const want = new Set(
      [year, year + 1].map((y) => `${y}-${String(monthIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`),
    );
    let cur = new Date(at.getTime() - 86_400_000);
    let found: Date | null = null;
    for (let i = 0; i < 400 && !found; i++) {
      if (want.has(etDateStr(cur))) found = resolveEtClockToInstant(hhmm, cur);
      cur = new Date(cur.getTime() + 86_400_000);
    }
    if (!found) return null;
    at = found;
  }
  if (at.getTime() <= now.getTime()) at = new Date(at.getTime() + 86_400_000);
  return at;
}

export type QuietSource = "message" | "window" | "fallback";

/** How long to stay quiet for this error, and where that instant came from. Pure. */
export function quietUntilFor(text: string, now: Date, anchor: Date | null): { until: Date; source: QuietSource } {
  const hinted = parseResetHint(text, now);
  if (hinted && hinted.getTime() > now.getTime()) {
    const capped = Math.min(hinted.getTime(), now.getTime() + MAX_HORIZON_MS);
    return { until: new Date(capped), source: "message" };
  }
  const win = currentWindow(anchor, now);
  if (win) return { until: win.reset, source: "window" };
  return { until: new Date(now.getTime() + FALLBACK_MS), source: "fallback" };
}

export function fmtEt(d: Date): string {
  return (
    d.toLocaleString("en-US", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) +
    " ET"
  );
}

// ----- state (AgentState id=1, cached briefly so the 60s tick + every session start stay cheap) -----

let cache: { until: Date | null; at: number } | null = null;

/** The instant quiet lifts, or null when Claude calls may proceed. */
export async function limitQuietUntil(now = new Date()): Promise<Date | null> {
  if (!cache || now.getTime() - cache.at > CACHE_TTL_MS) {
    const row = await prisma.agentState.findUnique({ where: { id: 1 }, select: { limitQuietUntil: true } }).catch(() => null);
    cache = { until: row?.limitQuietUntil ?? null, at: now.getTime() };
  }
  return cache.until && cache.until.getTime() > now.getTime() ? cache.until : null;
}

export async function limitQuietActive(now = new Date()): Promise<boolean> {
  return (await limitQuietUntil(now)) !== null;
}

/** A Claude call just died on the limit: arm (or re-arm) quiet, durably, and say so at most once a day.
 *  Safe to call from N parallel failures — the announce is guarded in-process before its first await. */
export async function tripLimitQuiet(label: string, errorText: string, now = new Date()): Promise<Date> {
  const settings = await prisma.settings.findUnique({ where: { id: 1 }, select: { maxWindowResetAt: true } }).catch(() => null);
  const { until, source } = quietUntilFor(errorText, now, settings?.maxWindowResetAt ?? null);
  const reason = `${label}: ${errorText}`.slice(0, 500);
  await prisma.agentState
    .upsert({
      where: { id: 1 },
      update: { limitQuietUntil: until, limitQuietReason: reason },
      create: { id: 1, limitQuietUntil: until, limitQuietReason: reason },
    })
    .catch((e) => console.error("[limit-quiet] state write failed", e instanceof Error ? e.message : e));
  cache = { until, at: now.getTime() };
  console.warn(`[limit-quiet] "${label}" hit the Claude limit — every Claude session skipped until ${fmtEt(until)} (${source}). ${errorText.slice(0, 200)}`);
  await announceOncePerDay(label, errorText, until, source, now);
  return until;
}

let announcedDay: string | null = null;

async function announceOncePerDay(label: string, errorText: string, until: Date, source: QuietSource, now: Date): Promise<void> {
  const day = etDateStr(now);
  if (announcedDay === day) return; // in-process guard — set BEFORE any await so parallel trips can't all pass
  announcedDay = day;
  try {
    const markerTitle = `Claude limit quiet — ${day}`; // cross-process / cross-restart guard (the token-milestone pattern)
    if ((await prisma.journalEntry.count({ where: { kind: "SYSTEM", title: markerTitle } })) > 0) return;
    const how =
      source === "message"
        ? "the reset the error named"
        : source === "window"
          ? "the next 5-hour window from the /tokens anchor"
          : "a 60-minute fallback — no reset known; set the window anchor on /tokens";
    await prisma.journalEntry.create({
      data: {
        kind: "SYSTEM",
        title: markerTitle,
        body: `"${label}" hit the shared Claude limit: ${errorText.slice(0, 300)}. Every Claude session is skipped until ${fmtEt(until)} (${how}).`,
        agentVersion: AGENT_VERSION,
      },
    });
    const family = claudeErrorFamily(errorText);
    await alert(
      "warning",
      family === "access" ? `Claude access refused — Alfred paused (needs a human)` : `Claude quota hit — Alfred paused until ${fmtEt(until)}`,
      family === "access"
        ? `"${label}" was refused by Anthropic: ${errorText.slice(0, 220)}\n\nThis is NOT a quota — it will not lift on its own. Every Claude session is skipped and re-probed once per window (next ${fmtEt(until)}) until the org setting is flipped or a new token lands in .env (CLAUDE_CODE_OAUTH_TOKEN → force-recreate agent+chat). One ping per day. The book, the guardrails and the data feeds are unaffected.`
        : `"${label}" hit the shared Claude Max limit: ${errorText.slice(0, 200)}\n\nEvery Claude session (check-ins, dossiers, race, desk, chat) is skipped until ${fmtEt(until)} — ${how}. One ping, not one per failure; if it's still walled at the reset, the pause rolls to the next window without another ping today. The book, the guardrails and the data feeds are unaffected.`,
      { category: "system" },
    );
  } catch (e) {
    console.error("[limit-quiet] announce failed", e instanceof Error ? e.message : e);
  }
}
