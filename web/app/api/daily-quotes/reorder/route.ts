import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { memberFromRequest } from "@/lib/session";

// Persist a new display/rotation order for the masthead lines. Member-only.
// Body { ids: number[] } — sortOrder is set to each id's position in the array.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only." }, { status: 403 });

  let body: { ids?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const ids = Array.isArray(body.ids) ? body.ids.filter((n): n is number => Number.isInteger(n)) : [];
  if (ids.length === 0) return NextResponse.json({ error: "No order given." }, { status: 400 });

  await prisma.$transaction(ids.map((id, i) => prisma.dailyQuote.update({ where: { id }, data: { sortOrder: i } })));
  return NextResponse.json({ ok: true });
}
