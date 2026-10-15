import { NextResponse } from "next/server";
import { sessionFromRequest } from "@/lib/session";
import { prisma } from "@/lib/db";
import { TERMS_VERSION, TERMS_COOKIE, termsCookieValue, termsCookieOptions } from "@/lib/terms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Accept the terms (D136). Any signed-in tier may call it, a USER above all — that is who the
// gate is for, and the door admits this one route before acceptance. It writes only the
// CALLER's own row (the email comes from the session, never the body), for the CURRENT
// version, then sets the signed cookie the door reads. Idempotent: a second click, or the
// re-issue from a new device, finds the row and just refreshes the cookie.
export async function POST(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Sign in." }, { status: 403 });
  const h = req.headers;
  const row = await prisma.termsAcceptance.upsert({
    where: { email_version: { email: session.email, version: TERMS_VERSION } },
    create: {
      email: session.email,
      version: TERMS_VERSION,
      ip: (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null,
      userAgent: h.get("user-agent")?.slice(0, 500) || null,
    },
    update: {},
  });
  const value = termsCookieValue(session.email);
  if (!value) return NextResponse.json({ error: "The server can't sign the acceptance (no GRQ_JWT_SECRET)." }, { status: 500 });
  const res = NextResponse.json({ ok: true, version: TERMS_VERSION, at: row.at.toISOString() });
  res.cookies.set(TERMS_COOKIE, value, termsCookieOptions());
  return res;
}
