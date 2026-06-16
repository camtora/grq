import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { memberFromRequest, displayName } from "@/lib/session";

export const dynamic = "force-dynamic";

// Refresh the discovery hunt on demand (Graham 2026-06-16). The web (alpine) can't
// run a Claude session — only the agent (debian) can — so we set a flag the agent's
// tick loop picks up and runs the hunt off-schedule.
export async function POST(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only." }, { status: 403 });

  const state = await prisma.agentState.findUnique({ where: { id: 1 } });
  if (state?.huntRequestedAt) {
    return NextResponse.json({ ok: true, queued: false, note: "A hunt refresh is already queued." });
  }
  const who = displayName(session);
  await prisma.agentState.upsert({
    where: { id: 1 },
    create: { id: 1, huntRequestedAt: new Date(), huntRequestedBy: who },
    update: { huntRequestedAt: new Date(), huntRequestedBy: who },
  });
  return NextResponse.json({ ok: true, queued: true });
}
