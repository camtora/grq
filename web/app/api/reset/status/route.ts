import { NextResponse } from "next/server";
import { memberFromRequest } from "@/lib/session";
import { resetStatus } from "@/lib/reset-run";

export const dynamic = "force-dynamic";

// The reset rehearsal's live state (D138): what is held, what has been sold tagged, the pause, the
// kill switch, and whether a flatten may start. Members only — it is an operating control.
export async function GET(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only." }, { status: 403 });
  return NextResponse.json(await resetStatus());
}
