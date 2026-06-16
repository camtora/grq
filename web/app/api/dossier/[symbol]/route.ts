import { NextResponse } from "next/server";
import { sessionFromRequest } from "@/lib/session";
import { dossierResponse } from "@/lib/feed";

// Mobile read endpoint (docs/IOS-PLAN.md): the agent's write-up + signals +
// targets for one name. Lives at /api/dossier/[symbol] (NOT /api/stocks) so it
// never collides with the existing mutating /api/stocks/directive route.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Sign in to view this fund." }, { status: 403 });
  const { symbol } = await params;
  if (!/^[A-Za-z0-9.\-]{1,8}$/.test(symbol)) return NextResponse.json({ error: "Invalid symbol." }, { status: 400 });
  const dossier = await dossierResponse(symbol);
  if (!dossier) return NextResponse.json({ error: `${symbol.toUpperCase()} is not tracked.` }, { status: 404 });
  return NextResponse.json(dossier);
}
