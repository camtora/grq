import { prisma } from "./db";

// The door's access log — written by middleware.ts for every request it handles. House rule
// (~/.claude/CLAUDE.md, "access logs, everywhere"): who, from where, what, with what, when,
// queryable per user, and echoed as a JSON line on stdout so `docker logs grq-web` has it too.
//
// ONE NAMED DEVIATION from "every request": an ADMITTED background poll is not logged. GRQ's
// open tabs poll a handful of endpoints every few seconds (notifications and messages alone
// were ~14,000 requests a day with one person signed in), and Postgres shares a 60 GB volume
// with Docker that has filled before. Those rows would say nothing a page view doesn't. A
// REFUSED request is always logged, poll or not — that is the part nothing else records.

export type Refusal = "removed" | "no-identity" | "members-only";

const POLLS = [
  "/api/notifications",
  "/api/messages",
  "/api/quotes",
  "/api/indices",
  "/api/intraday",
  "/api/fund-day",
  "/api/hunt/status",
  "/api/chess/status",
  "/api/track",
];

const RETENTION_DAYS = 180;
let prunedAt = 0;

export function isPoll(path: string): boolean {
  return POLLS.some((p) => path === p || path.startsWith(p + "/"));
}

export function logAccess(
  req: { method: string; headers: Headers; nextUrl: { pathname: string; search: string } },
  who: { email: string | null; role: string | null; client: "web" | "app" | null; outcome: Refusal | null },
): void {
  const path = req.nextUrl.pathname;
  if (!who.outcome && isPoll(path)) return;
  const h = req.headers;
  const row = {
    email: who.email ? who.email.trim().toLowerCase().slice(0, 320) : null,
    role: who.role,
    outcome: who.outcome,
    client: who.client,
    ip: (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null,
    method: req.method,
    path: path.slice(0, 1000),
    query: req.nextUrl.search ? req.nextUrl.search.slice(1, 2000) : null,
    userAgent: h.get("user-agent")?.slice(0, 500) || null,
    referer: h.get("referer")?.slice(0, 500) || null,
  };
  console.log(JSON.stringify({ access: true, at: new Date().toISOString(), ...row }));
  // Never awaited: a request is not slowed or failed by its own log line.
  prisma.accessLog.create({ data: row }).catch((e: unknown) => console.error(`access log write failed: ${(e as Error).message}`));

  if (Date.now() - prunedAt > 3600_000) {
    prunedAt = Date.now();
    prisma.accessLog
      .deleteMany({ where: { at: { lt: new Date(Date.now() - RETENTION_DAYS * 864e5) } } })
      .catch(() => undefined);
  }
}
