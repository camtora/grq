import { NextResponse } from "next/server";
import { sessionFromRequest } from "@/lib/session";
import { isOwner } from "@/lib/users";
import { sectionForPath } from "@/lib/sections";
import { prisma } from "@/lib/db";

// Prisma needs the Node runtime (the Edge default can't reach Postgres).
export const runtime = "nodejs";

// Usage beacon. components/Tracker.tsx POSTs `{ path }` on every client-side
// navigation. Identity is resolved SERVER-SIDE from the session — the client
// never tells us who it is, only where it went. No session → ignore quietly (the
// middleware door already 403s header-less hits; this is just belt-and-braces).
// Always 204s so a logging failure can never surface to the user.
export async function POST(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return new NextResponse(null, { status: 204 });

  let path = "";
  try {
    const body = (await req.json()) as { path?: unknown };
    if (typeof body?.path === "string") path = body.path;
  } catch {
    /* malformed beacon — ignore */
  }
  // Only record real in-app paths; skip junk and our own endpoint.
  if (!path.startsWith("/") || path.startsWith("/api/")) {
    return new NextResponse(null, { status: 204 });
  }

  const role = isOwner(session.email) ? "owner" : session.role;
  // Which client, derived server-side like identity (never self-reported): the
  // oauth2-proxy header means the web (nginx sets it; `|| null` because the mobile
  // bypass clears it to empty); otherwise a Bearer means GRQ Go. Mirrors the
  // resolution order in sessionFromRequest.
  const client = (req.headers.get("x-forwarded-email") || null)
    ? "web"
    : req.headers.get("authorization")?.startsWith("Bearer ")
      ? "app"
      : "web";
  await prisma.pageView
    .create({
      data: {
        email: session.email,
        role,
        path: path.slice(0, 512),
        section: sectionForPath(path),
        client,
      },
    })
    .catch(() => {
      /* never let a logging miss break navigation */
    });

  return new NextResponse(null, { status: 204 });
}
