import { prisma } from "../lib/db";
import { AGENT_VERSION } from "./policy";
import { pushNotify, type NotifCategory } from "../lib/push/notify";

export type Severity = "info" | "warning" | "critical";

/** Routing for an alert: which notification category it belongs to (gates iOS
 *  push per-user), who triggered it (so we don't ping the actor), and the symbol
 *  it concerns (lock-screen grouping + app deep link). Default category "system". */
export type AlertOpts = { category?: NotifCategory; actorEmail?: string; symbol?: string };

// Single alerting chokepoint (AGENT-SPEC "Alerting"). Discord if configured + iOS
// push to each member's eligible devices; warning+ always lands in the journal;
// failures never take the agent down.
export async function alert(severity: Severity, title: string, body = "", opts: AlertOpts = {}): Promise<void> {
  try {
    if (severity !== "info") {
      await prisma.journalEntry.create({
        data: {
          kind: "SYSTEM",
          title: `[${severity.toUpperCase()}] ${title}`,
          body: body || title,
          agentVersion: AGENT_VERSION,
        },
      });
    }
  } catch (e) {
    console.error("alert: journal write failed", e);
  }

  await sendDiscord(severity, title, body);
  await pushNotify({
    category: opts.category ?? "system",
    severity,
    title,
    body,
    actorEmail: opts.actorEmail,
    symbol: opts.symbol,
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
        content: `${prefix} **GRQ ${severity.toUpperCase()}** — ${title}${body ? `\n${body.slice(0, 1500)}` : ""}`,
      }),
    });
  } catch (e) {
    console.error("alert: discord send failed", e);
  }
}

export async function heartbeat(fields: { bootAt?: Date; lastTickAt?: Date; lastSessionAt?: Date; note?: string }): Promise<void> {
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
