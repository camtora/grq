import jwt from "jsonwebtoken";

// GRQ-JWT: the mobile app's session token (docs/IOS-PLAN.md). The native app has
// no oauth2-proxy cookie, so it proves identity with a Bearer token instead: it
// trades a Google ID token (verified in /api/auth/google) for one of these, then
// session.ts resolves the email from it. Everything downstream — roleForEmail,
// memberFromRequest, the kill switch, the order gate — is unchanged.
//
// Signed with GRQ_JWT_SECRET (HS256). Short-lived; a refresh token comes before
// any public release. Rotating the secret invalidates every issued token.

const ISSUER = "grq";
const AUDIENCE = "grq-ios";
const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days — internal TestFlight; tighten later

export function jwtConfigured(): boolean {
  return !!process.env.GRQ_JWT_SECRET;
}

function secret(): string {
  const s = process.env.GRQ_JWT_SECRET;
  if (!s) throw new Error("GRQ_JWT_SECRET is not set");
  return s;
}

/** Mint a session token for an already-authenticated member email. */
export function signGrqToken(email: string): string {
  return jwt.sign({ email: email.trim().toLowerCase() }, secret(), {
    algorithm: "HS256",
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: TTL_SECONDS,
  });
}

/** Verify a Bearer token and return its email, or null if missing/invalid/expired.
 *  Never throws — callers treat null as "no identity". */
export function emailFromGrqToken(token: string | null | undefined): string | null {
  if (!token || !process.env.GRQ_JWT_SECRET) return null;
  try {
    const payload = jwt.verify(token, secret(), {
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    const email = typeof payload === "object" && payload && "email" in payload ? (payload as { email?: unknown }).email : null;
    return typeof email === "string" && email.trim() ? email.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Pull the raw token out of an `Authorization: Bearer <token>` header. */
export function bearerToken(req: Request): string | null {
  const h = req.headers.get("authorization");
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}
