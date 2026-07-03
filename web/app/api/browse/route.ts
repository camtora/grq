import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sessionFromRequest } from "@/lib/session";

// GET /api/browse — the Market Base Layer screen for GRQ Go's Browse page
// (docs/MARKET-BASE-LAYER.md): the Tier-0 deterministic ranking with the
// Tier-1 Haiku tag/take where present. Top slice only; whole-market SEARCH
// stays /api/symbol-search and adds live on the Watchlist page.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Sign in to view this fund." }, { status: 403 });

  const rows = await prisma.marketScreen.findMany({
    orderBy: { screenScore: "desc" },
    take: 80,
  });
  return NextResponse.json({
    rows: rows.map((r) => ({
      symbol: r.symbol,
      name: r.name,
      exchange: r.exchange,
      sector: r.sector,
      marketCapM: r.marketCapM,
      priceCents: r.priceCents,
      currency: r.currency,
      screenScore: r.screenScore,
      tag: r.tag,
      take: r.take,
    })),
    total: await prisma.marketScreen.count(),
  });
}
