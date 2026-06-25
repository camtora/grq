import { NextResponse } from "next/server";
import { sessionFromRequest } from "@/lib/session";
import { getPortfolio, PAPER_INCEPTION } from "@/lib/portfolio";
import { startOfEtDay, isMarketOpen, etSessionBounds } from "@/agent/calendar";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Today's NAV tape — the points behind the live, fixed-axis (9:30→16:00) tape on the Today
// page. The page seeds the tape at SSR; this lets <LiveTape> poll it forward so the line +
// "now" dot creep right through the session without a reload. Same math the page does at SSR
// (prior-close NAV snapshot as the open, today's snapshots, closed on the live NAV). Cookie-
// gated by middleware (browser only — deliberately NOT in MOBILE_API); self-guards via
// sessionFromRequest. A 10s in-process cache shares one recompute across open tabs.
type TapeBody = {
  points: { t: number; c: number }[];
  navCents: number;
  dayOpenNavCents: number;
  benchmarkCents: number | null;
  windowStart: number;
  windowEnd: number;
  marketOpen: boolean;
  hasPositions: boolean;
};

let cache: { at: number; body: TapeBody } | null = null;
const TTL_MS = 10_000;

export async function GET(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Sign in to view this fund." }, { status: 403 });

  if (cache && Date.now() - cache.at < TTL_MS) return NextResponse.json(cache.body);

  const start = startOfEtDay();
  const { open, close } = etSessionBounds();
  const [pf, dayOpenSnap, todaySnaps] = await Promise.all([
    getPortfolio(),
    prisma.navSnapshot.findFirst({ where: { at: { lt: start, gte: PAPER_INCEPTION } }, orderBy: { at: "desc" } }),
    prisma.navSnapshot.findMany({ where: { at: { gte: start } }, orderBy: { at: "asc" } }),
  ]);

  const points = todaySnaps.map((s) => ({ t: s.at.getTime(), c: s.navCents }));
  if (dayOpenSnap) points.unshift({ t: dayOpenSnap.at.getTime(), c: dayOpenSnap.navCents });
  // Close the line on the live NAV so the "now" dot sits at the current moment, not the last
  // 2-min snapshot — same guard the Today page applies at SSR.
  if (points.length >= 1 && points[points.length - 1].c !== pf.navCents) {
    points.push({ t: Date.now(), c: pf.navCents });
  }

  const body: TapeBody = {
    points,
    navCents: pf.navCents,
    dayOpenNavCents: dayOpenSnap?.navCents ?? pf.contributionsCents,
    benchmarkCents: pf.benchmarkCents,
    windowStart: open,
    windowEnd: close,
    marketOpen: isMarketOpen(),
    hasPositions: pf.positions.length > 0,
  };
  cache = { at: Date.now(), body };
  return NextResponse.json(body);
}
