import { NextResponse } from "next/server";
import { memberFromRequest } from "@/lib/session";
import { recentFor, serializeNotification, unreadNotificationCount } from "@/lib/notifications";

export const dynamic = "force-dynamic";

// The header bell's feed (D63). Members-only. GET returns the caller's recent
// notifications (newest first) + their unread count. The bell polls this; opening
// it marks everything read via POST /api/notifications/read.
export async function GET(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only — read-only access." }, { status: 403 });

  const [rows, unread] = await Promise.all([
    recentFor(session.email),
    unreadNotificationCount(session.email),
  ]);
  return NextResponse.json({ notifications: rows.map(serializeNotification), unread });
}
