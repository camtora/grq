import { NextResponse } from "next/server";
import { memberFromRequest } from "@/lib/session";
import { syncMemberIfConnected } from "@/lib/external/store";

export const dynamic = "force-dynamic";

/** Pull the caller's connected accounts/holdings from SnapTrade into the DB (read
 *  only). No-ops if the caller hasn't connected. Members-only; self only. */
export async function POST(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only — read-only access." }, { status: 403 });
  try {
    const result = await syncMemberIfConnected(session.email);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't refresh your accounts." },
      { status: 502 },
    );
  }
}
