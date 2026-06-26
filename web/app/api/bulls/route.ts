import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { memberFromRequest } from "@/lib/session";
import { modelLabel } from "@/lib/race/models";

// Create a Bull Race + its entrants. Member-only. The race starts RUNNING; the engine picks it up
// at the next market-open tick. A pure sandbox — never touches the real fund.
export const dynamic = "force-dynamic";

const DIALS = new Set(["CAUTIOUS", "BALANCED", "AGGRESSIVE"]);
const CADENCES = new Set(["daily", "hourly"]);

export async function POST(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return NextResponse.json({ error: "Members only — read-only access." }, { status: 403 });

  let body: { name?: unknown; cadence?: unknown; startingStakeCents?: unknown; bulls?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const name = String(body.name ?? "").trim().slice(0, 60) || "New Race";
  const cadence = typeof body.cadence === "string" && CADENCES.has(body.cadence) ? body.cadence : "daily";
  const stake = Number.isFinite(Number(body.startingStakeCents))
    ? Math.max(100_000, Math.min(100_000_000, Math.trunc(Number(body.startingStakeCents))))
    : 2_500_000;

  const bullsIn = Array.isArray(body.bulls) ? (body.bulls as Array<Record<string, unknown>>) : [];
  if (bullsIn.length === 0) return NextResponse.json({ error: "Pick at least one bull." }, { status: 400 });
  if (bullsIn.length > 20) return NextResponse.json({ error: "Too many bulls (max 20)." }, { status: 400 });

  const entrants = bullsIn
    .map((b) => {
      const model = String(b.model ?? "").trim();
      const dial = typeof b.dial === "string" && DIALS.has(b.dial) ? b.dial : "BALANCED";
      const persona = b.persona ? String(b.persona).slice(0, 240) : null;
      const label = (b.label ? String(b.label).slice(0, 60).trim() : "") || modelLabel(model);
      return { model, dial, persona, label, cashCents: stake };
    })
    .filter((b) => b.model);
  if (entrants.length === 0) return NextResponse.json({ error: "No valid bulls." }, { status: 400 });

  const race = await prisma.race.create({
    data: { name, cadence, startingStakeCents: stake, status: "RUNNING", startedAt: new Date(), entrants: { create: entrants } },
  });
  return NextResponse.json({ ok: true, raceId: race.id });
}
