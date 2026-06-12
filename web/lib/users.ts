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

export function isAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return normalized in USERS || envEmails().includes(normalized);
}

export function userForEmail(email: string | null | undefined): GrqUser | null {
  if (!email) return null;
  return USERS[email.trim().toLowerCase()] ?? null;
}
