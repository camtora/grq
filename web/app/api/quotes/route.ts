import { NextResponse } from "next/server";
import { fmpEnabled, fmpBatchQuotes } from "@/lib/fmp";
import { toYahoo } from "@/lib/universe";

export const dynamic = "force-dynamic";

// Fast live-quote endpoint for the on-page ticker. Takes OUR symbols, maps them
// to the FMP listing (.TO for TSX), batch-fetches from FMP, returns keyed by our
// symbol. A 1.5s in-process cache means many open tabs share one FMP hit.
type Q = { priceCents: number; changePct: number };
let cache: { at: number; key: string; data: Record<string, Q> } | null = null;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const syms = (url.searchParams.get("symbols") ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 60);
  if (syms.length === 0 || !fmpEnabled()) return NextResponse.json({ quotes: {} });

  const key = syms.join(",");
  if (cache && cache.key === key && Date.now() - cache.at < 1500) {
    return NextResponse.json({ quotes: cache.data });
  }

  const fmpToOurs = new Map<string, string>();
  const fmpSyms: string[] = [];
  for (const s of syms) {
    const y = (await toYahoo(s)).toUpperCase();
    fmpToOurs.set(y, s);
    fmpSyms.push(y);
  }
  const live = await fmpBatchQuotes(fmpSyms);
  const data: Record<string, Q> = {};
  for (const q of live) {
    const ours = fmpToOurs.get(q.symbol.toUpperCase()) ?? q.symbol;
    data[ours] = { priceCents: q.priceCents, changePct: q.changePct };
  }
  cache = { at: Date.now(), key, data };
  return NextResponse.json({ quotes: data });
}
