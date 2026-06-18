import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { memberFromRequest, displayName } from "@/lib/session";

export const dynamic = "force-dynamic";

// Refresh the discovery hunt on demand (Graham 2026-06-16). The web (alpine) can't
// run a Claude session — only the agent (debian) can — so we set a flag the agent's
// tick loop picks up and runs the hunt off-schedule.
//
// Directed hunt (D38): an optional `brief` steers the run in plain English ("emerging
// medical names about to post trial data"). A blank submit clears any prior brief and
// runs broad. Latest submit wins; huntBrief also powers the page's directed-hunt banner.
export async function POST(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const brief = typeof body?.brief === "string" ? body.brief.trim().slice(0, 240) : "";

  const state = await prisma.agentState.findUnique({ where: { id: 1 } });
  if (state?.huntRequestedAt) {
    return NextResponse.json({ ok: true, queued: false, note: "A hunt refresh is already queued." });
  }
  const who = displayName(session);
  await prisma.agentState.upsert({
    where: { id: 1 },
    create: { id: 1, huntRequestedAt: new Date(), huntRequestedBy: who, huntBrief: brief || null },
    update: { huntRequestedAt: new Date(), huntRequestedBy: who, huntBrief: brief || null },
  });
  return NextResponse.json({ ok: true, queued: true, brief: brief || null });
}
