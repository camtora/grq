import { NextResponse } from "next/server";
import { memberFromRequest } from "@/lib/session";
import { connectionHealthFor, snaptradeConfiguredFor } from "@/lib/external/store";

export const dynamic = "force-dynamic";

/** The caller's SnapTrade connection health, read LIVE from the authorization
 *  endpoint (the only honest break/fixed signal — a disabled connection still
 *  serves cached data). The Reconnect flow polls this to detect the flip the
 *  moment SnapTrade's re-auth lands, since the portal UI can hang past its own
 *  "up to 60 seconds" promise. Members-only; reads the caller's own partner. */
export async function GET(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only." }, { status: 403 });
  if (!(await snaptradeConfiguredFor(session.email))) {
    return NextResponse.json({ connections: [] });
  }
  try {
    const connections = await connectionHealthFor(session.email);
    return NextResponse.json({ connections });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message.split("\n")[0] : "Couldn't read connection status." },
      { status: 502 },
    );
  }
}
