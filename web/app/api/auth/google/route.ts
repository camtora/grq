import { NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { roleForEmail, userForEmail } from "@/lib/users";
import { signGrqToken, jwtConfigured } from "@/lib/auth-jwt";
import { meResponse } from "@/lib/feed";
import type { Session } from "@/lib/session";

// POST /api/auth/google — the mobile login (docs/IOS-PLAN.md). The app sends a
// Google ID token; we verify it CRYPTOGRAPHICALLY (never trust a decoded token)
// against the GRQ-iOS OAuth client, enforce members-only (oauth2-proxy's allowlist
// is bypassed on this path, so GRQ enforces it itself), and trade it for a GRQ-JWT.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!jwtConfigured()) return NextResponse.json({ error: "Auth not configured (GRQ_JWT_SECRET)." }, { status: 503 });
  const clientId = process.env.GRQ_IOS_GOOGLE_CLIENT_ID;
  if (!clientId) return NextResponse.json({ error: "Google sign-in not configured (GRQ_IOS_GOOGLE_CLIENT_ID)." }, { status: 503 });

  let body: { idToken?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (typeof body.idToken !== "string" || !body.idToken) {
    return NextResponse.json({ error: "idToken required." }, { status: 400 });
  }

  let email: string | null = null;
  try {
    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({ idToken: body.idToken, audience: clientId });
    const payload = ticket.getPayload();
    if (payload?.email && payload.email_verified) email = payload.email.toLowerCase();
  } catch {
    return NextResponse.json({ error: "Invalid Google token." }, { status: 401 });
  }
  if (!email) return NextResponse.json({ error: "Google token has no verified email." }, { status: 401 });

  if (roleForEmail(email) !== "member") {
    return NextResponse.json({ error: "The GRQ app is members-only." }, { status: 403 });
  }

  const session: Session = { email, user: userForEmail(email), role: "member" };
  return NextResponse.json({ token: signGrqToken(email), me: await meResponse(session) });
}
