import { NextResponse } from "next/server";
import { memberFromRequest } from "@/lib/session";
import { buildConnectUrl, snaptradeConfiguredFor } from "@/lib/external/store";

export const dynamic = "force-dynamic";

// Public origin (behind nginx) for SnapTrade's post-connection redirect.
function originFrom(req: Request): string {
  const h = req.headers;
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "grq.camerontora.ca";
  return `${proto}://${host}`;
}

/** Start a read-only brokerage connection: returns the SnapTrade Connection
 *  Portal URL the member opens. Members-only; acts on the caller's own identity. */
export async function POST(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only — read-only access." }, { status: 403 });
  if (!snaptradeConfiguredFor(session.email)) {
    return NextResponse.json({ error: "SnapTrade isn't configured for your account yet." }, { status: 503 });
  }
  try {
    const url = await buildConnectUrl(session.email, originFrom(req));
    return NextResponse.json({ url });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't start the connection." },
      { status: 502 },
    );
  }
}
