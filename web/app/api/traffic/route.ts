import { NextResponse } from "next/server";
import { memberFromRequest } from "@/lib/session";
import { isOwner } from "@/lib/users";
import { getUsage } from "@/lib/admin";

// Traffic for GRQ Go (web /traffic parity): who's using GRQ and which sections get
// the views. Owner-only, like the web page. ?days=1|7|30|90 (default 7).
export const dynamic = "force-dynamic";

const WINDOWS = [1, 7, 30, 90];

export async function GET(req: Request) {
  const session = memberFromRequest(req);
  if (!session || !isOwner(session.email)) {
    return NextResponse.json({ error: "Owners only." }, { status: 403 });
  }
  const raw = Number(new URL(req.url).searchParams.get("days"));
  const days = WINDOWS.includes(raw) ? raw : 7;
  const u = await getUsage(days);
  return NextResponse.json({
    days,
    totalViews: u.totalViews,
    uniqueUsers: u.uniqueUsers,
    bySection: u.bySection,
    byUser: u.byUser.map((x) => ({ ...x, lastSeen: x.lastSeen.toISOString() })),
    matrix: u.matrix,
    viewerQuestions: u.viewerQuestions.map((q) => ({ ...q, at: q.at.toISOString() })),
    recent: u.recent.map((r) => ({ ...r, at: r.at.toISOString() })),
  });
}
