import { NextResponse } from "next/server";
import { memberFromRequest, displayName } from "@/lib/session";
import { emailForMemberKey, isMember } from "@/lib/users";
import { createDirectMessage } from "@/lib/messages";

export const dynamic = "force-dynamic";

// A member shares a stock with the other member straight from the stock page (D59).
// As of D61 this is a thin wrapper over the messaging spine: the share is persisted
// as a DirectMessage (so it lands in the Cam↔Graham thread, not just an ephemeral
// ping) and the recipient gets ONE push that deep-links to the dossier. The newer
// iOS share/comment flow posts to /api/messages directly; this route stays so shares
// from older app builds (which still call /api/stocks/share) keep working.
export async function POST(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only — read-only access." }, { status: 403 });

  let body: { symbol?: unknown; to?: unknown; comment?: unknown; panel?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const symbol = typeof body.symbol === "string" ? body.symbol.trim().toUpperCase() : "";
  if (!symbol || symbol.length > 20) {
    return NextResponse.json({ error: "A stock symbol is required." }, { status: 400 });
  }

  // `to` is a stable member key ("cam"|"graham") or a raw email; resolve to a member.
  const toRaw = typeof body.to === "string" ? body.to.trim() : "";
  const recipient = (toRaw.includes("@") ? toRaw.toLowerCase() : emailForMemberKey(toRaw)) ?? "";
  if (!recipient || !isMember(recipient)) {
    return NextResponse.json({ error: "Pick a member to share with." }, { status: 400 });
  }
  if (recipient === session.email) {
    return NextResponse.json({ error: "You can't share a stock with yourself." }, { status: 400 });
  }

  await createDirectMessage({
    fromEmail: session.email,
    fromName: displayName(session),
    toEmail: recipient,
    body: typeof body.comment === "string" ? body.comment : "",
    symbol,
    panel: typeof body.panel === "string" ? body.panel : null,
  });

  return NextResponse.json({ ok: true });
}
