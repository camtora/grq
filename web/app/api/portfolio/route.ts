import { NextResponse } from "next/server";
import { sessionFromRequest } from "@/lib/session";
import { portfolioResponse } from "@/lib/feed";

// Mobile read endpoint (docs/IOS-PLAN.md). Self-guards: any valid identity
// (oauth2-proxy header OR a verified GRQ-JWT Bearer) may read; no identity → 403.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Sign in to view this fund." }, { status: 403 });
  return NextResponse.json(await portfolioResponse());
}
