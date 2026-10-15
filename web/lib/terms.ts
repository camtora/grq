import { createHmac, timingSafeEqual } from "node:crypto";
import type { Role } from "./users";

// The terms (D136, Cam 2026-10-15). GRQ opened its USER tier to everyone on the SSO allowlist
// (D133), and the site is called Get Rich Quick: a stranger to the joke walks in and reads
// "Strong Buy" beside a ticker, written by a machine, under that banner. So a USER accepts the
// terms ONCE, on their first visit, before the site opens — a click-through, not a footer link,
// because a click-through is the one that holds up (the acceptance row is the proof: who,
// which version, when, from where). Members and viewers are the fund and its own alternates;
// they never see the gate. Bump TERMS_VERSION when the text changes materially and every
// user is asked again.
//
// The door (middleware.ts) decides from a COOKIE so it never has to ask Postgres on every
// request. The cookie is an HMAC of (email, version) under GRQ_JWT_SECRET, so it can't be
// minted without the secret and can't be moved between people. It is a CACHE of the row,
// never the proof: /terms re-reads the row when the cookie is missing (a new device) and
// re-issues it, and the accept route writes the row before it sets the cookie.

export const TERMS_VERSION = "2026-10-15";
export const TERMS_COOKIE = "grq-terms";
export const TERMS_PATH = "/terms";
export const TERMS_ACCEPT_API = "/api/terms/accept";
/** The door's reply to a USER-tier API call before acceptance (the pages never make one). */
export const TERMS_API_ERROR = "terms";

const COOKIE_DAYS = 400; // the browser cap; the ROW is what lasts

function secret(): string | null {
  return process.env.GRQ_JWT_SECRET || null;
}

function sign(email: string, version: string): string | null {
  const s = secret();
  if (!s) return null;
  return createHmac("sha256", s).update(`${email.trim().toLowerCase()}|${version}`).digest("base64url");
}

/** The cookie value proving `email` accepted `version` — null when no secret is configured. */
export function termsCookieValue(email: string, version = TERMS_VERSION): string | null {
  const mac = sign(email, version);
  return mac ? `${version}.${mac}` : null;
}

/** Does this cookie prove `email` accepted the CURRENT version? Constant-time on the MAC. */
export function termsCookieValid(cookie: string | null | undefined, email: string | null | undefined): boolean {
  if (!cookie || !email) return false;
  const dot = cookie.indexOf(".");
  if (dot <= 0) return false;
  const version = cookie.slice(0, dot);
  if (version !== TERMS_VERSION) return false;
  const want = sign(email, version);
  const got = cookie.slice(dot + 1);
  if (!want || want.length !== got.length) return false;
  return timingSafeEqual(Buffer.from(want), Buffer.from(got));
}

export function termsCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_DAYS * 86400,
  };
}

// Where a USER may go BEFORE accepting: the terms page itself, the accept route, and the
// files the page needs. Nothing else. (`/api/health` never reaches the door.)
const OPEN_BEFORE_ACCEPT = [TERMS_PATH, TERMS_ACCEPT_API];
const ASSET = /\.(png|svg|jpe?g|webp|gif|ico|txt|xml|json|webmanifest|woff2?)$/i;

export type TermsRuling = "open" | "redirect" | "refuse";

/** The door's rule: does this request need the terms accepted first, and what to do if not.
 *  Pure. `open` = carry on; `redirect` = a page view, send it to /terms; `refuse` = an API call,
 *  403. Only the USER tier is ever asked. */
export function termsRuling(role: Role | null, pathname: string, cookie: string | null | undefined, email: string | null): TermsRuling {
  if (role !== "user") return "open";
  if (OPEN_BEFORE_ACCEPT.some((p) => pathname === p || pathname.startsWith(p + "/"))) return "open";
  if (!pathname.startsWith("/api/") && ASSET.test(pathname)) return "open";
  if (termsCookieValid(cookie, email)) return "open";
  return pathname.startsWith("/api/") ? "refuse" : "redirect";
}

/** Only a same-site path may be the "next" after accepting — never an absolute URL. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  if (next === TERMS_PATH || next.startsWith(TERMS_PATH + "?")) return "/";
  return next.slice(0, 500);
}
