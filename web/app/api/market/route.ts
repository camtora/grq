import { NextResponse } from "next/server";
import { sessionFromRequest } from "@/lib/session";
import { marketResponse } from "@/lib/feed";

// Mobile read endpoint (docs/IOS-PLAN.md). Universe = the investable set (ACTIVE);
// watchlist = research candidates. Same Prisma source as the web Market pages.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Sign in to view this fund." }, { status: 403 });
  return NextResponse.json(await marketResponse());
}
