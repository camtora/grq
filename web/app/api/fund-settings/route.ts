import { NextResponse } from "next/server";
import { sessionFromRequest } from "@/lib/session";
import { settingsResponse } from "@/lib/feed";

// Mobile read of the dials + soak gate (docs/IOS-PLAN.md). Separate path from the
// browser's PUT /api/settings so this one can sit in the nginx mobile bypass
// (oauth2-proxy-free, Bearer self-guarded) without touching the dashboard's save.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Sign in to view this fund." }, { status: 403 });
  return NextResponse.json(await settingsResponse());
}
