import { NextResponse } from "next/server";
import { sessionFromRequest } from "@/lib/session";
import { ideasResponse } from "@/lib/feed";

// Mobile read endpoint (docs/IOS-PLAN.md): the agent's dossier'd ideas with
// price targets, unfamiliar names first. Same source as Today's "On the Radar".
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Sign in to view this fund." }, { status: 403 });
  return NextResponse.json(await ideasResponse());
}
