import { NextResponse } from "next/server";
import { sessionFromRequest } from "@/lib/session";
import { meResponse } from "@/lib/feed";

// GET /api/auth/me — who am I (name + P&L for the splash greeting). Resolves the
// GRQ-JWT Bearer (or the oauth2-proxy header in a browser). docs/IOS-PLAN.md.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.json(await meResponse(session));
}
