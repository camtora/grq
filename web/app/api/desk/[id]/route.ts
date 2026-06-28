import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { memberFromRequest } from "@/lib/session";

// Options Desk lifecycle actions. Member-only. { op: start | pause | end | reset | delete }.
// reset = wipe the desk's positions/trades/calls/nav history + restore each arm's cash to the stake.
// delete = remove the desk entirely (cascades to entrants + their rows). Sandbox only — never touches
// the real fund, the §6 gate, or the broker.
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only — read-only access." }, { status: 403 });

  const deskId = Number((await params).id);
  if (!Number.isInteger(deskId)) return NextResponse.json({ error: "Bad desk id." }, { status: 400 });
  const desk = await prisma.optionsDesk.findUnique({ where: { id: deskId } });
  if (!desk) return NextResponse.json({ error: "Desk not found." }, { status: 404 });

  let body: { op?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const op = String(body.op ?? "");

  switch (op) {
    case "start":
      await prisma.optionsDesk.update({ where: { id: deskId }, data: { status: "RUNNING", startedAt: desk.startedAt ?? new Date(), endedAt: null } });
      break;
    case "pause":
      await prisma.optionsDesk.update({ where: { id: deskId }, data: { status: "PAUSED" } });
      break;
    case "end":
      await prisma.optionsDesk.update({ where: { id: deskId }, data: { status: "ENDED", endedAt: new Date() } });
      break;
    case "reset": {
      const ids = (await prisma.deskEntrant.findMany({ where: { deskId }, select: { id: true } })).map((e) => e.id);
      await prisma.$transaction([
        prisma.deskTrade.deleteMany({ where: { entrantId: { in: ids } } }),
        prisma.deskPosition.deleteMany({ where: { entrantId: { in: ids } } }),
        prisma.deskCall.deleteMany({ where: { entrantId: { in: ids } } }),
        prisma.deskNavSnapshot.deleteMany({ where: { entrantId: { in: ids } } }),
        prisma.deskEntrant.updateMany({ where: { deskId }, data: { cashCents: desk.startingStakeCents, status: "ACTIVE" } }),
      ]);
      break;
    }
    case "delete":
      await prisma.optionsDesk.delete({ where: { id: deskId } }); // cascades to entrants + their rows
      break;
    default:
      return NextResponse.json({ error: `Unknown op "${op}".` }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
