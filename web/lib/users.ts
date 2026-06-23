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

// Owner tier — the third, narrowest tier, ABOVE member. Members (Cam, Graham) act
// on the fund; the owner additionally sees the admin/usage dashboard (/admin).
// This is a separate concept from GrqUser.role ("admin"), which is just a display
// label and gates nothing. Default = Cam; OWNER_EMAILS env extends it without a
// rebuild. Gate /admin and /api/admin/* on this; hide the nav link unless owner.
function ownerEmails(): string[] {
  const env = (process.env.OWNER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return env.length ? env : ["cameron.tora@gmail.com"];
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
