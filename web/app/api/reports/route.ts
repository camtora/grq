import { NextResponse } from "next/server";
import { sessionFromRequest } from "@/lib/session";
import { reportsResponse } from "@/lib/feed";

// Mobile read endpoint (A10) — the list of filed reports (EOD / weekly). The full body
// of a daily report is at /api/reports/day/[date].
export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Sign in to view this fund." }, { status: 403 });
  return NextResponse.json(await reportsResponse());
}
