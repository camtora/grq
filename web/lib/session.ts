import { headers } from "next/headers";
import { userForEmail, isAllowed, type GrqUser } from "./users";

export type Session = { email: string; user: GrqUser | null };

/** Identity for server components/route handlers. Middleware already gated
 *  access; this just answers "who". */
export async function getSession(): Promise<Session | null> {
  const h = await headers();
  const email =
    h.get("x-forwarded-email") ?? process.env.GRQ_DEV_EMAIL ?? null;
  if (!email || !isAllowed(email)) return null;
  return { email: email.toLowerCase(), user: userForEmail(email) };
}

export function sessionFromRequest(req: Request): Session | null {
  const email =
    req.headers.get("x-forwarded-email") ?? process.env.GRQ_DEV_EMAIL ?? null;
  if (!email || !isAllowed(email)) return null;
  return { email: email.toLowerCase(), user: userForEmail(email) };
}

export function displayName(s: Session | null): string {
  return s?.user?.name ?? s?.email ?? "unknown";
}
