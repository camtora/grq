import { NextResponse } from "next/server";
import { getBroker } from "@/lib/broker";
import { sessionFromRequest, displayName } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Manual order entry — a Phase 1 dev tool for exercising the engine. Only
 *  exists while BROKER=sim; the agent goes through the engine directly. */
export async function POST(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Not a member." }, { status: 403 });
  if ((process.env.BROKER ?? "sim") !== "sim") {
    return NextResponse.json({ error: "Manual orders are sim-only." }, { status: 400 });
  }

  let body: {
    symbol?: unknown;
    side?: unknown;
    type?: unknown;
    qty?: unknown;
    limitPriceCents?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (typeof body.symbol !== "string" || body.symbol.length === 0 || body.symbol.length > 8) {
    return NextResponse.json({ error: "symbol required." }, { status: 400 });
  }
  if (body.side !== "BUY" && body.side !== "SELL") {
    return NextResponse.json({ error: "side must be BUY or SELL." }, { status: 400 });
  }
  if (body.type !== "MARKET" && body.type !== "LIMIT") {
    return NextResponse.json({ error: "type must be MARKET or LIMIT." }, { status: 400 });
  }
  if (typeof body.qty !== "number" || !Number.isInteger(body.qty) || body.qty <= 0 || body.qty > 100_000) {
    return NextResponse.json({ error: "qty must be a positive integer." }, { status: 400 });
  }
  const limitPriceCents =
    body.type === "LIMIT"
      ? typeof body.limitPriceCents === "number" && Number.isInteger(body.limitPriceCents) && body.limitPriceCents > 0
        ? body.limitPriceCents
        : null
      : undefined;
  if (limitPriceCents === null) {
    return NextResponse.json({ error: "LIMIT orders need limitPriceCents > 0." }, { status: 400 });
  }

  const result = await getBroker().placeOrder({
    symbol: body.symbol,
    side: body.side,
    type: body.type,
    qty: body.qty,
    limitPriceCents: limitPriceCents ?? undefined,
    placedBy: session.email,
    reason: `Manual sim order by ${displayName(session)}.`,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
