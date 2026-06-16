import { NextResponse } from "next/server";
import { fmpEnabled, fmpIndices, type IndexQuote } from "@/lib/fmp";

export const dynamic = "force-dynamic";

// Live market-indices strip for the Today page (TSX/S&P/DJIA/NASDAQ/Gold/Oil).
// Cookie-gated by middleware (no Bearer entry). A short in-process cache means
// many open tabs share one FMP hit while the strip polls until the close.
let cache: { at: number; data: IndexQuote[] } | null = null;

export async function GET() {
  if (!fmpEnabled()) return NextResponse.json({ indices: [] });
  if (cache && Date.now() - cache.at < 10_000) return NextResponse.json({ indices: cache.data });
  const data = await fmpIndices().catch(() => [] as IndexQuote[]);
  if (data.length > 0) cache = { at: Date.now(), data };
  return NextResponse.json({ indices: data });
}
