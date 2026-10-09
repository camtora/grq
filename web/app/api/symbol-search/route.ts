import { NextResponse } from "next/server";
import { memberFromRequest } from "@/lib/session";
import { fmpSearch, fmpEnabled } from "@/lib/fmp";
import { classDash } from "@/lib/universe";

export const dynamic = "force-dynamic";

// Symbol disambiguation for the research search bar (ANET → NYSE:ANET vs others).
// Member-only — it spends FMP quota and feeds the add flow, which is member-only.
export async function GET(req: Request) {
  if (!memberFromRequest(req)) return NextResponse.json({ error: "Members only." }, { status: 403 });
  if (!fmpEnabled()) return NextResponse.json({ matches: [], note: "Search needs the FMP key in .env." });
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 1) return NextResponse.json({ matches: [] });
  // The TSX (and most US sources) write a share class with a dot — HPS.A, BRK.B, REI.UN —
  // but the feed only knows the dash form: the dotted spelling returned nothing, or a
  // different company. Search the spelling the feed has.
  const dashed = /^[A-Za-z0-9]+(\.[A-Za-z]{1,2})+$/.test(q) ? classDash(q) : q;
  const matches = await fmpSearch(dashed);
  return NextResponse.json({ matches: matches.length > 0 || dashed === q ? matches : await fmpSearch(q) });
}
