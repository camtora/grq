import { NextResponse } from "next/server";
import { sessionFromRequest } from "@/lib/session";
import { briefingsResponse } from "@/lib/feed";

// GET /api/briefings — Alfred's desk printouts for GRQ Go's Portfolio (pre-market
// read, morning plan, fund-level check-ins, midday, EOD, weekly). Read-only; any
// signed-in session may read, like the web Portfolio's briefing slot.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Sign in to view this fund." }, { status: 403 });
  return NextResponse.json(await briefingsResponse());
}
