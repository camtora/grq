import { NextResponse } from "next/server";
import { sessionFromRequest } from "@/lib/session";
import { wireResponse, wireMoreResponse } from "@/lib/feed";

// Mobile read endpoint — The Wire: the discovery feed (finds + dossiers + watchlist
// adds + market news + literacy lessons), woven into one scrollable stream. Going
// social: the watch lane is viewer-aware (hides your own watches, shows the other
// member's). See shared/contract.ts WireResponse.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Sign in to view this fund." }, { status: 403 });
  // ?seed&page → the infinite research shelf (past the curated feed, the app
  // keeps scrolling through everything we hold a dossier on, shuffled per session).
  const url = new URL(req.url);
  const pageRaw = url.searchParams.get("page");
  if (pageRaw !== null) {
    const page = Math.max(0, Number(pageRaw) || 0);
    const seed = Math.max(0, Number(url.searchParams.get("seed")) || 1);
    return NextResponse.json(await wireMoreResponse(seed, page));
  }
  return NextResponse.json(await wireResponse(session.email));
}
