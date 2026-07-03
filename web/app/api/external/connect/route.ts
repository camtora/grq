import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
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
 *  Portal URL the member opens. Members-only; acts on the caller's own identity.
 *  Optional body `{ reconnect: <authorizationId> }` re-auths an EXISTING broken
 *  connection (the portal skips straight to that broker's login) — the id must
 *  belong to one of the caller's own accounts. */
export async function POST(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only — read-only access." }, { status: 403 });
  if (!(await snaptradeConfiguredFor(session.email))) {
    return NextResponse.json({ error: "SnapTrade isn't configured for your account yet." }, { status: 503 });
  }

  let reconnect: string | undefined;
  try {
    const body = (await req.json()) as { reconnect?: unknown };
    if (typeof body?.reconnect === "string" && body.reconnect) reconnect = body.reconnect;
  } catch {
    /* no body — a fresh connect */
  }
  if (reconnect) {
    const owned = await prisma.externalAccount.findFirst({
      where: { ownerEmail: session.email, authorizationId: reconnect },
      select: { id: true },
    });
    if (!owned) {
      return NextResponse.json({ error: "That connection isn't yours to fix." }, { status: 400 });
    }
  }

  try {
    const url = await buildConnectUrl(session.email, originFrom(req), reconnect);
    return NextResponse.json({ url });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't start the connection." },
      { status: 502 },
    );
  }
}
