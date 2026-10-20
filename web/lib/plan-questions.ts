// The plan's open questions, posed to the members on the site (Cam, 2026-10-18: "pose the questions
// to Graham, with the ability for him to submit answers that we record. we can then review them
// prior to Thursday night and include it in our plan"). For 19 weeks the Saturday review proposed
// strategy changes "pending Cam & Graham's approval" with nowhere for an answer to land, so it
// re-asked the same things (a single-name cap, 8 times) and asked for things that had shipped.
// This file is the question list; PlanAnswer rows (lib/plan-answers.ts) are the answers; the
// Saturday review reads both back (agent/review-memory.ts). D139.
//
// WRITTEN FOR GRAHAM (Cam, 2026-10-20). The first draft was written in the fund's shorthand
// ("a round trip", "a stop two weekly moves wide", "ballast") and Graham could not answer it:
// "I need so much context for all these questions." So every question now carries `means` — what
// the words mean and what changes if the answer is yes — before `asks`, the history behind it.
// Rules for the text: define every term where it is used; say dollars before percentages (Graham
// reads dollars); a `[[slug|label]]` marks a word the glossary can explain on tap, and the slug
// must exist in lib/glossary.ts (test/plan-questions.test.ts checks both the dollars and the slugs).
//
// A question's key is stable for its round. Edit the words freely; never reuse a key for a
// different question in the same round, or an old answer would answer the new question.
export type PlanOption = { key: string; label: string };
export type PlanQuestion = {
  key: string;
  /** The question, one line, in plain words. The Saturday review reads this line back. */
  title: string;
  /** What the words mean and what changes if the answer is yes. Paragraphs split on a blank line. */
  means: string;
  /** Where it comes from: the history, in dollars where there are any. Paragraphs split on a blank line. */
  asks: string;
  options: PlanOption[];
};

export const PLAN_ROUND = {
  key: "2026-10-22",
  label: "the Oct 22 decision",
  due: "Wednesday Oct 21",
} as const;

/** The framing above the questions: why they are being asked at all. */
export const PLAN_INTRO =
  "On Thursday Oct 22 Alfred's practice account is sold out completely and reset to US$50,000; Friday is day 1 of a fresh start. " +
  "These eight questions decide the rules the new book is built under. Each one explains what the words mean and why we're asking. " +
  "If anything is still unclear, pick \"Not sure\" and say what's unclear in the note — we'll talk it through Thursday.";

const UNSURE: PlanOption = { key: "unsure", label: "Not sure — talk it through Thursday" };

export const PLAN_QUESTIONS: readonly PlanQuestion[] = [
  {
    key: "pass-marks",
    title: "Agree the pass marks: what the new US$50,000 book has to do before we would put real money in.",
    means:
      "A pass mark is a test we write down now, before the fresh start, so nobody can move the goalposts afterwards. Four are proposed.\n\n" +
      "1. He has to actually invest the money, not sit on it: at least US$25,000 of the US$50,000 invested by Oct 30 (trading day 5), US$35,000 by Nov 6 (day 10) and US$42,500 by Nov 20 (day 20).\n\n" +
      "2. No round trips inside 30 days. A round trip is buying a stock and then selling it again. Doing that within a month is a sign of trading on nerves rather than on a plan.\n\n" +
      "3. Every buy must be a stock his own [[confidence|confidence score]] puts at 70 out of 100 or higher, with three things written down first: the thesis (why he's buying), the invalidation (what would prove him wrong) and a [[stop-loss|stop]] (the price at which he'll sell to cap the loss) set far enough below the price that an ordinary week's wobble can't knock him out.\n\n" +
      "4. He can't sell a stock just because his confidence number on it dropped. The reason has to be the business, or the stop he wrote down.\n\n" +
      "Miss any one and it's a fail: the practice run continues and real money waits another cycle.",
    asks:
      "These numbers are a proposal, not a decision. If you'd give him more time to invest, or want a rule softer or harder, say so in the note. Due Wednesday so they're on paper before Thursday's reset.",
    options: [
      { key: "accept", label: "Accept these marks" },
      { key: "change", label: "Change a number (say which, in the note)" },
      { key: "add", label: "Add a rule (say what, in the note)" },
    ],
  },
  {
    key: "stop-width-in-code",
    title: "Should the code refuse a buy when the sell-point Alfred has set is too close to the price he's paying?",
    means:
      "When Alfred buys, he writes down a [[stop-loss|stop]]: the price where he'll sell to cap the loss if he's wrong. Every stock wobbles a certain amount in a normal week with no news at all — a steady stock maybe 2–3% (US$20–30 on a US$1,000 position), a jumpy one 5–7% (US$50–70). If the stop sits inside that normal wobble, an ordinary week knocks him out of a stock he still believes in, and he books a small loss for nothing.\n\n" +
      "\"Two weekly moves wide\" means the stop must sit at least twice a normal week's wobble below the price: on a stock that usually moves 5% in a week, no closer than about 10% below — on a US$1,000 position, a stop no nearer than about US$100 down.\n\n" +
      "Yes makes that a hard rule the code enforces: an order with a tighter stop is refused. No keeps it as advice he's asked to follow.",
    asks:
      "Since Sep 30 Alfred has sold six times and lost money all six times, between $36 and $132 each. Four of them (OKE, VRTX, VNP, NVDA) were stops set inside the normal wobble — NVDA's was only 1.5% below the price, about $33 on a $2,200 position. In each case nothing had changed at the company; the whole sector dipped for a day. Alfred asked for this rule himself on Oct 17, but he already carries a softer version as a lesson and has ignored it once. In code, he can't.",
    options: [
      { key: "code", label: "Yes, make the code refuse it" },
      { key: "lesson", label: "No, keep it as advice" },
      UNSURE,
    ],
  },
  {
    key: "single-name-cap",
    title: "Should one stock be stopped from growing past about 15% of the fund?",
    means:
      "Today the only hard limit lets a single stock grow to 80% of the fund. A cap of 13–15% would mean no one stock can be worth more than about US$6,500–7,500 of the new US$50,000 book (on today's C$67,600 fund, about C$8,800–10,100).\n\n" +
      "Right now the biggest holding is Visa at C$7,335, about 11% of the fund, so a cap wouldn't bite today. It's about the day he wants to pile into one name.",
    asks:
      "Alfred has asked for a cap like this in 8 of the last 19 weekly reviews. On Sep 30 we chose not to, on the theory that a cap becomes a target: tell him 15% and he'll sit at 15%. The case for it is that one bad day in a stock that is a quarter of the fund (US$12,500) hurts in a way no single call should.",
    options: [
      { key: "cap", label: "Yes, cap it (put the % in the note)" },
      { key: "no-cap", label: "No cap, leave it to Alfred" },
      UNSURE,
    ],
  },
  {
    key: "usd-ballast",
    title: "When Alfred holds US dollars and has nothing he's confident enough to buy, should he be allowed to park them in a broad US index fund (VOO)?",
    means:
      "VOO is one ticker that owns the 500 biggest US companies at once — a Vanguard [[etf|ETF]]. \"Ballast\" means parking spare cash there so it earns roughly what the US market earns instead of earning nothing while it sits idle.\n\n" +
      "Alfred's instructions already tell him to do this, but he can't: VOO was never added to the list of names he's allowed to buy, so that line has been dead since June. Either we add VOO, or we take the line out of his instructions and accept that idle cash is sometimes the honest answer (that's question 5).",
    asks:
      "He asked on Jun 27 and again on Oct 3. Today the fund holds about US$8,600 in US cash doing nothing. Parking it in VOO is low-drama; the catch is that it counts as \"invested\" for the pass marks in question 1 without being a real decision.",
    options: [
      { key: "voo", label: "Yes, let him park it in VOO" },
      { key: "drop", label: "No, drop the idea; ask about idle cash instead" },
      UNSURE,
    ],
  },
  {
    key: "idle-cash-question",
    title: "Should one of Alfred's daily check-ins ask him outright whether cash is sitting idle for a reason?",
    means:
      "Alfred checks the book every 30 minutes during the trading day. None of those check-ins asks \"is there cash doing nothing, and should it be?\" The proposal is one plain question at one check-in a day: is there a winner you'd add to, or a stock you'd happily hold for months? If not, holding cash is fine.\n\n" +
      "It's a question, not a rule. He can't be made to buy, and there is no cash limit behind it.",
    asks:
      "Cash sat at about C$9,000 (13.6% of the fund) for two weeks with one buy, and after the Oct 16 sells it's about C$13,300 (19.6%). The pass marks in question 1 need most of the new US$50,000 invested within a month, so a nudge may be needed. The alternative is a cap on cash, which we're against: a cap makes him buy things just to hit a number.",
    options: [
      { key: "yes", label: "Yes, ask once a day" },
      { key: "no", label: "No, leave it" },
      UNSURE,
    ],
  },
  {
    key: "starters-per-week",
    title: "Should Alfred be limited to opening two new positions a week?",
    means:
      "A \"starter\" is a small first buy of a stock he doesn't yet own, usually about 2% of the fund (about US$1,000 of the new book), meant to be added to later if it works. The code today lets him make 25 buys a week.\n\n" +
      "A limit of two a week only applies to starting new names. It wouldn't stop him adding to stocks he already owns.",
    asks:
      "September's losses came from spreading too thin: too many small new names, and selling one small [[position|position]] to fund the next one. Alfred asked for this limit himself on Oct 3 and Oct 17. On Sep 30 we chose incentives over limits, and in the eleven days after that he made three trades in total, so the behaviour may already have changed without a rule.",
    options: [
      { key: "cap-2", label: "Yes, two a week" },
      { key: "no-cap", label: "No limit" },
      UNSURE,
    ],
  },
  {
    key: "walls-as-anchors",
    title: "Should Alfred stop using options \"walls\" as a reason to buy a stock?",
    means:
      "An [[call-wall|options wall]] is a price where a lot of options contracts are piled up. Traders sometimes treat it as a floor the stock \"shouldn't\" fall through, because of how the big dealers on the other side of those contracts hedge. Alfred has bought stocks partly because they were sitting on a wall.\n\n" +
      "Yes tells him, in his research instructions: you may still use a wall as a warning about where a stock could get jumpy, but never as a reason to buy. It changes his instructions only, not any of the money rules.",
    asks:
      "Three buys leaned on a wall as the floor — OKE, RCL and BNY — and all three fell straight through it. Alfred has said he'd be fine keeping walls as a risk read only.",
    options: [
      { key: "retire", label: "Yes, stop using walls as a reason to buy" },
      { key: "keep", label: "No, keep using them" },
      UNSURE,
    ],
  },
  {
    key: "book-size",
    title: "Should the new book be built as roughly 12–15 stocks, each at least 2.5% of the fund, instead of 20 small ones?",
    means:
      "Fewer, bigger positions. On the new US$50,000 book, a 2.5% minimum means every [[position|position]] is at least US$1,250, and about 15 names fills it.\n\n" +
      "Today's book has 16 names, and the weekly reviews have been covering 19–20, half of them stocks Alfred's own score doesn't rate as a buy. A 2% position (US$1,000) going up 10% adds US$100 — the fund barely notices — but it takes the same research time as a full-size one. Thursday's reset clears the current book; this is about how the next one is built.",
    asks:
      "The alternative is to set no target and let the pass marks in question 1 do the work: if he has to invest US$42,500 within 20 days without round trips, he'll have to pick.",
    options: [
      { key: "consolidate", label: "Yes, about 15 names, 2.5% minimum" },
      { key: "no-target", label: "No target, let the pass marks decide" },
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
