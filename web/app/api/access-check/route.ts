import { NextResponse } from "next/server";
import { sessionFromRequest } from "@/lib/session";
import { prisma } from "@/lib/db";
import { sanitize, emptyData } from "@/lib/access-check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The access check's own results (D135). ANY signed-in tier may call this, a USER included —
// that is the point: a user's browser reports what it could and couldn't reach. It can only
// ever read and write the CALLER's own row (the email comes from the session, never the body),
// and the body is clamped to the known check ids (lib/access-check.ts sanitize). Everyone's
// results are read by the page for Cam alone, not through this route.

export async function GET(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Sign in." }, { status: 403 });
  const row = await prisma.accessCheck.findUnique({ where: { email: session.email } });
  let data = emptyData();
  try {
    if (row) data = sanitize(JSON.parse(row.dataJson));
  } catch {
    /* unreadable row → start clean */
  }
  return NextResponse.json({ role: session.role, data, doneAt: row?.doneAt?.toISOString() ?? null });
}

export async function POST(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Sign in." }, { status: 403 });
  let body: { data?: unknown; done?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const data = sanitize(body.data);
  const dataJson = JSON.stringify(data);
  const done = body.done === true;
  const row = await prisma.accessCheck.upsert({
    where: { email: session.email },
    create: { email: session.email, role: session.role, dataJson, doneAt: done ? new Date() : null },
    update: { role: session.role, dataJson, ...(done ? { doneAt: new Date() } : {}) },
  });
  return NextResponse.json({ ok: true, doneAt: row.doneAt?.toISOString() ?? null });
}
