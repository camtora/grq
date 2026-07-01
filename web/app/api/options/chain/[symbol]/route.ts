import { NextResponse } from "next/server";
import { sessionFromRequest } from "@/lib/session";
import { fetchOptionChain } from "@/lib/options/cboe";
import { markContractCents, daysToExpiry } from "@/lib/options/price";
import { bareUsTicker } from "@/lib/options/order";

// Live US option chain for the education-portal calculator (docs/OPTIONS-PORTAL.md). Wraps the free,
// keyless CBOE feed so the client can prefill REAL strikes/premiums/IV by typing a ticker. Read-only —
// any signed-in session may read (viewers included); it's a market-data lookup, never an order path.
// US-only: a name CBOE doesn't carry returns { spotCents: null, … } and the UI shows the honest empty
// state (same as the stock-page OptionsPanel). Trimmed to a sensible strike band + ≤1y to keep the
// payload small; premiums are CBOE delayed mid → last → Black-Scholes, the same ladder the desk uses.
export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET(req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Sign in to view this fund." }, { status: 403 });
  const { symbol } = await params;
  if (!/^[A-Za-z0-9.\-]{1,12}$/.test(symbol)) return NextResponse.json({ error: "Invalid symbol." }, { status: 400 });

  const bare = bareUsTicker(symbol);
  const chain = await fetchOptionChain(bare).catch(() => null);
  if (!chain) {
    return NextResponse.json({ symbol: bare, spotCents: null, expiries: [], contracts: [], note: "No listed US options for this name (US-listed optionable names only)." });
  }

  const now = new Date();
  const loBand = chain.spotCents * 0.5;
  const hiBand = chain.spotCents * 1.5;
  const contracts = chain.contracts
    .filter((c) => {
      const dte = daysToExpiry(c.expiry, now);
      return dte >= 1 && dte <= 365 && c.strikeCents >= loBand && c.strikeCents <= hiBand;
    })
    .map((c) => ({
      expiry: c.expiry,
      dte: daysToExpiry(c.expiry, now),
      right: c.type === "C" ? ("CALL" as const) : ("PUT" as const),
      strikeCents: c.strikeCents,
      midCents: markContractCents(c, chain.spotCents, now),
      ivFrac: c.iv > 0 ? c.iv : null,
      delta: c.delta,
      oi: c.oi,
    }));

  const expiries = [...new Set(contracts.map((c) => c.expiry))]
    .map((expiry) => ({ expiry, dte: daysToExpiry(expiry, now) }))
    .sort((a, b) => a.dte - b.dte);

  return NextResponse.json({ symbol: bare, spotCents: chain.spotCents, expiries, contracts });
}
