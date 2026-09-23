import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { memberFromRequest, displayName } from "@/lib/session";
import { getBroker } from "@/lib/broker";
import { notifyOut } from "@/agent/alerts";

// Cancel a resting order (2026-09-23). GRQ could PLACE orders and never cancel one — no
// adapter method, no tool, no UI — so a stale GTC limit could only be killed by logging
// into IBKR directly. Found via a TD BUY 6 @ $165 GTC that had rested a week at 4.3% out
// of the money with nothing in the app able to clear it.
//
// Members only, like every other mutating route. The agent has NO cancel tool: cancelling
// is a money-adjacent decision about an order a human can see resting, and the agent
// already has the disciplined path (let it fill or let it sit). Humans keep this one.

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only." }, { status: 403 });
  const who = displayName(session);

  let body: { orderId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const orderId = typeof body.orderId === "number" ? body.orderId : Number(body.orderId);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return NextResponse.json({ error: "Invalid orderId." }, { status: 400 });
  }

  const before = await prisma.order.findUnique({ where: { id: orderId } });
  if (!before) return NextResponse.json({ error: `Order #${orderId} not found.` }, { status: 404 });
  if (before.status !== "PENDING") {
    return NextResponse.json({ error: `Order #${orderId} is ${before.status} — only a resting order can be cancelled.` }, { status: 409 });
  }

  const result = await getBroker().cancelOrder(orderId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });

  const px = before.limitPriceCents ? ` @ $${(before.limitPriceCents / 100).toFixed(2)}` : "";
  await prisma.journalEntry.create({
    data: {
      kind: "SYSTEM",
      symbol: before.symbol,
      title: `${who} cancelled the resting ${before.side} on ${before.symbol}`,
      body: `Order #${orderId} — ${before.side} ${before.qty} ${before.symbol}${px} — cancelled at the broker by ${who}. The cash it had committed is free again; the §6 gate sees it immediately.${before.reason ? `\n\nThe order's original reason: ${before.reason}` : ""}`,
    },
  });
  await notifyOut("info", `${who} cancelled a resting order — ${before.side} ${before.qty} ${before.symbol}${px}`, "", {
    category: "members",
    actorEmail: session.email,
    symbol: before.symbol,
  });

  return NextResponse.json({ ok: true, orderId, status: "CANCELLED" });
}
