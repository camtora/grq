import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { memberFromRequest } from "@/lib/session";
import { isMember } from "@/lib/users";

export const dynamic = "force-dynamic";

const CHAT_URL = process.env.CHAT_URL ?? "http://chat:3014";

// Resolve which member's thread to act on: the requested owner if it's a member,
// else the caller's own thread. A two-person fund — members can read and post in
// either thread (toggle into each other's); authorship is always the caller.
function resolveOwner(requested: string | null | undefined, selfEmail: string): string {
  const o = requested?.trim().toLowerCase();
  return o && isMember(o) ? o : selfEmail;
}

export async function GET(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only — chat is members-only." }, { status: 403 });
  const owner = resolveOwner(new URL(req.url).searchParams.get("owner"), session.email);
  const messages = await prisma.chatMessage.findMany({ where: { owner }, orderBy: { at: "desc" }, take: 50 });
  return NextResponse.json({ owner, messages: messages.reverse() });
}

export async function POST(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only — chat is members-only." }, { status: 403 });

  let body: { message?: unknown; symbol?: unknown; owner?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (typeof body.message !== "string" || body.message.trim().length === 0) {
    return NextResponse.json({ error: "message required." }, { status: 400 });
  }
  const owner = resolveOwner(typeof body.owner === "string" ? body.owner : null, session.email);

  const upstream = await fetch(`${CHAT_URL}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      owner,
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
