import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sessionFromRequest } from "@/lib/session";
import { isMember } from "@/lib/users";

export const dynamic = "force-dynamic";

const CHAT_URL = process.env.CHAT_URL ?? "http://chat:3014";

// Resolve whose thread to act on. MEMBERS (the two-person fund) can read/post in
// either member's thread (toggle into each other's); authorship is always the
// caller. VIEWERS (read-only allowlisted users) get their OWN isolated thread and
// can NEVER address a member's — so for them the owner is always themselves.
function resolveOwner(requested: string | null | undefined, selfEmail: string, callerIsMember: boolean): string {
  if (!callerIsMember) return selfEmail;
  const o = requested?.trim().toLowerCase();
  return o && isMember(o) ? o : selfEmail;
}

export async function GET(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Sign in to use the chat." }, { status: 403 });
  const callerIsMember = session.role === "member";
  const owner = resolveOwner(new URL(req.url).searchParams.get("owner"), session.email, callerIsMember);
  const messages = await prisma.chatMessage.findMany({ where: { owner }, orderBy: { at: "desc" }, take: 50 });
  return NextResponse.json({ owner, messages: messages.reverse() });
}

export async function POST(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Sign in to use the chat." }, { status: 403 });
  const callerIsMember = session.role === "member";

  let body: { message?: unknown; symbol?: unknown; owner?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (typeof body.message !== "string" || body.message.trim().length === 0) {
    return NextResponse.json({ error: "message required." }, { status: 400 });
  }
  const owner = resolveOwner(typeof body.owner === "string" ? body.owner : null, session.email, callerIsMember);

  // Log what VIEWERS ask Alfred (surfaced on the owner-only Traffic page). Members
  // chat in their own persisted threads; this is just the read-only-audience view.
  if (!callerIsMember) {
    await prisma.viewerQuestion
      .create({
        data: {
          email: session.email,
          message: body.message.trim().slice(0, 2000),
          symbol: typeof body.symbol === "string" ? body.symbol.slice(0, 16) : null,
        },
      })
      .catch(() => {});
  }

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
