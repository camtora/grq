import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { memberFromRequest } from "@/lib/session";

export const dynamic = "force-dynamic";

// Mark every message addressed to the caller as read (they opened the thread). Drives
// the inbox badge back to zero. Members-only.
export async function POST(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only — read-only access." }, { status: 403 });

  await prisma.directMessage.updateMany({
    where: { toEmail: session.email, readAt: null },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ ok: true, unread: 0 });
}
