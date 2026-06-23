import { NextResponse } from "next/server";
import { memberFromRequest } from "@/lib/session";
import { unreadCountFor } from "@/lib/messages";

export const dynamic = "force-dynamic";

// Cheap unread-count poll for the inbox badge (no thread fetch). Members-only.
export async function GET(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only — read-only access." }, { status: 403 });

  return NextResponse.json({ unread: await unreadCountFor(session.email) });
}
