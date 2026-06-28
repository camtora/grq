import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { memberFromRequest } from "@/lib/session";
import { MODELS } from "@/agent/policy";
import { modelLabel } from "@/lib/race/models";

// Create an Options Desk + its two arms. Member-only. A desk is ALWAYS a control (Opus, stock-only)
// vs a treatment (Opus + buy-to-open options) — the only difference between them is the options power
// (docs/THE-OPTIONS-DESK.md §12). The desk starts RUNNING; the engine picks it up at the next
// market-open tick. A pure sandbox — never touches the real fund.
export const dynamic = "force-dynamic";

const CADENCES = new Set(["daily", "hourly"]);

export async function POST(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only — read-only access." }, { status: 403 });

  let body: { name?: unknown; cadence?: unknown; startingStakeCents?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const name = String(body.name ?? "").trim().slice(0, 60) || "New Desk";
  const cadence = typeof body.cadence === "string" && CADENCES.has(body.cadence) ? body.cadence : "daily";
  const stake = Number.isFinite(Number(body.startingStakeCents))
    ? Math.max(100_000, Math.min(100_000_000, Math.trunc(Number(body.startingStakeCents))))
    : 5_000_000;

  const model = MODELS.decision; // both arms are the champion; the only difference is the option power
  const desk = await prisma.optionsDesk.create({
    data: {
      name,
      cadence,
      startingStakeCents: stake,
      status: "RUNNING",
      startedAt: new Date(),
      entrants: {
        create: [
          { model, arm: "control", dial: "BALANCED", label: `${modelLabel(model)} · stock-only`, cashCents: stake, status: "ACTIVE" },
          { model, arm: "treatment", dial: "BALANCED", label: `${modelLabel(model)} · options`, cashCents: stake, status: "ACTIVE" },
        ],
      },
    },
  });
  return NextResponse.json({ ok: true, deskId: desk.id });
}
