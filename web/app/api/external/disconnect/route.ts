import { NextResponse } from "next/server";
import { memberFromRequest } from "@/lib/session";
import { disconnectMember } from "@/lib/external/store";

export const dynamic = "force-dynamic";

/** Unlink the caller's external accounts: deletes their SnapTrade user + all local
 *  external data. Members-only; self only. */
export async function POST(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only — read-only access." }, { status: 403 });
  try {
    await disconnectMember(session.email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't disconnect." },
      { status: 502 },
    );
  }
}
