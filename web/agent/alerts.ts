import { prisma } from "../lib/db";
import { AGENT_VERSION } from "./policy";
import { pushNotify, type NotifCategory } from "../lib/push/notify";

export type Severity = "info" | "warning" | "critical";

/** Routing for an alert: which notification category it belongs to (gates iOS
 *  push per-user), who triggered it (so we don't ping the actor), the symbol
 *  it concerns (lock-screen grouping + app deep link), and an optional explicit
 *  in-app destination (for the coarse "hunt" family — see lib/push/notify.ts).
 *  Default category "system". */
export type AlertOpts = { category?: NotifCategory; actorEmail?: string; symbol?: string; dest?: string };

// Single alerting chokepoint (AGENT-SPEC "Alerting"). Discord if configured + iOS
// push to each member's eligible devices; warning+ always lands in the journal;
// failures never take the agent down.
// Verbatim-repeat window (D124, 2026-09-12). A warning/critical whose title AND body already
// went out within this window is a retry loop reporting the same failure again — not news. The
// journal row is still written (the record stays honest); only Discord + push are held. This is
// the CLASS fix for every "scheduled thing fails instantly and is retried every tick" shape —
// the race/desk storm (D123, 92 pushes), then the Saturday weekly review (23 pushes in 2h) the
// morning after — without having to find and gate each scheduler individually.
const REPEAT_WINDOW_MS = 30 * 60_000;

export async function alert(severity: Severity, title: string, body = "", opts: AlertOpts = {}): Promise<void> {
  let repeat = false;
  try {
    if (severity !== "info") {
      const journalTitle = `[${severity.toUpperCase()}] ${title}`;
      const journalBody = body || title;
      repeat =
        (await prisma.journalEntry.count({
          where: { kind: "SYSTEM", title: journalTitle, body: journalBody, at: { gte: new Date(Date.now() - REPEAT_WINDOW_MS) } },
        })) > 0;
      await prisma.journalEntry.create({
        data: { kind: "SYSTEM", title: journalTitle, body: journalBody, agentVersion: AGENT_VERSION },
      });
    }
  } catch (e) {
    console.error("alert: journal write failed", e);
  }
  if (repeat) {
    console.warn(`[alert] held — verbatim repeat within ${REPEAT_WINDOW_MS / 60_000} min: ${title}`);
    return;
  }

  await sendDiscord(severity, title, body);
  await pushNotify({
    category: opts.category ?? "system",
    severity,
    title,
    body,
    actorEmail: opts.actorEmail,
    symbol: opts.symbol,
    dest: opts.dest,
  });
}

/** Discord + iOS push, WITHOUT a journal write — for callers that journal
 *  themselves (the kill-switch / universe / directive routes, agent self-promotion).
 *  Same routing opts as alert(); default category "system". */
export async function notifyOut(severity: Severity, title: string, body = "", opts: AlertOpts = {}): Promise<void> {
  await sendDiscord(severity, title, body);
  await pushNotify({
    category: opts.category ?? "system",
    severity,
    title,
    body,
    actorEmail: opts.actorEmail,
    symbol: opts.symbol,
    dest: opts.dest,
  });
}

/** Discord-only delivery — the low-level webhook send. Most callers want
 *  alert() (journals + push) or notifyOut() (push, no journal) instead. */
export async function sendDiscord(severity: Severity, title: string, body = ""): Promise<void> {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;
  try {
    const prefix = severity === "critical" ? "🚨 @here" : severity === "warning" ? "⚠️" : "💹";
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: `${prefix} **Alfred · ${severity.toUpperCase()}** — ${title}${body ? `\n${body.slice(0, 1500)}` : ""}`,
      }),
    });
  } catch (e) {
    console.error("alert: discord send failed", e);
  }
}

export async function heartbeat(fields: { bootAt?: Date; lastTickAt?: Date; lastSessionAt?: Date; note?: string; brokerReachable?: boolean; brokerCheckedAt?: Date }): Promise<void> {
  try {
    await prisma.agentState.upsert({
      where: { id: 1 },
      create: { id: 1, ...fields },
      update: fields,
    });
  } catch (e) {
    console.error("heartbeat failed", e);
  }
}
