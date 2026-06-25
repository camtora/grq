import { NextResponse } from "next/server";
import { sessionFromRequest } from "@/lib/session";
import { getPortfolio, PAPER_INCEPTION } from "@/lib/portfolio";
import { startOfEtDay, isMarketDay } from "@/agent/calendar";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// The fund's live day % for the Today "GRQ vs markets" comparison row — the same math the
// Today page does at SSR (nav vs the prior close's NAV snapshot), exposed so the row can poll
// alongside the indices strip. Cookie-gated by middleware (browser only — deliberately NOT in
// MOBILE_API); self-guards via sessionFromRequest. A 10s in-process cache shares one recompute
// across open tabs. Returns dayPnlPct as a FRACTION (e.g. 0.0082 = +0.82%).
let cache: { at: number; dayPnlPct: number; marketDay: boolean } | null = null;
const TTL_MS = 10_000;

export async function GET(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Sign in to view this fund." }, { status: 403 });

  if (cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json({ dayPnlPct: cache.dayPnlPct, marketDay: cache.marketDay });
  }

  const marketDay = isMarketDay();
  const [pf, dayOpenSnap] = await Promise.all([
    getPortfolio(),
    prisma.navSnapshot.findFirst({ where: { at: { lt: startOfEtDay(), gte: PAPER_INCEPTION } }, orderBy: { at: "desc" } }),
  ]);
  const dayOpenNav = dayOpenSnap?.navCents ?? pf.contributionsCents;
  const dayPnlPct = marketDay && dayOpenNav > 0 ? (pf.navCents - dayOpenNav) / dayOpenNav : 0;

  cache = { at: Date.now(), dayPnlPct, marketDay };
  return NextResponse.json({ dayPnlPct, marketDay });
}
