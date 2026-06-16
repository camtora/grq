import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { memberFromRequest, displayName } from "@/lib/session";

export const dynamic = "force-dynamic";

// Add a human note to a stock — saved as a NOTE journal entry so it shows inline in
// "The record" alongside the agent's entries (Cam 2026-06-16, replaces the Research desk).
export async function POST(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only." }, { status: 403 });

  let body: { symbol?: unknown; body?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const symbol = typeof body.symbol === "string" ? body.symbol.trim().toUpperCase() : "";
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!symbol || !text) return NextResponse.json({ error: "Symbol and note text are required." }, { status: 400 });

  const who = displayName(session);
  await prisma.journalEntry.create({
    data: { kind: "NOTE", symbol, title: `Note — ${who}`, body: text.slice(0, 5000) },
  });
  return NextResponse.json({ ok: true });
}
