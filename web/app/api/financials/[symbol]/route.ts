import { NextResponse } from "next/server";
import { sessionFromRequest } from "@/lib/session";
import { universeEntry } from "@/lib/universe";
import { fmpEnabled } from "@/lib/fmp";
import { financialsView } from "@/lib/financials/view";
import { ensureFinancials, getStatus } from "@/lib/financials/store";

// Company financials for one stock page (D140): statements + growth, estimates + revisions, health,
// segments, the last earnings call's summary, filings, insider stats. Read-only; any signed-in session
// may read it, users included — these are research numbers, not the book, and the call summary is
// written from the transcript alone (Cam, 2026-10-22). A name the daily job doesn't track is fetched
// on demand: FMP only, never Claude (docs/COMPANY-FINANCIALS.md §3.9).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STALE_MS = 7 * 86_400_000;

export async function GET(req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Sign in to view this fund." }, { status: 403 });
  const { symbol } = await params;
  if (!/^[A-Za-z0-9.\-]{1,12}$/.test(symbol)) return NextResponse.json({ error: "Invalid symbol." }, { status: 400 });
  const entry = await universeEntry(symbol);
  const key = (entry?.yahoo ?? symbol).toUpperCase(); // the FMP key is the listing symbol (P0 R1)
  if (fmpEnabled()) {
    const st = await getStatus(key);
    if (!st?.statementsAt || Date.now() - st.statementsAt.getTime() > STALE_MS) {
      await ensureFinancials(key).catch((e) => console.error(`[financials] on-demand ${key}:`, e instanceof Error ? e.message : e));
    }
  }
  return NextResponse.json({ symbol: key, ...(await financialsView(key)) });
}
