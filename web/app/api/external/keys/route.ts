import { NextResponse } from "next/server";
import { memberFromRequest } from "@/lib/session";
import { saveMemberKeys } from "@/lib/external/store";

export const dynamic = "force-dynamic";

/** Self-serve connect: a member saves their OWN SnapTrade Personal-key credentials
 *  (Client ID + Consumer Key) through the UI — no human in the loop — and we
 *  immediately pull their accounts so holdings appear. Members-only, self only. */
export async function POST(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only — read-only access." }, { status: 403 });

  let clientId = "";
  let consumerKey = "";
  try {
    const body = (await req.json()) as { clientId?: unknown; consumerKey?: unknown };
    if (typeof body.clientId === "string") clientId = body.clientId.trim();
    if (typeof body.consumerKey === "string") consumerKey = body.consumerKey.trim();
  } catch {
    /* fall through to validation */
  }
  if (!clientId || !consumerKey) {
    return NextResponse.json({ error: "Enter both your Client ID and Consumer Key." }, { status: 400 });
  }

  try {
    const accounts = await saveMemberKeys(session.email, clientId, consumerKey);
    return NextResponse.json({ ok: true, accounts });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't connect those keys." },
      { status: 502 },
    );
  }
}
