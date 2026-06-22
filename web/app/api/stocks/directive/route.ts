import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { memberFromRequest, displayName } from "@/lib/session";
import { inUniverse } from "@/lib/universe";
import { notifyOut } from "@/agent/alerts";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only — read-only access." }, { status: 403 });

  let body: { symbol?: unknown; directive?: unknown; note?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (typeof body.symbol !== "string" || !(await inUniverse(body.symbol))) {
    return NextResponse.json({ error: "Unknown symbol." }, { status: 400 });
  }
  const symbol = body.symbol.toUpperCase();
  const directive = body.directive;
  if (directive !== "PINNED" && directive !== "BLOCKED" && directive !== null) {
    return NextResponse.json({ error: "directive must be PINNED, BLOCKED, or null." }, { status: 400 });
  }
  const note =
    typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 200) : null;
  const who = displayName(session);

  let title: string;
  if (directive === null) {
    await prisma.symbolDirective.deleteMany({ where: { symbol } });
    title = `${who} cleared the directive on ${symbol}`;
  } else {
    await prisma.symbolDirective.upsert({
      where: { symbol },
      create: { symbol, directive, by: who, note },
      update: { directive, by: who, note, at: new Date() },
    });
    title =
      directive === "BLOCKED"
        ? `${who} put ${symbol} on the no-fly list`
        : `${who} pinned ${symbol} as a priority`;
  }

  await prisma.journalEntry.create({
    data: {
      kind: "SYSTEM",
      symbol,
      title,
      body:
        (note ? `Note: "${note}". ` : "") +
        (directive === "BLOCKED"
          ? "The agent may not buy this name until a member unblocks it (sells remain allowed)."
          : directive === "PINNED"
            ? "Priority name — it sorts to the top of its list and the agent keeps it front-of-mind; it can't be dropped from focus."
            : "The agent's normal rules apply again."),
    },
  });
  await notifyOut("info", title, note ? `"${note}"` : "", { category: "members", actorEmail: session.email, symbol });

  return NextResponse.json({ ok: true });
}
