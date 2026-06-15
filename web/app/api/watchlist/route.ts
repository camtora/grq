import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { memberFromRequest } from "@/lib/session";

export const dynamic = "force-dynamic";

// Human watchlist toggle (members only). The watchlist holds ANY ticker — it
// doesn't have to be in the agent's tradeable universe. Add from anywhere
// (market, search, suggestions); promote to the universe later when you want
// the agent to be able to trade it.
export async function POST(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only." }, { status: 403 });

  let body: { symbol?: unknown; action?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const symbol = typeof body.symbol === "string" ? body.symbol.trim().toUpperCase().slice(0, 12) : "";
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  if (body.action === "remove") {
    await prisma.watchlist.deleteMany({ where: { symbol } });
    return NextResponse.json({ ok: true, watched: false });
  }
  await prisma.watchlist.upsert({ where: { symbol }, create: { symbol }, update: {} });
  return NextResponse.json({ ok: true, watched: true });
}
