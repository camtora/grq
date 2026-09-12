import { NextResponse } from "next/server";
import { sessionFromRequest } from "@/lib/session";
import { meResponse } from "@/lib/feed";
import { bearerToken, refreshGrqToken } from "@/lib/auth-jwt";

// GET /api/auth/me — who am I (name + P&L for the splash greeting). Resolves the
// GRQ-JWT Bearer (or the oauth2-proxy header in a browser). docs/IOS-PLAN.md.
//
// Sliding session (D125): when the caller's Bearer is valid but over a day old, the response
// ALSO carries `token` — a fresh 30-day GRQ-JWT the app swaps into its keychain. Additive on the
// wire (MeResponse.token is optional); builds that predate it ignore the field and keep working.
// A browser (oauth2-proxy cookie, no Bearer) never gets one.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const me = await meResponse(session);
  const fresh = refreshGrqToken(bearerToken(req));
  return NextResponse.json(fresh ? { ...me, token: fresh } : me);
}
