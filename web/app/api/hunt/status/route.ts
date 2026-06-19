import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { memberFromRequest } from "@/lib/session";

export const dynamic = "force-dynamic";

// Lightweight status for The Hunt's pending/stale poller. A briefed (or refreshed) hunt
// runs asynchronously on the agent — the runner clears `huntRequestedAt` at the START of
// the run, well before results land, so the page can't trust that flag alone to know
// results are ready. Instead the poller anchors on `latestFindAt`: when the newest
// "Hunt dossier" timestamp advances past the time the member submitted, fresh names have
// landed and the page refreshes. Members only (mirrors /api/hunt/refresh).
export async function GET(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only." }, { status: 403 });

  const [state, latest, finds] = await Promise.all([
    prisma.agentState.findUnique({ where: { id: 1 }, select: { huntRequestedAt: true, huntBrief: true } }),
    prisma.journalEntry.findFirst({
      where: { kind: "RESEARCH", title: { startsWith: "Hunt dossier" }, symbol: { not: null } },
      orderBy: { at: "desc" },
      select: { at: true },
    }),
    prisma.journalEntry.count({ where: { kind: "RESEARCH", title: { startsWith: "Hunt dossier" }, symbol: { not: null } } }),
  ]);

  return NextResponse.json({
    requestedAt: state?.huntRequestedAt?.toISOString() ?? null,
    brief: state?.huntBrief ?? null,
    latestFindAt: latest?.at?.toISOString() ?? null,
    finds,
  });
}
