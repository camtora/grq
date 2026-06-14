import { headers } from "next/headers";
import { userForEmail, roleForEmail, type GrqUser, type Role } from "./users";

export type Session = { email: string; user: GrqUser | null; role: Role };

/** Identity for server components/route handlers. Middleware already admitted
 *  the request (member or viewer); this answers "who" and "what may they do". */
export async function getSession(): Promise<Session | null> {
  const h = await headers();
  const email = h.get("x-forwarded-email") ?? process.env.GRQ_DEV_EMAIL ?? null;
  const role = roleForEmail(email);
  if (!email || !role) return null;
  return { email: email.toLowerCase(), user: userForEmail(email), role };
}

export function sessionFromRequest(req: Request): Session | null {
  const email = req.headers.get("x-forwarded-email") ?? process.env.GRQ_DEV_EMAIL ?? null;
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
