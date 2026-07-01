import { NextResponse } from "next/server";
import { sessionFromRequest, memberFromRequest } from "@/lib/session";
import { loadShortDesk, shortDeskControl } from "@/lib/short/desk";

// The Short Lab agent A/B (docs/SHORT-LAB.md Phase 2) — read the contest (any signed-in session) +
// member controls (start / pause / reset). The contest only actually runs sessions when a member starts
// it AND GRQ_SHORTLAB_AGENT is on (it spends Opus tokens). Sandbox; the fund never shorts.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Sign in to view this." }, { status: 403 });
  return NextResponse.json(await loadShortDesk());
}

export async function POST(req: Request) {
  const member = memberFromRequest(req);
  if (!member) return NextResponse.json({ error: "Members only." }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { op?: string };
  if (!body.op || !["start", "pause", "reset"].includes(body.op)) return NextResponse.json({ error: "Unknown op." }, { status: 400 });
  await shortDeskControl(body.op);
  return NextResponse.json({ ok: true });
}
