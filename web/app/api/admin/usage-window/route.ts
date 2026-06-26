import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { memberFromRequest } from "@/lib/session";
import { isOwner } from "@/lib/users";
import { resolveEtClockToInstant, getCurrentWindowBurn } from "@/lib/usage";

export const dynamic = "force-dynamic";

// Owner-only live read of the CURRENT 5h window's burn — polled by RollingWindowPanel so the token
// number stays in lockstep with the live clock (the page's one-shot prop went stale between
// boundary refreshes). Cheap sum-only query; returns the window bounds it summed over.
export async function GET(req: Request) {
  const session = memberFromRequest(req);
  if (!session || !isOwner(session.email)) {
    return NextResponse.json({ error: "Owner only." }, { status: 403 });
  }
  const burn = await getCurrentWindowBurn();
  return NextResponse.json({
    tokensBurned: burn.tokensBurned,
    calls: burn.calls,
    windowStart: burn.window ? burn.window.start.toISOString() : null,
    reset: burn.window ? burn.window.reset.toISOString() : null,
    anchorResetAt: burn.anchorResetAt ? burn.anchorResetAt.toISOString() : null,
    generatedAt: burn.generatedAt.toISOString(),
  });
}

// Owner-only (same lock as /admin/usage): set or clear the manual 5-hour usage-window reset
// instant. Body { time: "HH:MM" } (ET clock time → next future occurrence) or { clear: true }.
export async function POST(req: Request) {
  const session = memberFromRequest(req);
  if (!session || !isOwner(session.email)) {
    return NextResponse.json({ error: "Owner only." }, { status: 403 });
  }

  let body: { time?: unknown; clear?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  let resetAt: Date | null;
  if (body.clear === true) {
    resetAt = null;
  } else if (typeof body.time === "string") {
    resetAt = resolveEtClockToInstant(body.time);
    if (!resetAt) return NextResponse.json({ error: "Expected time as \"HH:MM\" (24h, ET)." }, { status: 400 });
  } else {
    return NextResponse.json({ error: "Expected { time: \"HH:MM\" } or { clear: true }." }, { status: 400 });
  }

  await prisma.settings.update({
    where: { id: 1 },
    data: { maxWindowResetAt: resetAt, updatedBy: session.email },
  });

  return NextResponse.json({ ok: true, resetAt: resetAt ? resetAt.toISOString() : null });
}
