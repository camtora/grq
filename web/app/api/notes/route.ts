import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { memberFromRequest, displayName } from "@/lib/session";

export const dynamic = "force-dynamic";

// Human research notes (members only). The Research tab is for human research.
export async function POST(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only." }, { status: 403 });

  let body: { body?: unknown; symbol?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!text || text.length > 8000) return NextResponse.json({ error: "Note body required (≤8000 chars)." }, { status: 400 });
  const symbol = typeof body.symbol === "string" && body.symbol.trim() ? body.symbol.trim().toUpperCase().slice(0, 12) : null;

  const note = await prisma.note.create({ data: { author: displayName(session), symbol, body: text } });
  return NextResponse.json({ ok: true, id: note.id });
}
