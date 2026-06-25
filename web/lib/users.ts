export type GrqUser = { name: string; role: "admin"; theme: "light" | "dark" };

// The fund's member list. Both members are admins — equal access, both hold
// the kill switch (PROJECT_PLAN.md §10.3). GRQ_ALLOWED_EMAILS in .env extends
// this list without a rebuild (extra emails get no display name).
// Theme defaults settle the household dispute: Cam light, Graham dark.
export const USERS: Record<string, GrqUser> = {
  "cameron.tora@gmail.com": { name: "Cam", role: "admin", theme: "light" },
  "g.j.appleby@gmail.com": { name: "Graham", role: "admin", theme: "dark" },
};

function envEmails(): string[] {
  return (process.env.GRQ_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

// A member is Cam/Graham or anyone in GRQ_ALLOWED_EMAILS — they act on the fund.
export function isMember(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return normalized in USERS || envEmails().includes(normalized);
}

// Every member email (named members + GRQ_ALLOWED_EMAILS), normalized + deduped.
// The notification fan-out resolves recipients from THIS list (not device tokens),
// so the web feed reaches a member who has never opened the phone app.
export function memberEmails(): string[] {
  return [...new Set([...Object.keys(USERS), ...envEmails()].map((e) => e.toLowerCase()))];
}

// Back-compat alias (kept for any caller that means "is a member").
export const isAllowed = isMember;

// Access tiers. oauth2-proxy already gates login to the infra allowlist
// (~/infrastructure/oauth2-proxy/authenticated_emails.txt), so ANY request that
// reaches GRQ with a valid X-Forwarded-Email is allowlisted → at least a
// read-only viewer. Members may act; viewers may only look. null = no identity
// (a header-less LAN hit) → denied at the door.
export type Role = "member" | "viewer";

export function roleForEmail(email: string | null | undefined): Role | null {
  if (!email || !email.trim()) return null;
  return isMember(email) ? "member" : "viewer";
}

export function userForEmail(email: string | null | undefined): GrqUser | null {
  if (!email) return null;
  return USERS[email.trim().toLowerCase()] ?? null;
}

// Owner/admin tier — the narrowest tier. Cam & Graham are both owners: they alone
// see the admin-only pages (Settings, Traffic, Tokens, How GRQ works) and the
// admin/usage dashboard. Viewers (and any anonymous GRQ_ALLOWED_EMAILS member)
// cannot. This is a separate concept from GrqUser.role ("admin"), which is just a
// display label and gates nothing. Default = Cam + Graham; OWNER_EMAILS env
// replaces the default without a rebuild. Gate /settings, /traffic, /tokens,
// /how-it-works, and /api/admin/* on this; hide the nav links unless owner.
function ownerEmails(): string[] {
  const env = (process.env.OWNER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return env.length ? env : ["cameron.tora@gmail.com", "g.j.appleby@gmail.com"];
}

export function isOwner(email: string | null | undefined): boolean {
  if (!email) return false;
  return ownerEmails().includes(email.trim().toLowerCase());
}

// Stable member keys — match lib/people.ts (Person.key) and the iOS avatar assets
// ("cam"/"graham"). The mobile app addresses the other member by key, not email;
// this resolves the key the server actually pushes to.
export const MEMBER_KEY_EMAILS: Record<"cam" | "graham", string> = {
  cam: "cameron.tora@gmail.com",
  graham: "g.j.appleby@gmail.com",
};

/** Resolve a stable member key ("cam"|"graham") to that member's email, or null. */
export function emailForMemberKey(key: string | null | undefined): string | null {
  if (key === "cam" || key === "graham") return MEMBER_KEY_EMAILS[key];
  return null;
}

/** The stable member key ("cam"|"graham") for an email, or null if not a named member. */
export function memberKeyForEmail(email: string | null | undefined): "cam" | "graham" | null {
  const e = email?.trim().toLowerCase();
  if (e === MEMBER_KEY_EMAILS.cam) return "cam";
  if (e === MEMBER_KEY_EMAILS.graham) return "graham";
  return null;
}

/** In the two-person fund, the OTHER named member's email (Cam↔Graham), or null.
 *  Used to route a direct message / share to "the other person" without a picker. */
export function otherMemberEmail(email: string | null | undefined): string | null {
  const key = memberKeyForEmail(email);
  if (key === "cam") return MEMBER_KEY_EMAILS.graham;
  if (key === "graham") return MEMBER_KEY_EMAILS.cam;
  return null;
}
