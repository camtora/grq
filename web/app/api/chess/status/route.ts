import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { memberFromRequest } from "@/lib/session";

export const dynamic = "force-dynamic";

// Status for the Chess Moves pending poller — mirrors /api/hunt/status. A briefed board
// is mapped asynchronously on the agent; the page polls this until the in-flight board
// clears (and a fresh READY one lands), then refreshes. Members only.
export async function GET(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only." }, { status: 403 });

  const [active, latestReady] = await Promise.all([
    prisma.chessTheme.findFirst({
      where: { status: { in: ["PENDING", "RUNNING"] } },
      orderBy: { createdAt: "asc" },
      select: { id: true, status: true, title: true },
    }),
    prisma.chessTheme.findFirst({ where: { status: "READY" }, orderBy: { completedAt: "desc" }, select: { id: true, completedAt: true } }),
  ]);

  return NextResponse.json({
    pending: !!active,
    activeStatus: active?.status ?? null,
    latestReadyAt: latestReady?.completedAt?.toISOString() ?? null,
  });
}
