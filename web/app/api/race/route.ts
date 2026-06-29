import { NextResponse } from "next/server";
import { sessionFromRequest } from "@/lib/session";
import { raceResponse } from "@/lib/feed";

export const dynamic = "force-dynamic";

// Mobile read — Second Opinions (shadow-model scorecard). Any signed-in identity may read.
export async function GET(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Sign in to view this." }, { status: 403 });
  return NextResponse.json(await raceResponse());
}
