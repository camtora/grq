import { NextResponse } from "next/server";
import { sessionFromRequest } from "@/lib/session";
import { raceDayResponse } from "@/lib/feed";

export const dynamic = "force-dynamic";

// Mobile read — one race day (Second Opinions): day standings + the session call matrix,
// the web's /race/[date]. Any signed-in identity may read.
export async function GET(req: Request, { params }: { params: Promise<{ date: string }> }) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Sign in to view this." }, { status: 403 });
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Bad date." }, { status: 400 });
  return NextResponse.json(await raceDayResponse(date));
}
