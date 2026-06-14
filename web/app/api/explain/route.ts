import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sessionFromRequest } from "@/lib/session";

export const dynamic = "force-dynamic";

const CHAT_URL = process.env.CHAT_URL ?? "http://chat:3014";

// On-demand concept explainer (the literacy pillar). Cached by normalized term:
// the first click pays the agent call, everyone after gets it instantly + free.
export async function POST(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Not a member." }, { status: 403 });

  let body: { term?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const term = typeof body.term === "string" ? body.term.trim() : "";
  if (!term || term.length > 120) return NextResponse.json({ error: "term required" }, { status: 400 });
  const key = term.toLowerCase().replace(/\s+/g, " ");

  const cached = await prisma.explainer.findUnique({ where: { key } });
  if (cached) return NextResponse.json({ term: cached.term, body: cached.body, cached: true });

  try {
    const upstream = await fetch(`${CHAT_URL}/explain`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ term }),
    });
    if (!upstream.ok) return NextResponse.json({ error: "explainer unavailable" }, { status: 502 });
    const data = (await upstream.json()) as { body?: string };
    const text = (data.body ?? "").trim();
    if (!text) return NextResponse.json({ error: "no explanation" }, { status: 502 });
    await prisma.explainer.upsert({ where: { key }, create: { key, term, body: text }, update: { body: text, term } });
    return NextResponse.json({ term, body: text });
  } catch {
    return NextResponse.json({ error: "explainer error" }, { status: 502 });
  }
}
