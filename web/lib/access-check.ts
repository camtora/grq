// The access check a GRQ user runs on themselves (D135). Pure data, shared by the page, the
// client and the API. Two kinds of row:
//   auto   — the visitor's own browser requests the path with their session and records the
//            HTTP status. For a USER: `open` rows must answer 200, `refused` rows 403.
//   manual — things that must be ABSENT on a page they can open; only a person can look.

export type AutoCheck = { id: string; kind: "open" | "refused"; path: string; label: string; leak?: string };
export type ManualCheck = { id: string; path: string | null; where: string; check: string };

export const AUTO_CHECKS: AutoCheck[] = [
  { id: "A1", kind: "open", path: "/", label: "Home" },
  { id: "A2", kind: "open", path: "/market", label: "The Hunt" },
  { id: "A3", kind: "open", path: "/market/browse", label: "Browse" },
  { id: "A4", kind: "open", path: "/market/smart-money", label: "Smart Money" },
  { id: "A5", kind: "open", path: "/market/watchlist", label: "Watchlist" },
  { id: "A6", kind: "open", path: "/stocks/TSM", label: "A stock page (TSM)" },
  { id: "A7", kind: "open", path: "/learn", label: "Learn" },
  { id: "A8", kind: "open", path: "/chess", label: "Chess Moves" },

  { id: "B1", kind: "refused", path: "/accounts", label: "/accounts", leak: "the members' personal brokerage accounts" },
  { id: "B2", kind: "refused", path: "/portfolio", label: "/portfolio", leak: "the fund's positions and value" },
  { id: "B3", kind: "refused", path: "/reports", label: "/reports", leak: "daily and weekly fund reports" },
  { id: "B4", kind: "refused", path: "/journal", label: "/journal", leak: "the fund's trade and decision log" },
  { id: "B5", kind: "refused", path: "/settings", label: "/settings", leak: "fund settings and risk controls" },
  { id: "B6", kind: "refused", path: "/traffic", label: "/traffic", leak: "who uses the site" },
  { id: "B7", kind: "refused", path: "/tokens", label: "/tokens", leak: "AI usage and cost" },
  { id: "B8", kind: "refused", path: "/race", label: "/race", leak: "the fund's actual buy and sell calls" },
  { id: "B9", kind: "refused", path: "/how-it-works", label: "/how-it-works", leak: "the internal operating manual" },
  { id: "B10", kind: "refused", path: "/api/accounts", label: "/api/accounts", leak: "personal accounts, as data" },
  { id: "B11", kind: "refused", path: "/api/portfolio", label: "/api/portfolio", leak: "the fund's book, as data" },
  { id: "B12", kind: "refused", path: "/api/traffic", label: "/api/traffic", leak: "site usage, as data" },
  { id: "B13", kind: "refused", path: "/api/chat", label: "/api/chat", leak: "the AI that can read the fund" },
  { id: "B14", kind: "refused", path: "/api/reports", label: "/api/reports", leak: "fund reports, as data" },
];

export const MANUAL_CHECKS: ManualCheck[] = [
  { id: "C1", path: null, where: "Top right of any page", check: "Click your picture or initial. Nothing should happen; it is not a link." },
  { id: "C2", path: null, where: "Top right of any page", check: "No gear icon, no bell, and no red \"halt trading\" switch." },
  { id: "C3", path: "/", where: "Home", check: "No fund value, no profit or loss, no list of what the fund holds." },
  { id: "C4", path: "/stocks/TSM", where: "TSM stock page", check: "No section saying anyone holds TSM \"outside the fund\", and no account names such as TFSA or RSP." },
  { id: "C5", path: "/stocks/TSM", where: "TSM stock page", check: "No \"our position\" box, no shares owned, no list of the fund's trades in TSM." },
  { id: "C6", path: "/stocks/TSM", where: "TSM stock page", check: "No Watch button and no button to request research." },
  { id: "C7", path: "/universe", where: "Universe", check: "No column showing shares held or gains on any stock." },
  { id: "C8", path: null, where: "The round search button (bottom right), with the box empty", check: "Under \"Recently viewed\", only stocks you opened yourself. No list of what other people looked at." },
  { id: "C9", path: null, where: "Bottom right of any page", check: "No chat button for asking the AI about the fund." },
];

export type AccessCheckData = {
  auto: Record<string, number>; // id → HTTP status the visitor's browser got (0 = request failed)
  manual: Record<string, "pass" | "fail">;
  notes: Record<string, string>;
  overall: string;
};

export const emptyData = (): AccessCheckData => ({ auto: {}, manual: {}, notes: {}, overall: "" });

/** Is this auto row the right answer FOR A USER? (A member or viewer legitimately gets 200 on
 *  the refused rows — the summary says so rather than calling it a leak.) */
export function autoOk(c: AutoCheck, status: number | undefined): boolean | null {
  if (status == null) return null;
  return c.kind === "open" ? status === 200 : status === 403;
}

/** Tolerant parse + clamp of what a browser posted — never trusts shape or size. */
export function sanitize(raw: unknown): AccessCheckData {
  const out = emptyData();
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;
  const autoIds = new Set(AUTO_CHECKS.map((c) => c.id));
  const manualIds = new Set(MANUAL_CHECKS.map((c) => c.id));
  if (r.auto && typeof r.auto === "object") {
    for (const [k, v] of Object.entries(r.auto as Record<string, unknown>)) {
      if (autoIds.has(k) && typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 600) out.auto[k] = v;
    }
  }
  if (r.manual && typeof r.manual === "object") {
    for (const [k, v] of Object.entries(r.manual as Record<string, unknown>)) {
      if (manualIds.has(k) && (v === "pass" || v === "fail")) out.manual[k] = v;
    }
  }
  if (r.notes && typeof r.notes === "object") {
    for (const [k, v] of Object.entries(r.notes as Record<string, unknown>)) {
      if (manualIds.has(k) && typeof v === "string" && v.trim()) out.notes[k] = v.slice(0, 500);
    }
  }
  if (typeof r.overall === "string") out.overall = r.overall.slice(0, 2000);
  return out;
}

export function summarize(d: AccessCheckData): { autoRight: number; autoWrong: string[]; autoTotal: number; pass: number; fail: string[]; manualTotal: number } {
  const autoWrong: string[] = [];
  let autoRight = 0;
  for (const c of AUTO_CHECKS) {
    const ok = autoOk(c, d.auto[c.id]);
    if (ok === true) autoRight++;
    else if (ok === false) autoWrong.push(`${c.id} ${c.path} → ${d.auto[c.id]}`);
  }
  const fail = MANUAL_CHECKS.filter((c) => d.manual[c.id] === "fail").map((c) => `${c.id}${d.notes[c.id] ? `: ${d.notes[c.id]}` : ""}`);
  const pass = MANUAL_CHECKS.filter((c) => d.manual[c.id] === "pass").length;
  return { autoRight, autoWrong, autoTotal: AUTO_CHECKS.length, pass, fail, manualTotal: MANUAL_CHECKS.length };
}
