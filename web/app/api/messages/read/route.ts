import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { memberFromRequest } from "@/lib/session";
import { pushBadgeSync } from "@/lib/push/notify";
import { notifyMessagesChanged } from "@/lib/messages-live";

export const dynamic = "force-dynamic";

// Mark every message addressed to the caller as read (they opened the thread). Drives
// the inbox badge back to zero, and re-syncs the phone's app-icon badge to whatever
// is still unread — reading on one surface clears the other. Members-only.
export async function POST(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only — read-only access." }, { status: 403 });

  await prisma.directMessage.updateMany({
    where: { toEmail: session.email, readAt: null },
    data: { readAt: new Date() },
  });

  void pushBadgeSync(session.email); // best-effort; don't block the response on APNs
  notifyMessagesChanged([session.email]); // clear the badge in their other open tabs too
  return NextResponse.json({ ok: true, unread: 0 });
}
