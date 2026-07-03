import { NextResponse } from "next/server";
import { sessionFromRequest } from "@/lib/session";
import { watchlistResponse } from "@/lib/feed";

// GET /api/watchlist — the watch-driven list (D78) for GRQ Go's Watchlist page.
// Read-only; any signed-in session may read (viewers included), like the web page.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Sign in to view this fund." }, { status: 403 });
  return NextResponse.json(await watchlistResponse());
}
