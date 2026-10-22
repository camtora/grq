import { NextResponse } from "next/server";
import { memberFromRequest, displayName } from "@/lib/session";
import { pauseAgentForReset, liftResetPause, pauseState } from "@/lib/reset-run";

export const dynamic = "force-dynamic";

// Pause or lift Alfred for the reset (D138). Members only. The pause rides the limit-quiet skip
// under its own named reason: no Claude session, the tick and the order path untouched.
export async function POST(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only — read-only access." }, { status: 403 });
  let body: { paused?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (typeof body.paused !== "boolean") return NextResponse.json({ error: "Expected { paused: boolean }." }, { status: 400 });
  const who = displayName(session);
  if (body.paused) {
    const until = await pauseAgentForReset(who, session.email);
    return NextResponse.json({ ok: true, paused: true, until });
  }
  const st = await pauseState();
  if (st.paused && !st.isReset) {
    return NextResponse.json({ error: "Alfred is quiet for a Claude-limit reason, not the reset — lift that from the database, not here." }, { status: 409 });
  }
  await liftResetPause(who, session.email);
  return NextResponse.json({ ok: true, paused: false });
}
