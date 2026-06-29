import { NextResponse } from "next/server";
import { memberFromRequest } from "@/lib/session";
import { queueHuntDossier } from "@/lib/hunt";

export const dynamic = "force-dynamic";

// Kick a full dossier for a Chess Moves play (a lead → research → §6 gate, D46). Reuses
// the hunt's idempotent queue: tracked names already have their own research flow, an
// untracked play queues a runStockDossier pass. Members only.
export async function POST(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const symbol = typeof body?.symbol === "string" ? body.symbol.trim() : "";
  if (!symbol) return NextResponse.json({ error: "Missing symbol." }, { status: 400 });

  const result = await queueHuntDossier(symbol);
  return NextResponse.json({ ok: true, result });
}
