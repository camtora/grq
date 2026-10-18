// The plan's open questions, posed to the members on the site (Cam, 2026-10-18: "pose the questions
// to Graham, with the ability for him to submit answers that we record. we can then review them
// prior to Thursday night and include it in our plan"). For 19 weeks the Saturday review proposed
// strategy changes "pending Cam & Graham's approval" with nowhere for an answer to land, so it
// re-asked the same things (a single-name cap, 8 times) and asked for things that had shipped.
// This file is the question list; PlanAnswer rows (lib/plan-answers.ts) are the answers; the
// Saturday review reads both back (agent/review-memory.ts). D139.
//
// A question's key is stable for its round. Edit the words freely; never reuse a key for a
// different question in the same round, or an old answer would answer the new question.
export type PlanOption = { key: string; label: string };
export type PlanQuestion = {
  key: string;
  /** The question, one line. */
  title: string;
  /** Where it comes from and what it would change — owner language, dollars where there are any. */
  asks: string;
  options: PlanOption[];
};

export const PLAN_ROUND = {
  key: "2026-10-22",
  label: "the Oct 22 decision",
  due: "Wednesday Oct 21",
} as const;

const UNSURE: PlanOption = { key: "unsure", label: "Not sure — talk it through Thursday" };

export const PLAN_QUESTIONS: readonly PlanQuestion[] = [
  {
    key: "pass-marks",
    title: "The pass marks for the new book, written down before Thursday's flatten.",
    asks:
      "Proposed: cash at most 50% of the fund by trading day 5 (Oct 30), 30% by day 10 (Nov 6) and 15% by day 20 (Nov 20); no round trip inside 30 days; every buy at or above the 70 bar with a written thesis, an invalidation and a stop at least two weekly moves wide; no sell that cites a score. Missing any one is a fail, and the real-money question waits a cycle.",
    options: [
      { key: "accept", label: "Accept as proposed" },
      { key: "change", label: "Change a number (say which in the note)" },
      { key: "add", label: "Add a mark (say what in the note)" },
    ],
  },
  {
    key: "stop-width-in-code",
    title: "Should the code refuse a buy whose stop is tighter than about two weekly moves?",
    asks:
      "Alfred asked for this on Oct 17 after OKE, VRTX and VNP were shaken out by ordinary daily moves. He already carries the rule as a lesson and has ignored a softer version once. Six sells since Sep 30 were all at a loss; five fired on a written price line.",
    options: [
      { key: "code", label: "Yes, put it in the code" },
      { key: "lesson", label: "Keep it a lesson, not a rule" },
      UNSURE,
    ],
  },
  {
    key: "single-name-cap",
    title: "Should one name be capped at 13 to 15% of the fund?",
    asks:
      "Alfred asked for a working ceiling in 8 of the 19 weekly reviews. The hard limit today is 80% in one name; the largest position today is about 11%. The Sep 30 change chose incentives over caps, on the view that a cap becomes the size he always holds.",
    options: [
      { key: "cap", label: "Yes, a hard cap (the number in the note)" },
      { key: "no-cap", label: "No cap — keep it his discipline" },
      UNSURE,
    ],
  },
  {
    key: "usd-ballast",
    title: "Idle US dollars: make an index ETF (VOO) buyable as ballast, or drop ballast from his instructions?",
    asks:
      "His instructions say to park idle USD in VOO when he has no conviction pick, but VOO cannot be bought (it was never promoted), so that valve has been shut since June. He asked on Jun 27 and Oct 3. If holding is the job, idle cash may be the honest state, which is what the next question is about.",
    options: [
      { key: "voo", label: "Make VOO buyable as ballast" },
      { key: "drop", label: "Drop ballast; ask the idle-cash question instead" },
      UNSURE,
    ],
  },
  {
    key: "idle-cash-question",
    title: "Add an explicit idle-cash question to one daily check-in?",
    asks:
      "The 'top up your best holdings first' rule has nothing that asks the question, so cash sat at 13.6% for two weeks with one buy, and reached 19.7% after Oct 16's stop-outs. Stage 5 proposes one question at one check-in (is there a winner to top up, or a name you would hold for months?), never a cap.",
    options: [
      { key: "yes", label: "Yes, one question at one check-in" },
      { key: "no", label: "No, leave it" },
      UNSURE,
    ],
  },
  {
    key: "starters-per-week",
    title: "Cap new positions at two a week?",
    asks:
      "Alfred asked on Oct 3 and Oct 17; the gate allows 25 buys a week. Breadth creep and starter-for-starter swaps were where September's losses came from. The Sep 30 change rejected caps in favour of incentives, and he made three trades in the eleven days after it.",
    options: [
      { key: "cap-2", label: "Yes, two a week" },
      { key: "no-cap", label: "No cap — incentives, not limits" },
      UNSURE,
    ],
  },
  {
    key: "walls-as-anchors",
    title: "Retire put/call 'walls' as a reason to enter a name?",
    asks:
      "Three entries anchored on an options wall as support went 0 for 3 (OKE, RCL, BNY). Alfred would keep walls as a read on risk only. This changes the research instructions, not the order gate.",
    options: [
      { key: "retire", label: "Retire them as an entry reason" },
      { key: "keep", label: "Keep them" },
      UNSURE,
    ],
  },
  {
    key: "book-size",
    title: "Build the new book toward 12 to 15 names with a minimum position size?",
    asks:
      "Since Sep 26 the reviews have called 19 to 20 names, half of them below the bar, an expensive way to own the index. A 2% position on C$67k moves the fund by pennies and costs the same attention as a full one. The reset clears the current book; this is about how the next one is built.",
    options: [
      { key: "consolidate", label: "Yes — about 15 names, 2.5% minimum" },
      { key: "no-target", label: "No target; let the pass marks decide" },
      UNSURE,
    ],
  },
];

export function planQuestion(key: string): PlanQuestion | null {
  return PLAN_QUESTIONS.find((q) => q.key === key) ?? null;
}

export function planOptionLabel(questionKey: string, choice: string): string {
  return planQuestion(questionKey)?.options.find((o) => o.key === choice)?.label ?? choice;
}
