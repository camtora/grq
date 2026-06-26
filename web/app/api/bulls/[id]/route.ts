import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { memberFromRequest } from "@/lib/session";

// Bull-Race lifecycle actions. Member-only. { op: start | pause | end | reset | delete }.
// reset = wipe the race's positions/trades/calls/nav history + restore each bull's cash to the
// stake (a fresh start). delete = remove the race entirely (cascades). Sandbox only.
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only — read-only access." }, { status: 403 });

  const raceId = Number((await params).id);
  if (!Number.isInteger(raceId)) return NextResponse.json({ error: "Bad race id." }, { status: 400 });
  const race = await prisma.race.findUnique({ where: { id: raceId } });
  if (!race) return NextResponse.json({ error: "Race not found." }, { status: 404 });

  let body: { op?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const op = String(body.op ?? "");

  switch (op) {
    case "start":
      await prisma.race.update({ where: { id: raceId }, data: { status: "RUNNING", startedAt: race.startedAt ?? new Date(), endedAt: null } });
      break;
    case "pause":
      await prisma.race.update({ where: { id: raceId }, data: { status: "PAUSED" } });
      break;
    case "end":
      await prisma.race.update({ where: { id: raceId }, data: { status: "ENDED", endedAt: new Date() } });
      break;
    case "reset": {
      const ids = (await prisma.raceEntrant.findMany({ where: { raceId }, select: { id: true } })).map((e) => e.id);
      await prisma.$transaction([
        prisma.raceTrade.deleteMany({ where: { entrantId: { in: ids } } }),
        prisma.racePosition.deleteMany({ where: { entrantId: { in: ids } } }),
        prisma.raceCall.deleteMany({ where: { entrantId: { in: ids } } }),
        prisma.raceNavSnapshot.deleteMany({ where: { entrantId: { in: ids } } }),
        prisma.raceEntrant.updateMany({ where: { raceId }, data: { cashCents: race.startingStakeCents, status: "ACTIVE" } }),
      ]);
      break;
    }
    case "delete":
      await prisma.race.delete({ where: { id: raceId } }); // cascades to entrants + their rows
      break;
    default:
      return NextResponse.json({ error: `Unknown op "${op}".` }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
