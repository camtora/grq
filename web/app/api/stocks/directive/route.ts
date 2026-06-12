import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sessionFromRequest, displayName } from "@/lib/session";
import { inUniverse } from "@/lib/universe";
import { sendDiscord } from "@/agent/alerts";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Not a member." }, { status: 403 });

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
    if (directive === "PINNED") {
      await prisma.watchlist.upsert({
        where: { symbol },
        create: { symbol, note: `📌 pinned by ${who}` },
        update: {},
      });
    }
    title =
      directive === "BLOCKED"
        ? `${who} put ${symbol} on the no-fly list`
        : `${who} pinned ${symbol} to the watchlist`;
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
            ? "Stays on the watchlist; the agent cannot remove it."
            : "The agent's normal rules apply again."),
    },
  });
  await sendDiscord("info", title, note ? `"${note}"` : "");

  return NextResponse.json({ ok: true });
}
