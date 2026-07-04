import { NextResponse } from "next/server";
import { memberFromRequest } from "@/lib/session";
import { isOwner } from "@/lib/users";
import { getUsageDashboard } from "@/lib/usage";
import { etDateStr } from "@/agent/calendar";
import { modelLabel } from "@/lib/race/models";

// Token usage for GRQ Go (web /tokens parity): what the autonomous agent spends of
// Cam's shared Claude Max quota. Owner-only. ?d=YYYY-MM-DD views a past ET day.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = memberFromRequest(req);
  if (!session || !isOwner(session.email)) {
    return NextResponse.json({ error: "Owners only." }, { status: 403 });
  }
  const sp = new URL(req.url).searchParams;
  const valid = sp.get("d") && /^\d{4}-\d{2}-\d{2}$/.test(sp.get("d")!);
  const viewAnchor = valid ? new Date(`${sp.get("d")}T12:00:00Z`) : undefined;
  const { today, byModel, rolling5h, recent, maxFiveH, window, anchorResetAt, generatedAt, isToday } =
    await getUsageDashboard(40, viewAnchor);

  return NextResponse.json({
    dateStr: etDateStr(viewAnchor ?? new Date()),
    isToday,
    generatedAt: generatedAt.toISOString(),
    maxFiveH,
    windowStart: window ? window.start.toISOString() : null,
    anchorResetAt: anchorResetAt ? anchorResetAt.toISOString() : null,
    totals: today.totals,
    byGroup: today.byGroup,
    byModel: byModel.map((m) => ({
      group: m.group,
      label: modelLabel(m.group),
      openRouter: m.group.includes("/"), // slash-named challengers bill real $; claude-* ride the Max flat fee
      calls: m.calls,
      total: m.total,
      costMicroUsd: m.costMicroUsd,
    })),
    rolling5h: { total: rolling5h.total, calls: rolling5h.calls },
    recent: recent.map((r) => ({
      id: r.id,
      at: r.at.toISOString(),
      label: r.label,
      numTurns: r.numTurns,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      cacheReadTokens: r.cacheReadTokens,
      total: r.total,
      durationMs: r.durationMs,
      status: r.status,
    })),
  });
}
