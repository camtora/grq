import { headers } from "next/headers";
import { userForEmail, roleForEmail, type GrqUser, type Role } from "./users";
import { emailFromGrqToken, bearerToken } from "./auth-jwt";

export type Session = { email: string; user: GrqUser | null; role: Role };

/** Resolve the request's email. The browser path is oauth2-proxy's
 *  X-Forwarded-Email (set upstream, never client-supplied through the front
 *  door). The mobile path has no cookie, so it falls back to a verified GRQ-JWT
 *  Bearer token (docs/IOS-PLAN.md). Dev fallback last. */
function emailFromHeaders(h: { get(name: string): string | null }): string | null {
  const forwarded = h.get("x-forwarded-email");
  if (forwarded) return forwarded;
  const authz = h.get("authorization");
  const token = authz ? /^Bearer\s+(.+)$/i.exec(authz.trim())?.[1]?.trim() ?? null : null;
  return emailFromGrqToken(token) ?? process.env.GRQ_DEV_EMAIL ?? null;
}

/** Identity for server components/route handlers. Middleware already admitted
 *  the request (member or viewer); this answers "who" and "what may they do". */
export async function getSession(): Promise<Session | null> {
  const h = await headers();
  const email = emailFromHeaders(h);
  const role = roleForEmail(email);
  if (!email || !role) return null;
  return { email: email.toLowerCase(), user: userForEmail(email), role };
}

export function sessionFromRequest(req: Request): Session | null {
  // `|| null`: a present-but-empty X-Forwarded-Email (e.g. the nginx mobile
  // bypass clears it) must fall through to the Bearer token, not short-circuit
  // `??` with "". The oauth2-proxy header still wins whenever it carries a value.
  const email =
    (req.headers.get("x-forwarded-email") || null) ??
    emailFromGrqToken(bearerToken(req)) ??
    process.env.GRQ_DEV_EMAIL ??
    null;
  const role = roleForEmail(email);
  if (!email || !role) return null;
  return { email: email.toLowerCase(), user: userForEmail(email), role };
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

export function displayName(s: Session | null): string {
  return s?.user?.name ?? s?.email ?? "unknown";
}
