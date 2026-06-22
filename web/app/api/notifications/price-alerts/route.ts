import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { memberFromRequest } from "@/lib/session";
import { getQuote } from "@/lib/broker/quotes";
import { universeEntry } from "@/lib/universe";
import { userForEmail } from "@/lib/users";
import { personByName } from "@/lib/people";

export const dynamic = "force-dynamic";

// Per-user price alerts (Phase 2 — The Wire). A member sets "ping me when SYMBOL
// crosses $X" from the stock page or The Wire. The agent runner checks active
// alerts each market-hours tick (web/agent/runner.ts → checkPriceAlerts) and pushes
// the OWNER ONLY when the price crosses, then one-shots the alert. Members-only;
// every row is scoped to the caller's own email. Money is integer cents (house rule).

const MAX_ACTIVE = 50; // soft cap per member so the tick stays cheap

type AlertRow = {
  id: number;
  email: string;
  symbol: string;
  direction: string;
  thresholdCents: number;
  currency: string;
  note: string | null;
  active: boolean;
  createdAt: Date;
  firedAt: Date | null;
};

const shape = (a: AlertRow) => ({
  id: a.id,
  symbol: a.symbol,
  direction: a.direction,
  thresholdCents: a.thresholdCents,
  currency: a.currency,
  note: a.note,
  active: a.active,
  createdAt: a.createdAt.toISOString(),
  firedAt: a.firedAt ? a.firedAt.toISOString() : null,
});

// The symbol-scoped view adds attribution so the fund sees WHO is watching a name
// (notifications + deletes stay per-owner; this is visibility only).
const shapeWithOwner = (a: AlertRow, me: string) => {
  const name = userForEmail(a.email)?.name ?? a.email;
  return {
    ...shape(a),
    owner: name,
    ownerKey: personByName(name)?.key ?? null,
    mine: a.email.toLowerCase() === me.toLowerCase(),
  };
};

export async function GET(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only." }, { status: 403 });

  // `?symbol=XYZ` → every member's ACTIVE alerts on that name (the stock page's
  // "alerts on this stock" card). No symbol → the caller's own alerts (the manager).
  const symbol = new URL(req.url).searchParams.get("symbol")?.trim().toUpperCase();
  if (symbol) {
    const rows = await prisma.priceAlert.findMany({
      where: { symbol, active: true },
      orderBy: [{ direction: "asc" }, { thresholdCents: "asc" }],
    });
    return NextResponse.json({ alerts: rows.map((a) => shapeWithOwner(a, session.email)) });
  }

  const rows = await prisma.priceAlert.findMany({
    where: { email: session.email },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    take: 100,
  });
  return NextResponse.json({ alerts: rows.map(shape) });
}

export async function POST(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only." }, { status: 403 });

  let body: { symbol?: unknown; direction?: unknown; thresholdCents?: unknown; currency?: unknown; note?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const symbol = typeof body.symbol === "string" ? body.symbol.trim().toUpperCase() : "";
  if (!symbol) return NextResponse.json({ error: "A stock symbol is required." }, { status: 400 });

  const thresholdCents = typeof body.thresholdCents === "number" ? Math.round(body.thresholdCents) : NaN;
  if (!Number.isFinite(thresholdCents) || thresholdCents <= 0) {
    return NextResponse.json({ error: "A target price above $0 is required." }, { status: 400 });
  }

  let direction = body.direction === "above" || body.direction === "below" ? body.direction : null;
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 140) : null;

  // Live price (best-effort) — used to derive the direction if the client didn't
  // pick one, and to refuse an alert whose condition is ALREADY true (it'd fire
  // instantly and be useless). If we can't get a quote, trust the client.
  const q = await getQuote(symbol).catch(() => null);
  if (q?.midCents != null) {
    if (!direction) direction = thresholdCents >= q.midCents ? "above" : "below";
    const alreadyMet = direction === "above" ? q.midCents >= thresholdCents : q.midCents <= thresholdCents;
    if (alreadyMet) {
      const px = `$${(q.midCents / 100).toFixed(2)}`;
      const tgt = `$${(thresholdCents / 100).toFixed(2)}`;
      return NextResponse.json(
        { error: `${symbol} is already ${direction} ${tgt} (it's at ${px}). Pick a level it hasn't crossed yet.` },
        { status: 400 },
      );
    }
  }
  if (!direction) {
    return NextResponse.json({ error: "Couldn't read a live price — choose Above or Below." }, { status: 400 });
  }

  const activeCount = await prisma.priceAlert.count({ where: { email: session.email, active: true } });
  if (activeCount >= MAX_ACTIVE) {
    return NextResponse.json({ error: `You've hit the ${MAX_ACTIVE}-alert limit. Delete one first.` }, { status: 400 });
  }

  const currency =
    (typeof body.currency === "string" && body.currency.trim()) ||
    (await universeEntry(symbol).catch(() => null))?.currency ||
    "CAD";

  const row = await prisma.priceAlert.create({
    data: { email: session.email, symbol, direction, thresholdCents, currency, note },
  });
  return NextResponse.json(shape(row));
}

export async function DELETE(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only." }, { status: 403 });

  let body: { id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const id = typeof body.id === "number" ? body.id : Number(body.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "id required." }, { status: 400 });

  // Scope the delete to the caller's own alerts.
  await prisma.priceAlert.deleteMany({ where: { id, email: session.email } });
  return NextResponse.json({ ok: true });
}
