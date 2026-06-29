import { NextResponse } from "next/server";
import { sessionFromRequest } from "@/lib/session";
import { reportCardResponse } from "@/lib/feed";

export const dynamic = "force-dynamic";

// Mobile read — the Report Card (how GRQ's calls actually did). Any signed-in identity.
export async function GET(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Sign in to view this." }, { status: 403 });
  return NextResponse.json(await reportCardResponse());
}
