import { NextResponse } from "next/server";
import { memberFromRequest } from "@/lib/session";
import { PLAN_ROUND } from "@/lib/plan-questions";
import { recordDecision, standingDecisions } from "@/lib/plan-answers";

export const dynamic = "force-dynamic";

// The outcome of the members' discussion of a plan question (D139, 2026-10-22). Members only, both
// ways: a decision is the fund's, recorded by either member once both have agreed on the call.
export async function GET(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only." }, { status: 403 });
  return NextResponse.json({ round: PLAN_ROUND, decisions: await standingDecisions() });
}

export async function POST(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only — read-only access." }, { status: 403 });
  let body: { questionKey?: unknown; choice?: unknown; note?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const questionKey = typeof body.questionKey === "string" ? body.questionKey : "";
  const choice = typeof body.choice === "string" ? body.choice : "";
  const note = typeof body.note === "string" ? body.note : null;
  try {
    const row = await recordDecision({ decidedBy: session.email, questionKey, choice, note });
    return NextResponse.json({ ok: true, at: row.at });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not record that." }, { status: 400 });
  }
}
