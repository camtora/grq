import { NextResponse } from "next/server";
import { sessionFromRequest } from "@/lib/session";
import { universeEntry } from "@/lib/universe";
import { fmpEnabled, fmpEarnings, fmpGrades } from "@/lib/fmp";

// Lazy "more info" for an expanded Universe/Watchlist row (Cam, 2026-06-17):
// earnings + analyst ratings, the same FMP data shown on the stock page. Fetched
// on demand (the row expands) so the tables don't pay ~2 FMP calls per name on
// every load. Read-only — any signed-in session may read (viewers included).
export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET(req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Sign in to view this fund." }, { status: 403 });
  const { symbol } = await params;
  if (!/^[A-Za-z0-9.\-]{1,10}$/.test(symbol)) return NextResponse.json({ error: "Invalid symbol." }, { status: 400 });
  if (!fmpEnabled()) return NextResponse.json({ earnings: null, grades: null });
  const entry = await universeEntry(symbol);
  const yahoo = entry?.yahoo ?? symbol.toUpperCase();
  const [earnings, grades] = await Promise.all([
    fmpEarnings(yahoo).catch(() => null),
    fmpGrades(yahoo).catch(() => null),
  ]);
  return NextResponse.json({ earnings, grades });
}
