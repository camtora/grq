import { NextResponse } from "next/server";
import { sessionFromRequest } from "@/lib/session";
import { smartMoneyResponse } from "@/lib/feed";

// Mobile read endpoint (A3) — Smart Money: tracked 13F portfolios, congress/fund/insider
// leaderboards, cluster buys, GRQ's read. Same Prisma source as the web Smart Money page.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Sign in to view this fund." }, { status: 403 });
  return NextResponse.json(await smartMoneyResponse());
}
