import { NextResponse } from "next/server";
import { sessionFromRequest } from "@/lib/session";
import { todayResponse } from "@/lib/feed";

// Mobile read endpoint (docs/IOS-PLAN.md): The Daily — edition is computed live
// (morning/midday/evening/weekend in ET), NAV/tape/movers from today's data.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// The feed fans out to a dozen live FMP calls (~9s uncached) and every app open
// hits it — a short shared cache makes opens snappy and saves FMP quota. The
// response is identical for every member (no personalization), so one cache
// serves both. In-process: a container restart just repopulates it.
let cache: { at: number; body: unknown } | null = null;
const TTL_MS = 60_000;
let inflight: Promise<unknown> | null = null;

export async function GET(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Sign in to view this fund." }, { status: 403 });
  if (cache && Date.now() - cache.at < TTL_MS) return NextResponse.json(cache.body);
  // Collapse concurrent cold hits into one upstream build.
  if (!inflight) {
    inflight = todayResponse()
      .then((body) => {
        cache = { at: Date.now(), body };
        return body;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return NextResponse.json(await inflight);
}
