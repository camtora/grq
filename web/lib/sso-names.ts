import fs from "node:fs";
import { userForEmail } from "./users";

// Names for everyone on the SSO allowlist — NOT just GRQ's two members.
//
// The names live in ONE file in the infra repo, beside the allowlist it describes
// (~/infrastructure/oauth2-proxy/users.json, `{email: {"first", "last"}}`; infra's CI fails
// when an allowlisted email has no name). docker-compose mounts that one file read-only and
// USERS_FILE points at it, so an in-place edit shows up here on the next request — no rebuild
// (an edit saved by rename needs a force-recreate of web; see the note in docker-compose.yaml).
// GRQ never keeps its own email → name dict for non-members: that is the drift the file ended.
//
// Server-only (reads the filesystem): import from pages, routes and lib — never from
// middleware or a client component.
//
// A missing or malformed file degrades to "no names" and is logged once per change, never
// thrown — a name is not worth taking a page down for.

const USERS_FILE = process.env.USERS_FILE || "/infrastructure/users.json";

let cache: { mtimeMs: number | null; names: Map<string, string> } = { mtimeMs: null, names: new Map() };
let lastError = "";

function ssoNames(): Map<string, string> {
  try {
    const mtimeMs = fs.statSync(USERS_FILE).mtimeMs;
    if (mtimeMs === cache.mtimeMs) return cache.names;
    const raw = JSON.parse(fs.readFileSync(USERS_FILE, "utf8")) as Record<string, { first?: unknown; last?: unknown }>;
    const names = new Map<string, string>();
    for (const [email, entry] of Object.entries(raw)) {
      const full = [entry?.first, entry?.last].map((p) => (typeof p === "string" ? p.trim() : "")).filter(Boolean).join(" ");
      if (full) names.set(email.trim().toLowerCase(), full);
    }
    cache = { mtimeMs, names };
    lastError = "";
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg !== lastError) console.error(`[sso-names] can't read ${USERS_FILE}: ${msg}`);
    lastError = msg;
  }
  return cache.names;
}

/** The person's name, or null when nobody has named this address. Members keep the name GRQ
 *  already calls them (Cam, Graham); everyone else gets first + last from the SSO file. */
export function nameForEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  return userForEmail(email)?.name ?? ssoNames().get(email.trim().toLowerCase()) ?? null;
}

/** What to put on screen for an address. Never the address itself (Cam, 2026-10-11): an
 *  unnamed one shows its local part, which is the tell that users.json is missing an entry. */
export function displayNameForEmail(email: string): string {
  return nameForEmail(email) ?? email.split("@")[0];
}
