import { NextResponse } from "next/server";
import { fmpEnabled, fmpIndices, fmpCadUsd, type IndexQuote, type FxQuote } from "@/lib/fmp";

export const dynamic = "force-dynamic";

// Live market-indices strip for the Today page (TSX/S&P/DJIA/NASDAQ/Gold/Oil) + the live CAD/USD
// rate shown in the strip header. Cookie-gated by middleware (no Bearer entry). A short in-process
// cache means many open tabs share one FMP hit while the strip polls until the close.
let cache: { at: number; data: IndexQuote[]; fx: FxQuote | null } | null = null;

export async function GET() {
  if (!fmpEnabled()) return NextResponse.json({ indices: [], fx: null });
  if (cache && Date.now() - cache.at < 10_000) return NextResponse.json({ indices: cache.data, fx: cache.fx });
  const [data, fx] = await Promise.all([
    fmpIndices().catch(() => [] as IndexQuote[]),
    fmpCadUsd().catch(() => null),
  ]);
  if (data.length > 0) cache = { at: Date.now(), data, fx };
  return NextResponse.json({ indices: data, fx });
}
