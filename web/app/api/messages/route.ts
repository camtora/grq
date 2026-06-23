import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { memberFromRequest, displayName } from "@/lib/session";
import { otherMemberEmail } from "@/lib/users";
import { createDirectMessage, serializeMessage, unreadCountFor } from "@/lib/messages";

export const dynamic = "force-dynamic";

// The Cam↔Graham direct-message thread (D61). Members-only. GET returns the thread
// (newest 100, chronological) + the caller's unread count; pass ?since=<id> to fetch
// only newer rows (the open thread polls this). POST sends a message or a share
// ({ body?, symbol?, panel? }) to the OTHER member and pushes them.

export async function GET(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only — read-only access." }, { status: 403 });

  const email = session.email;
  const sinceRaw = new URL(req.url).searchParams.get("since");
  const since = sinceRaw && /^\d+$/.test(sinceRaw) ? Number(sinceRaw) : null;

  const mine = { OR: [{ fromEmail: email }, { toEmail: email }] };
  const where = since ? { AND: [mine, { id: { gt: since } }] } : mine;

  const rows = since
    ? await prisma.directMessage.findMany({ where, orderBy: { id: "asc" }, take: 200 })
    : (await prisma.directMessage.findMany({ where, orderBy: { id: "desc" }, take: 100 })).reverse();

  const unread = await unreadCountFor(email);
  return NextResponse.json({ messages: rows.map((m) => serializeMessage(m, email)), unread });
}

export async function POST(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only — read-only access." }, { status: 403 });

  let body: { body?: unknown; symbol?: unknown; panel?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const recipient = otherMemberEmail(session.email);
  if (!recipient) {
    return NextResponse.json({ error: "No other member to message." }, { status: 400 });
  }

  const text = typeof body.body === "string" ? body.body.trim() : "";
  const symbol = typeof body.symbol === "string" ? body.symbol.trim() : "";
  if (!text && !symbol) {
    return NextResponse.json({ error: "Type a message or attach a stock." }, { status: 400 });
  }
  if (symbol && symbol.length > 20) {
    return NextResponse.json({ error: "That doesn't look like a stock symbol." }, { status: 400 });
  }

  const msg = await createDirectMessage({
    fromEmail: session.email,
    fromName: displayName(session),
    toEmail: recipient,
    body: text,
    symbol: symbol || null,
    panel: typeof body.panel === "string" ? body.panel : null,
  });

  return NextResponse.json({ ok: true, message: serializeMessage(msg, session.email) });
}
