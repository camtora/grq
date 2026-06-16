import { NextResponse } from "next/server";
import { roleForEmail, userForEmail } from "@/lib/users";
import { signGrqToken, jwtConfigured } from "@/lib/auth-jwt";
import { meResponse } from "@/lib/feed";
import type { Session } from "@/lib/session";

// POST /api/auth/dev — LOCAL-ONLY escape hatch (docs/IOS-PLAN.md). Mints a GRQ-JWT
// for a member email WITHOUT Google, so the app can be exercised before the
// GRQ-iOS OAuth client exists. Disabled unless GRQ_DEV_LOGIN=1 — NEVER set in
// production. Returns 404 when off so it's invisible.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (process.env.GRQ_DEV_LOGIN !== "1") return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!jwtConfigured()) return NextResponse.json({ error: "Auth not configured (GRQ_JWT_SECRET)." }, { status: 503 });

  let body: { email?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) return NextResponse.json({ error: "email required." }, { status: 400 });
  if (roleForEmail(email) !== "member") return NextResponse.json({ error: "Members only." }, { status: 403 });

  const session: Session = { email, user: userForEmail(email), role: "member" };
  return NextResponse.json({ token: signGrqToken(email), me: await meResponse(session) });
}
