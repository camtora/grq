import { NextResponse } from "next/server";
import { sessionFromRequest } from "@/lib/session";
import { huntResponse } from "@/lib/feed";

// Mobile read endpoint (A1) — The Hunt feed: under-the-radar leads, obscurity-first,
// with the active directed-hunt brief. The on-demand refresh is POST /api/hunt/refresh.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Sign in to view this fund." }, { status: 403 });
  return NextResponse.json(await huntResponse());
}
