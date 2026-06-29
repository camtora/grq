import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { memberFromRequest, displayName } from "@/lib/session";
import { CHESS } from "@/agent/policy";

export const dynamic = "force-dynamic";

// Chess Moves (docs/CHESS-MOVES.md) — a member briefs a theme/chain to map. The web
// (alpine) can't run a Claude session, so we create a PENDING ChessTheme the agent's
// tick loop picks up and maps off-schedule. Members only (mirrors /api/hunt/refresh).
// One board at a time, and a per-ET-day cap (Opus is expensive).
export async function POST(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only." }, { status: 403 });
  if (!CHESS.enabled) return NextResponse.json({ error: "Chess Moves is currently off." }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const brief = typeof body?.brief === "string" ? body.brief.trim().slice(0, 280) : "";
  if (brief.length < 3) return NextResponse.json({ error: "Give the board a theme or chain to map." }, { status: 400 });

  // One board in flight at a time — don't pile up Opus sessions (no per-day cap, Cam 2026-06-29).
  const active = await prisma.chessTheme.count({ where: { status: { in: ["PENDING", "RUNNING"] } } });
  if (active > 0) return NextResponse.json({ ok: true, queued: false, note: "A board is already being mapped — give it a minute." });

  const theme = await prisma.chessTheme.create({
    data: { kind: "BRIEF", title: brief.slice(0, 80), anchor: brief.slice(0, 120), brief, requestedBy: displayName(session) },
  });
  return NextResponse.json({ ok: true, queued: true, id: theme.id });
}
