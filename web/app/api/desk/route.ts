import { NextResponse } from "next/server";
import { sessionFromRequest } from "@/lib/session";
import { deskResponse } from "@/lib/feed";

export const dynamic = "force-dynamic";

// Mobile read — the Options Desk sandbox (stock-only vs +options). Optional ?id=<deskId>.
export async function GET(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Sign in to view this." }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  return NextResponse.json(await deskResponse(id ? Number(id) : undefined));
}
