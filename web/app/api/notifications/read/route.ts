import { NextResponse } from "next/server";
import { memberFromRequest } from "@/lib/session";
import { markNotificationsRead } from "@/lib/notifications";

export const dynamic = "force-dynamic";

// Mark the caller's notifications read (the bell was opened). Pass { ids: number[] }
// to read a specific set, or no body to clear them all. Members-only.
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
  return NextResponse.json({ ok: true, unread: 0 });
}
