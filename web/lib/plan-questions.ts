// The plan's open questions, posed to the members on the site (Cam, 2026-10-18: "pose the questions
// to Graham, with the ability for him to submit answers that we record. we can then review them
// prior to Thursday night and include it in our plan"). For 19 weeks the Saturday review proposed
// strategy changes "pending Cam & Graham's approval" with nowhere for an answer to land, so it
// re-asked the same things (a single-name cap, 8 times) and asked for things that had shipped.
// This file is the question list; PlanAnswer rows (lib/plan-answers.ts) are the answers; the
// Saturday review reads both back (agent/review-memory.ts). D139.
//
// WRITTEN FOR GRAHAM (Cam, 2026-10-20). The first draft was in the fund's shorthand ("a round
// trip", "a stop two weekly moves wide", "ballast") and Graham could not answer it: "I need so much
// context for all these questions." The second draft defined every term and he still "kinda had no
// idea": "Just ask it to rewrite so a 10 year old can understand." So the card now LEADS with
// `simple` — the 10-year-old version: short sentences, everyday words, Alfred as a person, dollars
// not percentages — and folds `means` (what the words mean) + `asks` (the history) under "More
// detail" for whoever wants it. test/plan-questions.test.ts enforces the simple version: no sentence
// over 22 words and none of the fund's jargon (the banned list is there); for every field, a
// paragraph with a % also says $; a `[[slug|label]]` tap must name a glossary word.
//
// A question's key is stable for its round. Edit the words freely; never reuse a key for a
// different question in the same round, or an old answer would answer the new question.
export type PlanOption = { key: string; label: string };
export type PlanQuestion = {
  key: string;
  /** The question, one line, in a 10-year-old's words. The Saturday review reads this line back. */
  title: string;
  /** The simple version, shown first: what we're deciding and why, in everyday words. Paragraphs split on a blank line. */
  simple: string;
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
  "Alfred is the computer program that picks the stocks. On Thursday we wipe his practice money and start him again with US$50,000 of pretend money. " +
  "These eight questions set the rules for the restart. Each one has a short version; tap \"More detail\" if you want the long one. " +
  "If a question still makes no sense, pick \"Not sure\" and tell us what lost you in the note.";

const UNSURE: PlanOption = { key: "unsure", label: "Not sure — talk it through Thursday" };

export const PLAN_QUESTIONS: readonly PlanQuestion[] = [
  {
    key: "pass-marks",
    title: "What does Alfred have to get right before we trust him with real money?",
    simple:
      "On Thursday Alfred starts over with US$50,000 of pretend money. Before he ever gets real money, we want a test written down now, so nobody can change it later. Four rules are proposed.\n\n" +
      "1. He has to use the money, not sit on it. At least US$25,000 spent on stocks by Oct 30, and US$42,500 by Nov 20.\n\n" +
      "2. He can't buy a stock and then sell it again within a month.\n\n" +
      "3. Before every buy, he writes down three things: why he's buying, what would prove him wrong, and his give-up price.\n\n" +
      "4. He can't sell a stock just because he feels less sure about it.\n\n" +
      "If he breaks any of these, he waits longer for real money. Do these rules sound right to you?",
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
      { key: "accept", label: "Yes, that's the test" },
      { key: "change", label: "Change something (say what, in the note)" },
      { key: "add", label: "Add a rule (say what, in the note)" },
    ],
  },
  {
    key: "stop-width-in-code",
    title: "Should Alfred be banned from giving up on a stock too quickly?",
    simple:
      "When Alfred buys a stock, he picks a give-up price. If the stock falls to it, he sells and takes the loss.\n\n" +
      "Stocks bounce up and down a bit every week, even when nothing happened. Alfred has been setting his give-up price so close that a normal little bounce made him sell. He did that four times this month and lost money every time, between $36 and $132 a go.\n\n" +
      "Should we make it a hard rule that the give-up price has to sit farther away? Then a normal bounce can't knock him out. Or should we just tell him to do better?",
    means:
      "When Alfred buys, he writes down a [[stop-loss|stop]]: the price where he'll sell to cap the loss if he's wrong. Every stock wobbles a certain amount in a normal week with no news at all — a steady stock maybe 2–3% (US$20–30 on a US$1,000 position), a jumpy one 5–7% (US$50–70). If the stop sits inside that normal wobble, an ordinary week knocks him out of a stock he still believes in, and he books a small loss for nothing.\n\n" +
      "\"Two weekly moves wide\" means the stop must sit at least twice a normal week's wobble below the price: on a stock that usually moves 5% in a week, no closer than about 10% below — on a US$1,000 position, a stop no nearer than about US$100 down.\n\n" +
      "Yes makes that a hard rule the code enforces: an order with a tighter stop is refused. No keeps it as advice he's asked to follow.",
    asks:
      "Since Sep 30 Alfred has sold six times and lost money all six times, between $36 and $132 each. Four of them (OKE, VRTX, VNP, NVDA) were stops set inside the normal wobble — NVDA's was only 1.5% below the price, about $33 on a $2,200 position. In each case nothing had changed at the company; the whole sector dipped for a day. Alfred asked for this rule himself on Oct 17, but he already carries a softer version as a lesson and has ignored it once. In code, he can't.",
    options: [
      { key: "code", label: "Yes, make it a hard rule" },
      { key: "lesson", label: "No, just tell him" },
      UNSURE,
    ],
  },
  {
    key: "single-name-cap",
    title: "Should there be a limit on how much of the money can go into one stock?",
    simple:
      "Right now Alfred could put almost all the money into a single stock if he wanted to. The biggest one he owns today is Visa, about C$7,300 out of C$67,600, so about one dollar in nine.\n\n" +
      "Alfred keeps asking us for a limit, something like \"no stock can be more than US$7,500 of the US$50,000\". Last month we said no, because we worried a limit becomes a target he always fills up to.\n\n" +
      "Should there be a limit?",
    means:
      "Today the only hard limit lets a single stock grow to 80% of the fund. A cap of 13–15% would mean no one stock can be worth more than about US$6,500–7,500 of the new US$50,000 book (on today's C$67,600 fund, about C$8,800–10,100).\n\n" +
      "Right now the biggest holding is Visa at C$7,335, about 11% of the fund, so a cap wouldn't bite today. It's about the day he wants to pile into one name.",
    asks:
      "Alfred has asked for a cap like this in 8 of the last 19 weekly reviews. On Sep 30 we chose not to, on the theory that a cap becomes a target: tell him 15% and he'll sit at 15%. The case for it is that one bad day in a stock that is a quarter of the fund (US$12,500) hurts in a way no single call should.",
    options: [
      { key: "cap", label: "Yes, set a limit (say how much)" },
      { key: "no-cap", label: "No limit" },
      UNSURE,
    ],
  },
  {
    key: "usd-ballast",
    title: "When Alfred has spare US dollars and nothing he really wants, can he park them in a \"whole market\" fund?",
    simple:
      "VOO is one thing you can buy that is a tiny slice of the 500 biggest American companies, all at once. It's the boring, safe-ish choice.\n\n" +
      "Alfred's instructions say: if you have spare US dollars and nothing you love, put them in VOO. But we never put VOO on the list of things he's allowed to buy, so he can't. Right now about US$8,600 is sitting there doing nothing.\n\n" +
      "Should we let him park spare money in VOO, or take that line out of his instructions?",
    means:
      "VOO is one ticker that owns the 500 biggest US companies at once — a Vanguard [[etf|ETF]]. \"Ballast\" means parking spare cash there so it earns roughly what the US market earns instead of earning nothing while it sits idle.\n\n" +
      "Alfred's instructions already tell him to do this, but he can't: VOO was never added to the list of names he's allowed to buy, so that line has been dead since June. Either we add VOO, or we take the line out of his instructions and accept that idle cash is sometimes the honest answer (that's question 5).",
    asks:
      "He asked on Jun 27 and again on Oct 3. Today the fund holds about US$8,600 in US cash doing nothing. Parking it in VOO is low-drama; the catch is that it counts as \"invested\" for the pass marks in question 1 without being a real decision.",
    options: [
      { key: "voo", label: "Yes, let him park it in VOO" },
      { key: "drop", label: "No, take the line out" },
      UNSURE,
    ],
  },
  {
    key: "idle-cash-question",
    title: "Should Alfred be asked once a day whether his spare money is just sitting there?",
    simple:
      "Alfred checks on things every 30 minutes while the market is open. But nothing ever asks him: you've got cash doing nothing, is there a good reason? Right now about C$13,300 is sitting unused.\n\n" +
      "We don't want to force him to buy things. We just want him asked, once a day. Should we add that question?",
    means:
      "Alfred checks the book every 30 minutes during the trading day. None of those check-ins asks \"is there cash doing nothing, and should it be?\" The proposal is one plain question at one check-in a day: is there a winner you'd add to, or a stock you'd happily hold for months? If not, holding cash is fine.\n\n" +
      "It's a question, not a rule. He can't be made to buy, and there is no cash limit behind it.",
    asks:
      "Cash sat at about C$9,000 (13.6% of the fund) for two weeks with one buy, and after the Oct 16 sells it's about C$13,300 (19.6%). The pass marks in question 1 need most of the new US$50,000 invested within a month, so a nudge may be needed. The alternative is a cap on cash, which we're against: a cap makes him buy things just to hit a number.",
    options: [
      { key: "yes", label: "Yes, ask him once a day" },
      { key: "no", label: "No, leave it" },
      UNSURE,
    ],
  },
  {
    key: "starters-per-week",
    title: "Should Alfred only be allowed to start two new stocks a week?",
    simple:
      "Last month Alfred kept buying small amounts of lots of different stocks, around US$1,000 each, and selling one to buy the next. That's where September's losses came from. The rules let him make 25 buys a week.\n\n" +
      "This would limit him to starting two new stocks a week. He could still add to ones he already owns. Alfred asked for this limit himself.",
    means:
      "A \"starter\" is a small first buy of a stock he doesn't yet own, usually about 2% of the fund (about US$1,000 of the new book), meant to be added to later if it works. The code today lets him make 25 buys a week.\n\n" +
      "A limit of two a week only applies to starting new names. It wouldn't stop him adding to stocks he already owns.",
    asks:
      "September's losses came from spreading too thin: too many small new names, and selling one small [[position|position]] to fund the next one. Alfred asked for this limit himself on Oct 3 and Oct 17. On Sep 30 we chose incentives over limits, and in the eleven days after that he made three trades in total, so the behaviour may already have changed without a rule.",
    options: [
      { key: "cap-2", label: "Yes, two new ones a week" },
      { key: "no-cap", label: "No limit" },
      UNSURE,
    ],
  },
  {
    key: "walls-as-anchors",
    title: "Should Alfred stop using \"walls\" as a reason to buy?",
    simple:
      "Some traders make side bets on where a stock's price will go. When lots of those bets pile up at one price, people call it a wall. They think the price won't fall through it, like a floor.\n\n" +
      "Alfred bought three stocks mainly because they were sitting on a floor like that. All three fell straight through it. Should we tell him a wall is not a reason to buy anymore?",
    means:
      "An [[call-wall|options wall]] is a price where a lot of options contracts are piled up. Traders sometimes treat it as a floor the stock \"shouldn't\" fall through, because of how the big dealers on the other side of those contracts hedge. Alfred has bought stocks partly because they were sitting on a wall.\n\n" +
      "Yes tells him, in his research instructions: you may still use a wall as a warning about where a stock could get jumpy, but never as a reason to buy. It changes his instructions only, not any of the money rules.",
    asks:
      "Three buys leaned on a wall as the floor — OKE, RCL and BNY — and all three fell straight through it. Alfred has said he'd be fine keeping walls as a risk read only.",
    options: [
      { key: "retire", label: "Yes, stop using walls" },
      { key: "keep", label: "No, keep using them" },
      UNSURE,
    ],
  },
  {
    key: "book-size",
    title: "Should Alfred own fewer stocks, but more of each?",
    simple:
      "Alfred has about 20 stocks right now, and a lot of them are tiny, around US$1,000 each. A tiny one going up a tenth makes US$100, which the fund barely notices. But it takes just as much work to watch.\n\n" +
      "The idea: own about 15 stocks, and never put less than US$1,250 into any of them. Or set no target, and let the test in question 1 sort it out.",
    means:
      "Fewer, bigger positions. On the new US$50,000 book, a 2.5% minimum means every [[position|position]] is at least US$1,250, and about 15 names fills it.\n\n" +
      "Today's book has 16 names, and the weekly reviews have been covering 19–20, half of them stocks Alfred's own score doesn't rate as a buy. A 2% position (US$1,000) going up 10% adds US$100 — the fund barely notices — but it takes the same research time as a full-size one. Thursday's reset clears the current book; this is about how the next one is built.",
    asks:
      "The alternative is to set no target and let the pass marks in question 1 do the work: if he has to invest US$42,500 within 20 days without round trips, he'll have to pick.",
    options: [
      { key: "consolidate", label: "Yes, about 15 stocks, more in each" },
      { key: "no-target", label: "No target" },
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
