import { NextResponse } from "next/server";
import { fetchIntradayBars, type IntradayPoint } from "@/lib/broker/yahoo";

export const dynamic = "force-dynamic";

// Today's intraday line for the stock-page chart's "1D" range — fetched lazily by
// PriceChart only when a member picks 1D. Cookie-authenticated (not in MOBILE_API),
// like /api/quotes. A short in-process cache shares one Yahoo hit across open tabs.
// Each point carries its session (pre/regular/post) so the chart greys extended hours.
type Cached = { at: number; points: IntradayPoint[] };
const cache = new Map<string, Cached>();
const TTL_MS = 60_000;

export async function GET(req: Request) {
  const symbol = (new URL(req.url).searchParams.get("symbol") ?? "").trim().toUpperCase();
  if (!symbol) return NextResponse.json({ points: [] });

  const hit = cache.get(symbol);
  if (hit && Date.now() - hit.at < TTL_MS) return NextResponse.json({ points: hit.points });

  const points = await fetchIntradayBars(symbol).catch(() => []);
  cache.set(symbol, { at: Date.now(), points });
  return NextResponse.json({ points });
}
