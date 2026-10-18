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
  supersededBy?: string; // a later entry's title, when this one no longer describes how the fund behaves
};

export const CHANGELOG: ChangeEntry[] = [
  {
    date: "2026-10-18",
    title: "The plan's questions are asked on the site, and the answers are recorded",
    what: "The 'Graham, start here' card on this page now ends with the open questions for the Oct 22 decision — the pass marks for the new book, a stop-width rule, a single-name cap, idle-cash ballast, the idle-cash check-in question, new names per week, options 'walls' as a reason to buy, and the size of the new book. Each member picks an answer, adds a note if it needs one, and saves; every answer is recorded with its time and both members see both. The Saturday review now reads what shipped that week, what it proposed last week and these answers before it proposes anything, and lists what is still open in one line each instead of pitching it again.",
    why: "For 19 weeks the review proposed strategy changes 'pending Cam & Graham's approval' with nowhere for an answer to land. It asked for a single-name cap in 8 of 19 weeks and for an order-cancel tool three days after one shipped. A decision that is recorded is a decision the agent can be held to, and one it stops asking for.",
    tag: "Transparency",
    dRef: "D139",
  },
  {
    date: "2026-10-18",
    title: "A day's change is now one day's change",
    what: "Every 'today' percentage on the site and in Alfred's view — the home-page movers, Today, the positions list, the figure that decides whether a holding moved enough to wake him — was measured against the close two sessions back, not the prior one. On Friday Oct 16 NVDA showed −3.2% when the day's move was −1.4%. Fixed at the source; the correct figure appears with the next quote refresh. Alfred had noticed and was checking real closes before acting on any price line, so no trade went wrong because of it.",
    why: "The quote feed read Yahoo's 'previous close' for a two-day chart, which is the close before the chart starts. It had been that way since June 12. The 4%-move checks counted in this month's test were counting two-day moves.",
    tag: "Operations",
    dRef: "D139",
  },
  {
    date: "2026-10-15",
    title: "Open to invited readers, with terms at the door",
    what: "Since Sep 6 a third kind of reader exists — a 'user' (Jose, Dave, now anyone on the site's sign-in list): they get the research and education side of GRQ and never the book — no positions, P&L, fills, reports or Alfred's write-ups about names. Since Oct 15 a user reads and accepts the terms before anything else opens: what GRQ is (a joke name on a private fund), that nobody can invest in it, that nothing is advice, that Alfred is an AI nobody reviews per call, that the fund may hold what it rates, and that visits are logged. Every page footer now says 'Not investment advice. Alfred is an AI. Nothing here is an offer to invest.'",
    why: "'Get Rich Quick' reads like a scam to anyone outside the joke, and a page of machine-written Buy ratings under that banner needs saying out loud. The one line beside every call a non-member sees — that the fund may hold or trade what it rates — is the disclosure the securities rules expect of general advice.",
    tag: "Transparency",
    dRef: "D136",
  },
  {
    date: "2026-10-15",
    title: "Market data: a week on the cheap plan, now back on the full one",
    what: "From Oct 8 to Oct 15 the market-data key was on FMP's Starter plan, which refuses Canadian quotes, the TSX index, oil, the Canadian screener and 13F filings. The site showed delayed prices and 'No info' panels rather than pretending. The full plan was re-purchased Oct 15 and every feed came back on its own.",
    why: "Honest panels beat fake ones. The fund's cost hurdle (~US$490/month) assumed the full plan all along, so it is right again.",
    tag: "Operations",
    dRef: "D134",
  },
  {
    date: "2026-09-30",
    title: "Holding is the job — the agent is rewarded for patience, not activity",
    what: "A new mandate: make more than we put in, month over month, after costs and tax. A holding is kept until its thesis breaks; it rotates out only for a large, clear step up (15+ points of conviction, not 3) and never sells a holding to fund a starter. Idle cash tops up the best existing names before opening new ones. Check-ins became monitoring — no quota of names to vet, and most end with no trade. The agent now sees its own track record in every session (did each rotation beat holding, how long it holds, turnover, realized tax, the month against contributions), the weekly review grades it, and reports call out churn as bluntly as idle cash. This replaces the June 25 'hunt every hour' and 'capital rotation' directions and the June 29 '12–18 names per check-in' quota below; the per-currency cash ceilings still stand.",
    why: "On Opus 5.5 the June push language produced churn — about 3.8 orders a day, 8 starters in 5 days, a one-week round trip — without better returns. Caps were rejected ('they just change the max it will always hold'); the fix is incentives. First two weeks: 3 trades in 11 days, no new names, October +5.2% against the TSX's +2.5%, and the agent's running cost down by about two thirds. The open question is whether it now deploys too little; idle cash is being watched.",
    tag: "Strategy",
    dRef: "D131",
  },
  {
    date: "2026-09-30",
    title: "Thinking effort set per job",
    what: "Money decisions — check-ins, position checks, the morning plan — run at high reasoning effort. Research dossiers, reports and chat run at medium. Each route can be changed without a rebuild.",
    why: "The model swap raised the token bill. Effort where money moves, savings where it doesn't; a dossier written at medium reads the same.",
    tag: "Operations",
    dRef: "D130",
  },
  {
    date: "2026-09-23",
    title: "The agent's brain moves to Claude Opus 5.5",
    what: "Decision sessions now run on Opus 5.5 (from Opus 4.8), with reasoning effort pinned so the swap couldn't quietly lower it. Every prompt was then audited against the new model's guidance — 37 findings — and the fixes shipped in stages. The whole plan, what each stage measured and what's next is on the 'Opus 5.5 plan' tab.",
    why: "A more capable model, and the audit because prompts written for one model behave differently on the next — which they did (see Sep 30).",
    tag: "Operations",
    dRef: "D128",
  },
  {
    date: "2026-09-22",
    title: "The agent can hand back a universe slot",
    what: "The agent may now demote a name out of its tradeable universe to free a slot under the 60-name cap — only an unheld, unwatched, not-pinned, not-member-added name, at most 25 a week. It still can never retire a name; that stays with the two of you. When the cap rejects a promotion, the rejection now states the arithmetic.",
    why: "It could promote 25 names a week and demote none, so the universe filled up and jammed for a month while the agent wrongly told you it was waiting on you.",
    tag: "Guardrail",
    dRef: "D126",
  },
  {
    date: "2026-07-31",
    title: "A bad mark can no longer halt the fund",
    what: "A fund-value snapshot taken while a sale was still settling counted the shares and the cash, became a permanent high-water mark, and the −15% drawdown halt fired twice (Jul 16 and Jul 29) on a loss that never happened. Snapshots now net settlement properly, and the drawdown rule reads only settled marks.",
    why: "The halt is the most serious guardrail there is. It must fire on real losses, and only those.",
    tag: "Guardrail",
    dRef: "D120",
  },
  {
    date: "2026-07-16",
    title: "No shorting, enforced where the orders actually go",
    what: "The no-shorting rule lived only in the simulator the fund no longer trades through. A stop re-fired against a broker mirror that lagged fills by minutes and sold more than we held — a 96-share short, for a few minutes. The rule now sits at the broker seam, every order path included, with a test that fails the build if it ever moves.",
    why: "A guardrail in the wrong layer is a guardrail that isn't there.",
    tag: "Guardrail",
    dRef: "D118",
  },
  {
    date: "2026-07-12",
    title: "The Council — five lenses before real money",
    what: "Before any buy, and any sell it's unsure about, the agent puts the call through five deliberately conflicting lenses — Contrarian, First-Principles, Expansionist, Outsider, Executor — and a chairman's verdict. Your own stock questions to Alfred go through it too. Advice only: it never lowers the conviction bar and never touches the order gate.",
    why: "A thesis should meet its strongest bear case before the order goes in, not in the retro afterwards.",
    tag: "Strategy",
    dRef: "D115",
  },
  {
    date: "2026-07-05",
    title: "Research only when something changed",
    what: "The weekly research sweep re-writes a name's dossier only when something material changed since the last one (or it's gone stale, 28 days), and prunes the candidate pool of names that went nowhere. A name on either of your watchlists always keeps its daily dossier.",
    why: "The Sunday sweep had grown to ~57M tokens, re-researching names that hadn't moved. This cut it by roughly two thirds with nothing lost that would change a call.",
    tag: "Operations",
    dRef: "D112",
  },
  {
    date: "2026-06-29",
    title: "Wider net, more often — checks every 30 minutes",
    supersededBy: "Partly, Sep 30 — the 30-minute cadence stands; the 12–18-names-per-check-in quota is gone (see 'Holding is the job').",
    what: "Two changes to how the agent looks for ideas. (1) Cadence: it now runs a full check-in every 30 minutes (was hourly), and after queuing deep research on a name it can schedule itself a short follow-up to act once that research lands — instead of waiting for the next slot. (2) Breadth: each check-in now vets 12–18 fresh names as quick 'leads' (seeded by our market-wide screen), and only the genuinely promising few (2–4) get a full deep-research report. The previous floor was five.",
    why: "An end-of-day review was honest about the problem: the fund sat in cash because the same handful of watched names kept stalling just under the buy bar. The fix is to look at far more names, far more often — but cheaply. Glancing widely is nearly free; the expensive deep reports are reserved for the names that earn them, so we widen the funnel without blowing the research budget.",
    tag: "Strategy",
    dRef: "D96",
  },
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
    supersededBy: "Sep 30, 'Holding is the job' — no quota of new names any more; 'I looked and nothing qualified' is a fine answer again.",
    what: "The agent now rebuilds its plan from scratch every hour (not just at the open), and every hourly check-in must research at least five genuinely new names and/or promote a researched one — 'I looked and nothing qualified' is no longer an acceptable answer.",
    why: "It was talking about hunting but rarely producing; the humans were finding most of the new names. The market is enormous — there's always something worth a closer look.",
    tag: "Strategy",
    dRef: "D73",
  },
  {
    date: "2026-06-25",
    title: "Capital rotation — sell the weakest idea to fund a better one",
    supersededBy: "Sep 30, 'Holding is the job' — it rotates only for a large, clear step up (15+ points), never to fund a starter.",
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
