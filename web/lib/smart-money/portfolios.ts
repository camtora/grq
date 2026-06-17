// Smart Money roster (D27) — the editorial choice of whose money we track. This
// is a curated list, deliberately: 13F filers we follow by CIK, and notable
// members of Congress we follow by name in the disclosure feed. Extend freely.
//
// CIKs verified live against FMP's institutional-ownership/dates 2026-06-16.
// `accent` is a Tailwind text colour used for the avatar monogram tint.

export type RosterFund = {
  slug: string;
  kind: "fund";
  name: string; // the human everyone knows
  firm: string;
  cik: string;
  blurb: string;
  /** Optional logo in /public/smartmoney/<file>; else a monogram is drawn. */
  avatar?: string;
  accent?: string;
};

export type RosterPerson = {
  slug: string;
  kind: "congress";
  name: string;
  role: string; // "U.S. House (CA-11)" etc.
  /** Last name as it appears in the FMP senate/house feed (match key). */
  matchLastName: string;
  blurb: string;
  avatar?: string;
  accent?: string;
};

export type RosterEntry = RosterFund | RosterPerson;

export const ROSTER: RosterEntry[] = [
  {
    slug: "berkshire",
    kind: "fund",
    name: "Warren Buffett",
    firm: "Berkshire Hathaway",
    cik: "0001067983",
    avatar: "berkshire.jpg",
    blurb: "The patient compounder — concentrated, long-held, allergic to fads. When Berkshire moves, the whole market reads the tea leaves.",
    accent: "text-amber-200",
  },
  {
    slug: "scion",
    kind: "fund",
    name: "Michael Burry",
    firm: "Scion Asset Management",
    cik: "0001649339",
    avatar: "scion.webp",
    blurb: "The 'Big Short' contrarian. Tiny, concentrated book; files irregularly and loves a bearish options bet — read his 13F as a mood, not a map.",
    accent: "text-rose-200",
  },
  {
    slug: "pershing",
    kind: "fund",
    name: "Bill Ackman",
    firm: "Pershing Square",
    cik: "0001336528",
    avatar: "pershing.jpg",
    blurb: "High-conviction activist — a handful of large positions he'll defend loudly. Concentration is the strategy, not an accident.",
    accent: "text-sky-200",
  },
  {
    slug: "ark",
    kind: "fund",
    name: "Cathie Wood",
    firm: "ARK Investment Management",
    cik: "0001697748",
    avatar: "ark.jpeg",
    blurb: "Disruptive-innovation thematic — high-beta growth, AI, genomics, crypto-adjacent. Big book, fast turnover, polarising track record.",
    accent: "text-violet-200",
  },
  {
    slug: "situational",
    kind: "fund",
    name: "Leopold Aschenbrenner",
    firm: "Situational Awareness LP",
    cik: "0002045724",
    avatar: "situational.webp",
    blurb: "Ex-OpenAI, 20-something, runs a multi-billion AI-infrastructure book: long power/data-centre/compute, and famously SHORT the chip names via puts. The puts read bearish — don't mistake them for longs.",
    accent: "text-cyan-200",
  },
  {
    slug: "pelosi",
    kind: "congress",
    name: "Nancy Pelosi",
    role: "U.S. House (CA-11)",
    matchLastName: "Pelosi",
    avatar: "pelosi.webp",
    blurb: "The most-tracked trader in Congress — her family's disclosed options and megacap-tech buys move retail sentiment all by themselves.",
    accent: "text-emerald-200",
  },
];

export const ROSTER_FUNDS = ROSTER.filter((r): r is RosterFund => r.kind === "fund");
export const ROSTER_CONGRESS = ROSTER.filter((r): r is RosterPerson => r.kind === "congress");

export function rosterBySlug(slug: string): RosterEntry | undefined {
  return ROSTER.find((r) => r.slug === slug);
}
