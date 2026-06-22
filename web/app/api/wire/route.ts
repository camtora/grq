import { NextResponse } from "next/server";
import { sessionFromRequest } from "@/lib/session";
import { wireResponse } from "@/lib/feed";

// Mobile read endpoint — The Wire: the discovery feed (finds + dossiers + watchlist
// adds + market news + literacy lessons), woven into one scrollable stream. v1 is
// shared + read-only (no per-user state). See shared/contract.ts WireResponse.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Sign in to view this fund." }, { status: 403 });
  return NextResponse.json(await wireResponse());
}
