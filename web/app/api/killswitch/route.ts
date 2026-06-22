import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { memberFromRequest, displayName } from "@/lib/session";
import { notifyOut } from "@/agent/alerts";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only — read-only access." }, { status: 403 });

  let body: { engaged?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (typeof body.engaged !== "boolean") {
    return NextResponse.json({ error: "Expected { engaged: boolean }." }, { status: 400 });
  }

  const who = displayName(session);
  await prisma.$transaction([
    prisma.settings.update({
      where: { id: 1 },
      data: {
        killSwitch: body.engaged,
        killSwitchBy: who,
        killSwitchAt: new Date(),
        updatedBy: session.email,
      },
    }),
    prisma.journalEntry.create({
      data: {
        kind: "SYSTEM",
        title: body.engaged ? `Kill switch ENGAGED by ${who}` : `Trading resumed by ${who}`,
        body: body.engaged
          ? "All order placement is halted at the gate. Nothing trades until a human re-enables."
          : "Kill switch released — the order gate is open again.",
      },
    }),
  ]);

  await notifyOut(
    body.engaged ? "critical" : "warning",
    body.engaged ? `Kill switch ENGAGED by ${who}` : `Trading resumed by ${who}`,
    body.engaged ? "All order placement is halted at the gate." : "The order gate is open again.",
    // Risk = forced-on; skip the member who flipped it so only the OTHER is pinged.
    { category: "risk", actorEmail: session.email },
  );

  return NextResponse.json({ ok: true, engaged: body.engaged });
}
