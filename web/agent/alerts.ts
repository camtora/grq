import { prisma } from "../lib/db";
import { AGENT_VERSION } from "./policy";

export type Severity = "info" | "warning" | "critical";

// Single alerting chokepoint (AGENT-SPEC "Alerting"). Discord if configured;
// warning+ always lands in the journal; failures never take the agent down.
export async function alert(severity: Severity, title: string, body = ""): Promise<void> {
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
