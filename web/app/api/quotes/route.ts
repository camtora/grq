import { NextResponse } from "next/server";
import { fmpEnabled, fmpBatchQuotes } from "@/lib/fmp";
import { toYahoo } from "@/lib/universe";
import { sessionFromRequest } from "@/lib/session";

export const dynamic = "force-dynamic";

// Fast live-quote endpoint for the on-page ticker AND the live stock tables. Takes
// OUR symbols, maps them to the FMP listing (.TO for TSX), batch-fetches from FMP,
// returns keyed by our symbol. A 1.5s in-process cache means many open tabs on the
// same symbol set share one FMP hit. The whole-table live overlay sends every symbol
// on the page in one request, so we accept large sets and chunk the FMP fan-out
// ourselves (FMP's batch-quote-short takes many per call, but a single URL with
// hundreds of tickers risks length limits) instead of silently truncating at 60.
type Q = { priceCents: number; changePct: number };
const MAX_SYMBOLS = 300; // a sane ceiling so one request can't ask for the world
const FMP_CHUNK = 100; // symbols per FMP batch-quote-short call
let cache: { at: number; key: string; data: Record<string, Q> } | null = null;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function GET(req: Request) {
  // Identity required (cookie on web, GRQ-JWT Bearer on mobile). The edge admits any
  // Bearer-present mobile request without verifying it, so guard here — otherwise this
  // becomes an open FMP-quota proxy for anyone who sends an "Authorization" header.
  if (!sessionFromRequest(req)) return NextResponse.json({ quotes: {} }, { status: 401 });

  const url = new URL(req.url);
  const syms = (url.searchParams.get("symbols") ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, MAX_SYMBOLS);
  if (syms.length === 0 || !fmpEnabled()) return NextResponse.json({ quotes: {} });

  const key = syms.join(",");
  if (cache && cache.key === key && Date.now() - cache.at < 1500) {
    return NextResponse.json({ quotes: cache.data });
  }

  // Map our symbols → FMP listings in parallel (toYahoo can touch the DB; a serial
  // loop over hundreds would crawl).
  const fmpToOurs = new Map<string, string>();
  const fmpSyms = await Promise.all(syms.map((s) => toYahoo(s).then((y) => y.toUpperCase())));
  syms.forEach((s, i) => fmpToOurs.set(fmpSyms[i], s));

  const batches = await Promise.all(chunk(fmpSyms, FMP_CHUNK).map((c) => fmpBatchQuotes(c)));
  const data: Record<string, Q> = {};
  for (const q of batches.flat()) {
    const ours = fmpToOurs.get(q.symbol.toUpperCase()) ?? q.symbol;
    data[ours] = { priceCents: q.priceCents, changePct: q.changePct };
  }
  cache = { at: Date.now(), key, data };
  return NextResponse.json({ quotes: data });
}
