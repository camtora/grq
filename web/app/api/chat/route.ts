import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { memberFromRequest } from "@/lib/session";

export const dynamic = "force-dynamic";

const CHAT_URL = process.env.CHAT_URL ?? "http://chat:3014";

export async function GET(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only — chat is members-only." }, { status: 403 });
  const messages = await prisma.chatMessage.findMany({ orderBy: { at: "desc" }, take: 50 });
  return NextResponse.json({ messages: messages.reverse() });
}

export async function POST(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only — chat is members-only." }, { status: 403 });

  let body: { message?: unknown; symbol?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (typeof body.message !== "string" || body.message.trim().length === 0) {
    return NextResponse.json({ error: "message required." }, { status: 400 });
  }

  const upstream = await fetch(`${CHAT_URL}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: session.email,
      message: body.message,
      symbol: typeof body.symbol === "string" ? body.symbol : undefined,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "Chat service unavailable." }, { status: 502 });
  }
  return new Response(upstream.body, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
  });
}
