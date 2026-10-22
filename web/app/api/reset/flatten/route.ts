import { NextResponse } from "next/server";
import { memberFromRequest, displayName } from "@/lib/session";
import { startFlatten } from "@/lib/reset-run";

export const dynamic = "force-dynamic";

// Sell the book flat for the paper-account reset (D138): one tagged market SELL per position, placed
// by the member who clicked, one name at a time in the background; the panel polls /api/reset/status.
// Members only. The guards (pause first, kill switch off, market open, nothing running) are in
// lib/reset.ts flattenRefusal and tested.
export async function POST(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only — read-only access." }, { status: 403 });
  let body: { confirm?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (body.confirm !== "SELL EVERYTHING") return NextResponse.json({ error: 'Type SELL EVERYTHING to confirm.' }, { status: 400 });
  try {
    const job = await startFlatten(session.email, displayName(session));
    return NextResponse.json({ ok: true, job });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not start the flatten." }, { status: 409 });
  }
}
