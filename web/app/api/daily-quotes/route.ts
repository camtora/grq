import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { memberFromRequest } from "@/lib/session";
import { listQuotes, pickQuoteRow, torontoDay } from "@/lib/dailyquote";

// The GRQ Daily masthead quotes (lib/dailyquote.ts). Member-only management — the
// lines surface on the Today page for everyone, but only members edit them.
// GET → the full ordered list + which one shows today. POST → add a line.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only." }, { status: 403 });
  const [quotes, today] = await Promise.all([listQuotes(), pickQuoteRow()]);
  return NextResponse.json({ quotes, todayId: today?.id ?? null, today: torontoDay() });
}

export async function POST(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only." }, { status: 403 });

  let body: { text?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const text = String(body.text ?? "").trim().slice(0, 500);
  if (!text) return NextResponse.json({ error: "Quote text is required." }, { status: 400 });

  const max = await prisma.dailyQuote.aggregate({ _max: { sortOrder: true } });
  try {
    const q = await prisma.dailyQuote.create({ data: { text, sortOrder: (max._max.sortOrder ?? -1) + 1, createdBy: session.email } });
    return NextResponse.json({ ok: true, id: q.id });
  } catch {
    return NextResponse.json({ error: "That exact line already exists." }, { status: 409 });
  }
}
