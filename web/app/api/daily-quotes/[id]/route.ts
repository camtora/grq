import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { memberFromRequest } from "@/lib/session";
import { torontoDay } from "@/lib/dailyquote";

// Edit / pin / enable / delete one masthead line. Member-only.
// PATCH { text?, enabled?, pinToday? } — pinToday:true forces this line on today's
// Toronto date (overrides the rotation); pinToday:false clears the pin.
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only." }, { status: 403 });

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Bad id." }, { status: 400 });

  let body: { text?: unknown; enabled?: unknown; pinToday?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const data: { text?: string; enabled?: boolean; pinnedDate?: string | null } = {};
  if (typeof body.text === "string") {
    const text = body.text.trim().slice(0, 500);
    if (!text) return NextResponse.json({ error: "Quote text can’t be empty." }, { status: 400 });
    data.text = text;
  }
  if (typeof body.enabled === "boolean") data.enabled = body.enabled;
  if (typeof body.pinToday === "boolean") data.pinnedDate = body.pinToday ? torontoDay() : null;
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });

  try {
    // A pin is exclusive for the day — clear any other line pinned to the same date.
    if (data.pinnedDate) await prisma.dailyQuote.updateMany({ where: { pinnedDate: data.pinnedDate, NOT: { id } }, data: { pinnedDate: null } });
    await prisma.dailyQuote.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "That exact line already exists (or it was deleted)." }, { status: 409 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only." }, { status: 403 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Bad id." }, { status: 400 });
  await prisma.dailyQuote.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
