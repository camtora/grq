import jwt from "jsonwebtoken";

// GRQ-JWT: the mobile app's session token (docs/IOS-PLAN.md). The native app has
// no oauth2-proxy cookie, so it proves identity with a Bearer token instead: it
// trades a Google ID token (verified in /api/auth/google) for one of these, then
// session.ts resolves the email from it. Everything downstream — roleForEmail,
// memberFromRequest, the kill switch, the order gate — is unchanged.
//
// Signed with GRQ_JWT_SECRET (HS256). Rotating the secret invalidates every issued token.
//
// SLIDING SESSION (D125, 2026-09-12). A token lives 30 days, and /api/auth/me — which the app calls
// on every cold start — hands back a FRESH 30-day token once the presented one is over a day old
// (refreshGrqToken). So a phone that gets opened stays signed in; only a phone untouched for 30
// days has to sign in again. Bounded: every token carries `orig`, the epoch of the ORIGINAL Google
// sign-in, and nothing refreshes past MAX_SESSION_SECONDS from it — a refreshed token can't roll
// forever. Before this, the 30-day hard expiry with no refresh signed Graham out on 2026-08-27 and
// would have signed Cam out on 2026-10-11 (the "kicked from the app" report).

const ISSUER = "grq";
const AUDIENCE = "grq-ios";
export const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days per token
export const REFRESH_AFTER_SECONDS = 60 * 60 * 24; // don't re-mint on every launch — once a day is plenty
export const MAX_SESSION_SECONDS = 60 * 60 * 24 * 365; // absolute ceiling from the original sign-in

export function jwtConfigured(): boolean {
  return !!process.env.GRQ_JWT_SECRET;
}

function secret(): string {
  const s = process.env.GRQ_JWT_SECRET;
  if (!s) throw new Error("GRQ_JWT_SECRET is not set");
  return s;
}

/** Mint a session token for an already-authenticated member email. `orig` = the epoch seconds of
 *  the original Google sign-in this session descends from (defaults to now); a refresh carries the
 *  old one forward so the absolute ceiling holds. `iat` is overridable for tests only. */
export function signGrqToken(email: string, opts: { orig?: number; iat?: number } = {}): string {
  const iat = opts.iat ?? Math.floor(Date.now() / 1000);
  return jwt.sign({ email: email.trim().toLowerCase(), orig: opts.orig ?? iat, iat }, secret(), {
    algorithm: "HS256",
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: TTL_SECONDS,
  });
}

export type GrqClaims = { email: string; iat: number; exp: number; orig: number };

/** Verify a token and return its claims, or null if missing/invalid/expired. Tokens minted before
 *  D125 carry no `orig`; their `iat` stands in, so they refresh like any other. Never throws. */
export function claimsFromGrqToken(token: string | null | undefined): GrqClaims | null {
  if (!token || !process.env.GRQ_JWT_SECRET) return null;
  try {
    const p = jwt.verify(token, secret(), { algorithms: ["HS256"], issuer: ISSUER, audience: AUDIENCE });
    if (typeof p !== "object" || !p) return null;
    const { email, iat, exp, orig } = p as { email?: unknown; iat?: unknown; exp?: unknown; orig?: unknown };
    if (typeof email !== "string" || !email.trim() || typeof iat !== "number" || typeof exp !== "number") return null;
    return { email: email.trim().toLowerCase(), iat, exp, orig: typeof orig === "number" ? orig : iat };
  } catch {
    return null;
  }
}

/** The sliding-session rule, pure: refresh once the token is a day old, never past the ceiling. */
export function shouldRefresh(claims: Pick<GrqClaims, "iat" | "orig">, nowSec = Math.floor(Date.now() / 1000)): boolean {
  if (nowSec - claims.iat < REFRESH_AFTER_SECONDS) return false;
  return nowSec - claims.orig < MAX_SESSION_SECONDS;
}

/** A fresh 30-day token for a valid, day-old Bearer — or null (invalid, too young, or past the
 *  ceiling: the caller sends nothing and the old token runs out on its own). Never throws. */
export function refreshGrqToken(token: string | null | undefined, nowSec = Math.floor(Date.now() / 1000)): string | null {
  const c = claimsFromGrqToken(token);
  if (!c || !shouldRefresh(c, nowSec)) return null;
  return signGrqToken(c.email, { orig: c.orig, iat: nowSec });
}

/** Verify a Bearer token and return its email, or null if missing/invalid/expired.
 *  Never throws — callers treat null as "no identity". */
export function emailFromGrqToken(token: string | null | undefined): string | null {
  return claimsFromGrqToken(token)?.email ?? null;
}

/** Pull the raw token out of an `Authorization: Bearer <token>` header. */
export function bearerToken(req: Request): string | null {
  const h = req.headers.get("authorization");
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}
