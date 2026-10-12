import { headers } from "next/headers";
import { userForEmail, roleForEmail, type GrqUser, type Role } from "./users";
import { emailFromGrqToken, bearerToken } from "./auth-jwt";
import { displayNameForEmail } from "./sso-names";

export type Session = { email: string; user: GrqUser | null; role: Role };

/** The local-dev identity fallback. NEVER in production: there it would hand GRQ_DEV_EMAIL's
 *  role to any request that got past the door without an identity (a junk Bearer on a mobile
 *  route). The middleware already had this guard; the session resolvers did not. */
export function devEmail(): string | null {
  return process.env.NODE_ENV !== "production" ? (process.env.GRQ_DEV_EMAIL ?? null) : null;
}

/** Resolve the request's identity. The browser path is oauth2-proxy's
 *  X-Forwarded-Email (set upstream, never client-supplied through the front
 *  door). The mobile path has no cookie, so it falls back to a verified GRQ-JWT
 *  Bearer token (docs/IOS-PLAN.md). Dev fallback last.
 *
 *  A Bearer token is honoured ONLY while its address is still a member. The app is
 *  members-only, and its API routes never pass the middleware's user-tier path check
 *  (middleware sees no email on a Bearer request and waves the mobile routes through).
 *  With the user tier open to everyone (D133, `*`), a REMOVED member's still-valid token
 *  would otherwise resolve to "user" and read /api/portfolio, /api/reports, /api/today —
 *  the book — for up to a year of sliding refreshes. Found and closed 2026-10-11, before
 *  anyone had been removed; pinned by test/bearer-members-only.test.ts.
 *
 *  `|| null`: a present-but-empty X-Forwarded-Email (the nginx mobile bypass clears it)
 *  must fall through to the Bearer token rather than short-circuit with "". */
export function resolveIdentity(forwarded: string | null, token: string | null): { email: string; role: Role } | null {
  const viaHeader = forwarded || null;
  if (viaHeader) {
    const role = roleForEmail(viaHeader);
    return role ? { email: viaHeader.toLowerCase(), role } : null;
  }
  const viaToken = emailFromGrqToken(token);
  if (viaToken) return roleForEmail(viaToken) === "member" ? { email: viaToken.toLowerCase(), role: "member" } : null;
  const dev = devEmail();
  const role = roleForEmail(dev);
  return dev && role ? { email: dev.toLowerCase(), role } : null;
}

/** Identity for server components/route handlers. Middleware already admitted
 *  the request (member or viewer); this answers "who" and "what may they do". */
export async function getSession(): Promise<Session | null> {
  const h = await headers();
  const authz = h.get("authorization");
  const token = authz ? /^Bearer\s+(.+)$/i.exec(authz.trim())?.[1]?.trim() ?? null : null;
  const id = resolveIdentity(h.get("x-forwarded-email"), token);
  return id ? { ...id, user: userForEmail(id.email) } : null;
}

export function sessionFromRequest(req: Request): Session | null {
  const id = resolveIdentity(req.headers.get("x-forwarded-email"), bearerToken(req));
  return id ? { ...id, user: userForEmail(id.email) } : null;
}

/** The write-lock. Returns a session ONLY for members; viewers (read-only
 *  allowlisted users) get null, so any mutating route 403s them. Hiding the UI
 *  is cosmetic — THIS is the enforcement. Use this in every write handler. */
export function memberFromRequest(req: Request): Session | null {
  const s = sessionFromRequest(req);
  return s && s.role === "member" ? s : null;
}

export function isMember(s: Session | null): boolean {
  return s?.role === "member";
}

/** Whether a session may see the fund's BOOK — positions, NAV, P&L, fills, the decision
 *  trail, reports, the members' accounts, Alfred's chat. Members and viewers: yes. A USER
 *  (D122 — an outside learner on GRQ_USER_EMAILS): never. A page the door admits a user to
 *  gates every book fragment on this; the door itself (middleware + lib/access.ts) keeps
 *  users off the pages and routes that are nothing BUT the book. */
export function seesBook(s: Session | null): boolean {
  return !!s && s.role !== "user";
}

/** sessionFromRequest, minus users — for a route that hands the book to anyone signed in
 *  (chat: Alfred's read-only tools include the portfolio). null → 403 it. */
export function bookSessionFromRequest(req: Request): Session | null {
  const s = sessionFromRequest(req);
  return s && s.role !== "user" ? s : null;
}

export function displayName(s: Session | null): string {
  return s ? displayNameForEmail(s.email) : "unknown";
}
