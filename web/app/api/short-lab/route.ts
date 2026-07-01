import { NextResponse } from "next/server";
import { sessionFromRequest, memberFromRequest } from "@/lib/session";
import { loadShortLab, openShort, coverShort, markLab, resetLab, ensureHouseLab } from "@/lib/short/lab";

// The Short Lab (docs/SHORT-LAB.md) — read the sandbox book (any signed-in session) + member actions
// (open / cover / mark / reset). Modeled, never executable; the fund never shorts (rule #3). Writes
// self-guard via memberFromRequest — viewers 403.
export const dynamic = "force-dynamic";
export const maxDuration = 25;

export async function GET(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Sign in to view this." }, { status: 403 });
  return NextResponse.json(await loadShortLab());
}

export async function POST(req: Request) {
  const member = memberFromRequest(req);
  if (!member) return NextResponse.json({ error: "Members only." }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { op?: string; symbol?: string; qty?: number; notionalCents?: number; positionId?: number };
  const lab = await ensureHouseLab();
  try {
    if (body.op === "open") {
      const r = await openShort(lab.id, String(body.symbol ?? ""), { qty: body.qty ? Number(body.qty) : undefined, notionalCents: body.notionalCents ? Number(body.notionalCents) : undefined });
      if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
    } else if (body.op === "cover") {
      const r = await coverShort(Number(body.positionId));
      if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
    } else if (body.op === "mark") {
      await markLab(lab.id);
    } else if (body.op === "reset") {
      await resetLab(lab.id);
    } else {
      return NextResponse.json({ error: "Unknown op." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
