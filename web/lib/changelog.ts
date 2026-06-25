// Plain-English changelog for the owners (Cam & Graham) — surfaced on /how-it-works.
// This is DELIBERATELY owner-language, not the engineer-facing docs/DECISIONS.md: what
// changed + why, for a finance-smart non-technical reader. Add an entry whenever we ship
// something that changes how the fund behaves. Newest first. `dRef` points at the deep
// technical decision for anyone who wants it.
export type ChangeTag = "Strategy" | "Guardrail" | "Transparency" | "Operations";

export type ChangeEntry = {
  date: string; // ISO, e.g. "2026-06-25"
  title: string;
  what: string;
  why: string;
  tag: ChangeTag;
  dRef?: string; // e.g. "D73"
};

export const CHANGELOG: ChangeEntry[] = [
  {
    date: "2026-06-25",
    title: "Real trading begins — funded to $25k CAD + $25k USD",
    what: "The paper account was funded to the fund's true launch size: C$25,000 plus US$25,000, keeping the positions already held. Our reported P&L was reset so the deposit doesn't show up as a fake gain.",
    why: "We'd been testing on C$25k only. Practising on the exact size and currency mix we'll actually launch with makes the dry run meaningful — especially for how the US dollars get put to work.",
    tag: "Operations",
    dRef: "D73",
  },
  {
    date: "2026-06-25",
    title: "The bar is now clearing our costs — not beating the TSX",
    what: "The agent now measures success against the fund's own running costs (~US$490/month for its data + AI subscriptions), shown live as a %/year hurdle. Beating the index while still under that hurdle is explicitly not counted as a win.",
    why: "On a small account, 'we beat the market' can still mean a few hundred dollars — which isn't real money made once you subtract what the tools cost. Clearing costs is the honest definition of a genuine return. The hurdle shrinks as the fund grows.",
    tag: "Strategy",
    dRef: "D73",
  },
  {
    date: "2026-06-25",
    title: "Honest reporting — no celebrating small wins",
    what: "The agent's reports now lead with the return rate and the path to scale, name small dollar amounts as noise, and never congratulate themselves.",
    why: "Graham's feedback: he doesn't want to be told a $500 month is great. Reports should read like receipts, not cheerleading.",
    tag: "Transparency",
    dRef: "D71",
  },
  {
    date: "2026-06-25",
    title: "It hunts every hour and must surface new ideas",
    what: "The agent now rebuilds its plan from scratch every hour (not just at the open), and every hourly check-in must research at least five genuinely new names and/or promote a researched one — 'I looked and nothing qualified' is no longer an acceptable answer.",
    why: "It was talking about hunting but rarely producing; the humans were finding most of the new names. The market is enormous — there's always something worth a closer look.",
    tag: "Strategy",
    dRef: "D73",
  },
  {
    date: "2026-06-25",
    title: "Capital rotation — sell the weakest idea to fund a better one",
    what: "The agent can now see its own holdings ranked by conviction and size, and when it finds a materially better setup while fully invested, it rotates: sells its lowest-conviction position to fund the stronger one (weighing tax + fees honestly).",
    why: "A fully-invested fund can only improve by swapping its weakest thesis for a stronger one. It previously had no way to even compare its holdings against a new idea.",
    tag: "Strategy",
    dRef: "D73",
  },
  {
    date: "2026-06-25",
    title: "Cash can't sit idle — per-currency cash ceilings",
    what: "Each currency (CAD and USD, kept separate) now has a maximum idle-cash level. Over it, the agent must deploy — preferably into a real stock, or park it in a broad index ETF as 'ready-to-deploy' ballast if it has no conviction pick.",
    why: "A third of the fund had been sitting in idle US dollars doing nothing. Idle cash earns nothing and drags on returns.",
    tag: "Strategy",
    dRef: "D73",
  },
  {
    date: "2026-06-25",
    title: "Bigger trade allowance so deployment isn't throttled",
    what: "The weekly new-buy limits were raised (Cautious 15 · Balanced 20 · Aggressive 25). The other safety caps — daily order limits, position size, the kill switch — are unchanged.",
    why: "Building a fresh US$25k book plus normal rotation could bump the old caps, which would have fought the push to put money to work. The dial's caution still comes from position size, stops, and cash rules — not the trade count.",
    tag: "Guardrail",
    dRef: "D73",
  },
  {
    date: "2026-06-25",
    title: "This page — full transparency into how GRQ works",
    what: "A plain-English operating manual (this page): the rules, the current dials pulled live from the code the agent actually obeys, the daily rhythm, and a drill-down into the agent's real instructions.",
    why: "So both owners can understand exactly how the fund is governed and what's changed — in finance language, not code.",
    tag: "Transparency",
  },
];
