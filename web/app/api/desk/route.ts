import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sessionFromRequest, memberFromRequest } from "@/lib/session";
import { deskResponse } from "@/lib/feed";
import { MODELS } from "@/agent/policy";
import { modelLabel } from "@/lib/race/models";

export const dynamic = "force-dynamic";

// Mobile read — the Options Desk sandbox (stock-only vs +options). Optional ?id=<deskId>.
export async function GET(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Sign in to view this." }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  return NextResponse.json(await deskResponse(id ? Number(id) : undefined));
}

/** Create a new desk (member-only): { name, cadence, startingStakeCents } → { deskId }.
 *  Two arms spawn automatically — control (stock-only) vs treatment (+options), both
 *  MODELS.decision on BALANCED (mirrors scripts/seed-options-desk.ts). This endpoint was
 *  missing entirely — the web's "+ New desk" form has been POSTing into a 405 since D92. */
export async function POST(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only — read-only access." }, { status: 403 });

  let body: { name?: unknown; cadence?: unknown; startingStakeCents?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const name = (typeof body.name === "string" ? body.name.trim() : "").slice(0, 60) || "New Desk";
  const cadence = body.cadence === "hourly" ? "hourly" : "daily";
  const stake = Number(body.startingStakeCents);
  if (!Number.isInteger(stake) || stake < 100_000 || stake > 100_000_000) {
    return NextResponse.json({ error: "Stake must be CA$1,000–$1,000,000." }, { status: 400 });
  }

  const model = MODELS.decision;
  const desk = await prisma.optionsDesk.create({
    data: { name, status: "RUNNING", cadence, startingStakeCents: stake, startedAt: new Date() },
  });
  await prisma.deskEntrant.createMany({
    data: [
      { deskId: desk.id, model, arm: "control", dial: "BALANCED", label: `${modelLabel(model)} · stock-only`, cashCents: stake, status: "ACTIVE" },
      { deskId: desk.id, model, arm: "treatment", dial: "BALANCED", label: `${modelLabel(model)} · options`, cashCents: stake, status: "ACTIVE" },
    ],
  });
  return NextResponse.json({ ok: true, deskId: desk.id });
}
