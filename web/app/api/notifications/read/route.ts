import { NextResponse } from "next/server";
import { memberFromRequest } from "@/lib/session";
import { markNotificationsRead } from "@/lib/notifications";
import { pushClear } from "@/lib/push/notify";

export const dynamic = "force-dynamic";

// Mark the caller's notifications read (the bell was opened). Pass { ids: number[] }
// to read a specific set, or no body to clear them all. Members-only. Opening the
// bell also fires a silent push (D64) telling the member's phone to clear its
// delivered notifications — triage on the desktop, the lock screen follows.
export async function POST(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only — read-only access." }, { status: 403 });

  let ids: number[] | undefined;
  try {
    const body = (await req.json()) as { ids?: unknown };
    if (Array.isArray(body.ids)) ids = body.ids.filter((n): n is number => typeof n === "number");
  } catch {
    /* no body → mark all read */
  }

  await markNotificationsRead(session.email, ids);
  void pushClear(session.email); // best-effort; don't block the response on APNs
  return NextResponse.json({ ok: true, unread: 0 });
}
