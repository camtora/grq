import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { memberFromRequest, displayName } from "@/lib/session";
import { approveFxRequest, rejectFxRequest, manualConvert } from "@/lib/fx-requests";
import { fxStateResponse } from "@/lib/feed";
import { notifyOut } from "@/agent/alerts";
import { money } from "@/lib/money";

export const dynamic = "force-dynamic";

// "$X CAD → US$Y" / "US$X → $Y CAD" — formatted from the realized legs + direction.
const fxLine = (r: { fromCurrency: "CAD" | "USD"; toCurrency: "CAD" | "USD"; fromDebitedCents: number; toCreditedCents: number }) => {
  const f = (ccy: string, c: number) => (ccy === "USD" ? `US$${(c / 100).toFixed(2)}` : `$${(c / 100).toFixed(2)} CAD`);
  return `${f(r.fromCurrency, r.fromDebitedCents)} → ${f(r.toCurrency, r.toCreditedCents)}`;
};

// Members only — money-moving (D62). The web FxPanel POSTs here over the oauth2-proxy
// cookie; the iOS app reads GET + POSTs over a GRQ-JWT Bearer (in middleware MOBILE_API).
// Both resolve identity via memberFromRequest.

// GET — the FX panel state (balances, dials, pending/recent requests) for mobile.
export async function GET(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only — read-only access." }, { status: 403 });
  return NextResponse.json(await fxStateResponse());
}

export async function POST(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only — read-only access." }, { status: 403 });
  const who = displayName(session);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const action = body.action;

  if (action === "approve" || action === "reject") {
    const id = Number(body.id);
    if (!Number.isInteger(id)) return NextResponse.json({ error: "id must be an integer." }, { status: 400 });
    const note = typeof body.note === "string" ? body.note.slice(0, 300) : undefined;

    if (action === "reject") {
      const r = await rejectFxRequest(id, session.email, note);
      if (!r.ok) return NextResponse.json({ ok: false, error: r.reason }, { status: 400 });
      await notifyOut("info", `FX request #${id} rejected by ${who}`, note ?? "", { category: "fx", actorEmail: session.email }).catch(() => {});
      return NextResponse.json({ ok: true });
    }

    const r = await approveFxRequest(id, session.email, note);
    if (!r.ok) return NextResponse.json({ ok: false, error: r.reason }, { status: 400 });
    await notifyOut(
      "info",
      `FX executed: ${fxLine(r)}`,
      `${who} approved request #${id} @ ${r.rate.toFixed(4)} USD/CAD.`,
      { category: "fx", actorEmail: session.email },
    ).catch(() => {});
    return NextResponse.json({ ...r });
  }

  if (action === "convert") {
    const amountCents = Number(body.amountCents); // the typed amount, in `inputCurrency` cents
    if (!Number.isInteger(amountCents) || amountCents <= 0) return NextResponse.json({ error: "amountCents must be a positive integer (cents)." }, { status: 400 });
    // Direction defaults to CAD→USD (back-compat); USD→CAD brings money home.
    const fromCurrency = body.fromCurrency === "USD" ? "USD" : "CAD";
    const toCurrency = body.toCurrency === "CAD" ? "CAD" : "USD";
    if (fromCurrency === toCurrency) return NextResponse.json({ error: "from and to currencies must differ." }, { status: 400 });
    // Which currency the typed amount is in. Defaults to "USD" — the historic semantics where
    // amountCents was always the USD leg (keeps older mobile builds working).
    const inputCurrency = body.inputCurrency === "CAD" ? "CAD" : "USD";
    if (inputCurrency !== fromCurrency && inputCurrency !== toCurrency) return NextResponse.json({ error: "inputCurrency must be one of the two sides." }, { status: 400 });
    const note = typeof body.note === "string" ? body.note.slice(0, 300) : undefined;
    const r = await manualConvert({ inputCurrency, inputAmountCents: amountCents, fromCurrency, toCurrency }, session.email, note);
    if (!r.ok) return NextResponse.json({ ok: false, error: r.reason }, { status: 400 });
    await notifyOut(
      "info",
      `FX executed: ${fxLine(r)}`,
      `${who} converted manually @ ${r.rate.toFixed(4)} USD/CAD.`,
      { category: "fx", actorEmail: session.email },
    ).catch(() => {});
    return NextResponse.json({ ...r });
  }

  if (action === "dials") {
    const perReq = Number(body.fxMaxPerRequestCents);
    const perWeek = Number(body.fxMaxPerWeekCents);
    const capPct = Number(body.usdAllocationCapPct);
    const okInt = (n: number, max: number) => Number.isInteger(n) && n >= 0 && n <= max;
    if (!okInt(perReq, 100_000_00) || !okInt(perWeek, 100_000_00) || !okInt(capPct, 100)) {
      return NextResponse.json({ error: "Dials must be non-negative integers (caps in cents ≤ $100k; cap % 0–100)." }, { status: 400 });
    }
    const before = await prisma.settings.findUnique({ where: { id: 1 } });
    const changes: string[] = [];
    if (before && before.fxMaxPerRequestCents !== perReq) changes.push(`per-request ${before.fxMaxPerRequestCents ? money(before.fxMaxPerRequestCents) : "∞"} → ${perReq ? money(perReq) : "∞"}`);
    if (before && before.fxMaxPerWeekCents !== perWeek) changes.push(`per-week ${before.fxMaxPerWeekCents ? money(before.fxMaxPerWeekCents) : "∞"} → ${perWeek ? money(perWeek) : "∞"}`);
    if (before && before.usdAllocationCapPct !== capPct) changes.push(`USD cap ${before.usdAllocationCapPct}% → ${capPct}%`);
    await prisma.settings.update({
      where: { id: 1 },
      data: { fxMaxPerRequestCents: perReq, fxMaxPerWeekCents: perWeek, usdAllocationCapPct: capPct, updatedBy: session.email },
    });
    if (changes.length) {
      await prisma.journalEntry.create({ data: { kind: "SYSTEM", title: `FX limits changed by ${who}`, body: changes.join("; ") + "." } });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action. Use approve | reject | convert | dials." }, { status: 400 });
}
