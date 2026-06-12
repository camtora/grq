import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const [agent, settings] = await Promise.all([
    prisma.agentState.findUnique({ where: { id: 1 } }).catch(() => null),
    prisma.settings.findUnique({ where: { id: 1 } }).catch(() => null),
  ]);
  const now = Date.now();
  return NextResponse.json({
    status: "ok",
    service: "grq-web",
    phase: 2,
    broker: process.env.BROKER ?? "sim",
    killSwitch: settings?.killSwitch ?? null,
    agent: agent
      ? {
          bootAt: agent.bootAt,
          lastTickAt: agent.lastTickAt,
          lastSessionAt: agent.lastSessionAt,
          tickAgeSeconds: agent.lastTickAt ? Math.round((now - agent.lastTickAt.getTime()) / 1000) : null,
          note: agent.note,
        }
      : null,
    time: new Date().toISOString(),
  });
}
