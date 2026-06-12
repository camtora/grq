import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sessionFromRequest, displayName } from "@/lib/session";
import { money } from "@/lib/money";

export const dynamic = "force-dynamic";

const RISK_LEVELS = ["CAUTIOUS", "BALANCED", "AGGRESSIVE"] as const;
type Risk = (typeof RISK_LEVELS)[number];

export async function PUT(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Not a member." }, { status: 403 });

  let body: { riskLevel?: unknown; feeBudgetCentsMonth?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const riskLevel = body.riskLevel;
  if (typeof riskLevel !== "string" || !RISK_LEVELS.includes(riskLevel as Risk)) {
    return NextResponse.json({ error: "riskLevel must be CAUTIOUS | BALANCED | AGGRESSIVE." }, { status: 400 });
  }
  const budget = body.feeBudgetCentsMonth;
  if (typeof budget !== "number" || !Number.isInteger(budget) || budget < 0 || budget > 1_000_00) {
    return NextResponse.json({ error: "feeBudgetCentsMonth must be an integer between 0 and 100000 ($1,000)." }, { status: 400 });
  }

  const before = await prisma.settings.findUnique({ where: { id: 1 } });
  const who = displayName(session);
  const changes: string[] = [];
  if (before && before.riskLevel !== riskLevel) changes.push(`risk ${before.riskLevel} → ${riskLevel}`);
  if (before && before.feeBudgetCentsMonth !== budget)
    changes.push(`fee budget ${money(before.feeBudgetCentsMonth)} → ${money(budget)}`);

  await prisma.settings.update({
    where: { id: 1 },
    data: {
      riskLevel: riskLevel as Risk,
      feeBudgetCentsMonth: budget,
      updatedBy: session.email,
    },
  });

  if (changes.length > 0) {
    await prisma.journalEntry.create({
      data: {
        kind: "SYSTEM",
        title: `Settings changed by ${who}`,
        body: changes.join("; ") + ". Applies at the next decision.",
      },
    });
  }

  return NextResponse.json({ ok: true });
}
