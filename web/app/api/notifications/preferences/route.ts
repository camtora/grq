import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { memberFromRequest } from "@/lib/session";
import { TOGGLEABLE_CATEGORIES, prefsFromRow, type NotificationPrefs } from "@/lib/push/categories";

export const dynamic = "force-dynamic";

// Per-user notification toggles (docs/PUSH-NOTIFICATIONS.md). GET returns the
// member's toggles (all-on if they've never saved). PUT updates any subset. Both
// the web Settings page (cookie) and the iOS settings screen (Bearer) call these.
// trades/risk aren't here — they're force-on in code.

export async function GET(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only." }, { status: 403 });

  const row = await prisma.notificationPreference.findUnique({ where: { email: session.email } });
  // `messages` is always-on (forced in notify.ts) and no longer a toggle, but we keep it
  // on the wire = true so older iOS builds (whose Codable struct still expects it) decode.
  return NextResponse.json({ ...prefsFromRow(row), messages: true });
}

export async function PUT(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only." }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  // Accept only the known boolean keys; ignore anything else.
  const patch: Partial<NotificationPrefs> = {};
  for (const { key } of TOGGLEABLE_CATEGORIES) {
    if (typeof body[key] === "boolean") patch[key] = body[key] as boolean;
  }

  const row = await prisma.notificationPreference.upsert({
    where: { email: session.email },
    update: patch,
    create: { email: session.email, ...patch },
  });

  // `messages` is always-on (forced in notify.ts) and no longer a toggle, but we keep it
  // on the wire = true so older iOS builds (whose Codable struct still expects it) decode.
  return NextResponse.json({ ...prefsFromRow(row), messages: true });
}
