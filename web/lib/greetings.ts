// Wealth-aware greetings (backlog → 2.5e). Deterministic per member per day,
// so the line doesn't change on every refresh. Loss jokes punch at the robot,
// never at the member.

type Band = "soaring" | "up" | "flat" | "down" | "rough";

const LINES: Record<Band, string[]> = {
  soaring: [
    "Welcome back, oh prosperous one.",
    "Welcome back, {name} — Midas mode engaged.",
    "Welcome back, {name}. Alfred requests a raise.",
  ],
  up: [
    "Welcome back, {name} — green looks good on you.",
    "Welcome back, {name}. Alfred is earning its electricity.",
    "Welcome back, {name}. Rich quick, slowly — as promised.",
  ],
  flat: [
    "Welcome back, {name}.",
    "Welcome back, {name}. Steady as she goes.",
    "Welcome back, {name}. The receipts are in order.",
  ],
  down: [
    "Welcome back, {name}. We don't talk about Tuesday.",
    "Welcome back, {name}. Alfred says drawdowns build character.",
    "Welcome back, {name}. Alfred apologizes in advance.",
  ],
  rough: [
    "Welcome back, {name}. XIC would like a word.",
    "Welcome back, {name}. Officially tuition, not losses.",
    "Welcome back, {name}. The kill switch is right there. Just saying.",
  ],
};

function band(pnlPct: number): Band {
  if (pnlPct >= 5) return "soaring";
  if (pnlPct >= 1) return "up";
  if (pnlPct > -1) return "flat";
  if (pnlPct > -5) return "down";
  return "rough";
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function greeting(name: string, totalPnlCents: number, contributionsCents: number): string {
  const pct = contributionsCents > 0 ? (totalPnlCents / contributionsCents) * 100 : 0;
  const pool = LINES[band(pct)];
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  return pool[hash(day + name) % pool.length].replace("{name}", name);
}
