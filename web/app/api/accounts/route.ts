import { NextResponse } from "next/server";
import { memberFromRequest } from "@/lib/session";
import { accountsResponse } from "@/lib/feed";

// Mobile read endpoint for the personal/external accounts (SnapTrade — TD TFSA etc.),
// mirroring the web /accounts page. MEMBERS ONLY (the web page gates the same way —
// personal holdings are visible to fund members, not read-only viewers). Visibility only.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only." }, { status: 403 });
  return NextResponse.json(await accountsResponse(session.email));
}
