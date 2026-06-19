import { NextResponse } from "next/server";
import { sessionFromRequest } from "@/lib/session";
import { reportDayResponse } from "@/lib/feed";

// Mobile read endpoint (A10) — the full EOD report for a given ET calendar day.
export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET(req: Request, { params }: { params: Promise<{ date: string }> }) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Sign in to view this fund." }, { status: 403 });
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Invalid date." }, { status: 400 });
  const report = await reportDayResponse(date);
  if (!report) return NextResponse.json({ error: "No report for that day." }, { status: 404 });
  return NextResponse.json(report);
}
