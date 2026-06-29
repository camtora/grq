import { NextResponse } from "next/server";
import { sessionFromRequest } from "@/lib/session";
import { chessBoardResponse } from "@/lib/feed";

export const dynamic = "force-dynamic";

// Mobile read — one Chess Moves board (the chain map + heat-ranked plays + levers).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Sign in to view this." }, { status: 403 });
  const { id } = await params;
  const board = await chessBoardResponse(Number(id));
  if (!board) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json(board);
}
