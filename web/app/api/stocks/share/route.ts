import { NextResponse } from "next/server";
import { memberFromRequest, displayName } from "@/lib/session";
import { emailForMemberKey, isMember } from "@/lib/users";
import { pushNotify } from "@/lib/push/notify";

export const dynamic = "force-dynamic";

// A member shares a stock with the other member straight from the stock page: one
// tap fires an iOS push to the recipient that deep-links to the dossier (the app
// routes on the `symbol` in the payload). Members-only, and the push goes to the
// recipient ALONE (onlyEmail) — never a broadcast. Works on ANY symbol, not just
// the tracked universe. No-op delivery until APNs is configured (lib/push/apns.ts).
export async function POST(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only — read-only access." }, { status: 403 });

  let body: { symbol?: unknown; to?: unknown };
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

  const who = displayName(session);
  await pushNotify({
    category: "members",
    severity: "info",
    title: `${who} shared ${symbol} with you`,
    body: `${who} thinks ${symbol} is worth a look. Tap to open the dossier.`,
    onlyEmail: recipient,
    symbol,
  });

  return NextResponse.json({ ok: true });
}
