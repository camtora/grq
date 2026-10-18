import { NextResponse } from "next/server";
import { memberFromRequest } from "@/lib/session";
import { memberKeyForEmail } from "@/lib/users";
import { PLAN_QUESTIONS, PLAN_ROUND } from "@/lib/plan-questions";
import { recordAnswer, standingAnswers } from "@/lib/plan-answers";

export const dynamic = "force-dynamic";

// The plan's questions and the members' recorded answers (D139). Members only, both ways: a
// viewer reads the fund but does not decide for it, and a user never sees the plan at all.
export async function GET(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only." }, { status: 403 });
  const answers = await standingAnswers();
  return NextResponse.json({ round: PLAN_ROUND, questions: PLAN_QUESTIONS, me: memberKeyForEmail(session.email), answers });
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
    const row = await recordAnswer({ email: session.email, questionKey, choice, note });
    return NextResponse.json({ ok: true, at: row.at });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not record that." }, { status: 400 });
  }
}
