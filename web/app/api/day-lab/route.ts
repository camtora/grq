import { NextResponse } from "next/server";
import { sessionFromRequest, memberFromRequest } from "@/lib/session";
import { loadDayLab, startDayLab, traderBuy, traderSell, flattenDayLab, markDayLab, resetDayLab, currentDayLab } from "@/lib/day/lab";

// The Day-Trading Lab (docs/DAY-TRADE-LAB.md) — read the Trader-vs-Holder book (any signed-in session) +
// member actions (start / buy / sell / flatten / mark / reset). MODELED, never executable; the fund is
// code-blocked from same-day round trips (§6). Writes self-guard via memberFromRequest — viewers 403.
export const dynamic = "force-dynamic";
export const maxDuration = 25;

export async function GET(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Sign in to view this." }, { status: 403 });
  return NextResponse.json(await loadDayLab());
}

export async function POST(req: Request) {
  const member = memberFromRequest(req);
  if (!member) return NextResponse.json({ error: "Members only." }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { op?: string; symbol?: string; shares?: number };
  try {
    if (body.op === "start") {
      const r = await startDayLab(String(body.symbol ?? ""));
      if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
    } else if (body.op === "buy" || body.op === "sell" || body.op === "flatten" || body.op === "mark") {
      const lab = await currentDayLab();
      if (!lab) return NextResponse.json({ error: "No lab — start one first." }, { status: 400 });
      const r =
        body.op === "buy" ? await traderBuy(lab.id, Number(body.shares))
        : body.op === "sell" ? await traderSell(lab.id, body.shares ? Number(body.shares) : undefined)
        : body.op === "flatten" ? await flattenDayLab(lab.id)
        : (await markDayLab(lab.id), { ok: true as const });
      if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
    } else if (body.op === "reset") {
      await resetDayLab();
    } else {
      return NextResponse.json({ error: "Unknown op." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
