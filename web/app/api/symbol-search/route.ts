import { NextResponse } from "next/server";
import { memberFromRequest } from "@/lib/session";
import { fmpSearch, fmpEnabled } from "@/lib/fmp";

export const dynamic = "force-dynamic";

// Symbol disambiguation for the research search bar (ANET → NYSE:ANET vs others).
// Member-only — it spends FMP quota and feeds the add flow, which is member-only.
export async function GET(req: Request) {
  if (!memberFromRequest(req)) return NextResponse.json({ error: "Members only." }, { status: 403 });
  if (!fmpEnabled()) return NextResponse.json({ matches: [], note: "Search needs the FMP key in .env." });
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 1) return NextResponse.json({ matches: [] });
  return NextResponse.json({ matches: await fmpSearch(q) });
}
