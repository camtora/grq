import { NextResponse } from "next/server";
import { sessionFromRequest } from "@/lib/session";
import { todayResponse } from "@/lib/feed";

// Mobile read endpoint (docs/IOS-PLAN.md): The Daily — edition is computed live
// (morning/midday/evening/weekend in ET), NAV/tape/movers from today's data.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Sign in to view this fund." }, { status: 403 });
  return NextResponse.json(await todayResponse());
}
