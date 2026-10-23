import type { PlanQuestion } from "./plan-questions";

// The members' discussion of the plan's questions, prepared (D139, Cam 2026-10-22: "make a new
// panel on that page to curate the discussion and prepare for it"). Pure: the page gathers the
// standing answers and decisions, this shapes them into one row per question — who said what,
// whether they agree, what is at stake, and a suggested landing — and a summary that puts the
// disagreements first. The prep text is written by Claude from the answers as recorded on the
// morning of Oct 22; the STATUS is computed live, so a changed answer changes the row.
//
// Written for Graham like the questions: short sentences, dollars not percentages, Alfred as a
// person. test/plan-discussion.test.ts pins the status logic.

export type DiscussionStatus =
  | "agreed" // both picked the same option
  | "differs" // both answered, different options
  | "both-unsure" // both picked Not sure
  | "one-unsure" // one answered, the other is Not sure
  | "awaiting-cam"
  | "awaiting-graham"
  | "awaiting-both";

export type MemberAnswer = { choice: string; choiceLabel: string; note: string | null; at: string };
export type Decision = { choice: string; choiceLabel: string; note: string | null; decidedBy: string; at: string };

export type DiscussionRow = {
  key: string;
  n: number;
  title: string;
  options: PlanQuestion["options"];
  cam: MemberAnswer | null;
  graham: MemberAnswer | null;
  status: DiscussionStatus;
  prep: PlanPrep | null;
  decision: Decision | null;
  /** Set when Cam put this question on the short list for the talk with Graham — the decision needed, in his words. */
  priority: { rank: number; ask: string } | null;
};

/** Cam's short list for the talk with Graham (2026-10-23: "its just deciding on question 3, a number for
 *  question 6, and whether or not we want to remove alfred from making decisions based on lots of people
 *  making puts (question 7)"). Shown first, in this order; everything else follows by status. */
export const PRIORITY: Array<{ key: string; ask: string }> = [
  { key: "single-name-cap", ask: "Decide it: a cap on one stock, and if so the number." },
  { key: "starters-per-week", ask: "Pick a number: how many new stocks a week." },
  { key: "walls-as-anchors", ask: "Decide whether Alfred stops buying and selling because lots of people are betting on a price with options (put walls)." },
];

export type PlanPrep = {
  /** What hangs on this question, in one or two short paragraphs. */
  stake: string;
  /** Where the two answers stand against each other, in plain words. */
  where: string;
  /** The suggested landing for the call, and what it would change in the code. */
  suggest: string;
  /** The question's own answer option the suggestion amounts to — what "Take the suggested landing"
   *  records (with `suggest` as the note). Pinned to the question's options by a test. */
  suggestChoice: string;
};

export const PREP_AS_OF = "Oct 22, 1:30 am ET";

/** The prep per question, written from the answers recorded by the morning of Oct 22. */
export const PLAN_PREP: Record<string, PlanPrep> = {
  "pass-marks": {
    stake:
      "The test is written down before the restart so nobody can move it afterwards. Rule 1 is the deployment clock: at least US$25,000 invested by Oct 30 and US$42,500 by Nov 20. Rules 2 to 4 are about how he buys and sells. Neither of you changed the four rules, so they stand as written.",
    where:
      "Cam accepted the four rules. Graham accepted them and added a fifth: it is fine to put most of the money into one stock he really believes in; diversification is not required, making money is. That fifth rule runs into Cam's answer on question 3, which puts a 50% ceiling on one stock. \"Most of the money\" means more than half.",
    suggest:
      "Keep the four rules as the test. Take Graham's fifth rule as the fund's attitude (no spreading out for its own sake, a big position in a name he believes in is allowed) and settle the exact ceiling under question 3, so the two answers do not contradict each other on paper.",
    suggestChoice: "accept",
  },
  "stop-width-in-code": {
    stake:
      "This is only about Alfred's own written give-up price on a NEW stock: must it sit at least two normal weekly moves below the price, as a hard rule, or just as advice? Today the code has one safety stop at 12% below what he paid (the Aggressive dial). Everything tighter is his own choice, and that is where the October exits came from: VNP and NVDA both went on give-up prices set a few dollars under the price.",
    where:
      "Graham is not sure, and drew a line worth keeping: a stop that caps a loss or locks in a gain is fine; selling because a stock is slow to move is not, because sometimes you hold for months before it pops. Cam has not answered this one yet.",
    suggest:
      "Make the width a hard rule for new stocks only (a give-up price no tighter than two weekly moves, or the 12% safety stop, whichever is wider), and write Graham's line into Alfred's standing lessons: a stop is for losses, never for impatience. Slowness is already not a reason to sell under the holding rule from Sep 30.",
    suggestChoice: "code",
  },
  "single-name-cap": {
    stake:
      "Today the code already limits one stock to 80% of the fund (the Aggressive dial). On US$50,000 that is US$40,000 in one name. A 50% cap would be US$25,000. The cap only ever stops a buy; it never makes Alfred sell. A bad day of 10% on a 50% position costs the fund US$2,500; on an 80% position, US$4,000.",
    where:
      "Cam wants a cap at 50%. Graham wants no limit, and his fifth rule on question 1 says most of the money in one stock is fine. These differ, but only in the top half: both are happy with a position far bigger than anything Alfred has ever held (his largest today is V at about US$6,500, 13% of the fund).",
    suggest:
      "A 50% ceiling in code, as a guardrail, not a target. It is one dial change (Aggressive 80 → 50) and it still allows a position four times bigger than any he has taken. If Graham wants the \"majority\" option kept open, the honest version is 60%: more than half, still not the whole fund. Pick one number tonight; it goes in the dial, humans only.",
    suggestChoice: "cap",
  },
  "usd-ballast": {
    stake:
      "When Alfred has spare US dollars and nothing he wants, he may park them in VOO, a fund that owns the whole US market, instead of leaving cash idle. The question was whether to keep that line in his instructions.",
    where:
      "You agree: both said yes. Cam added a condition: VOO must not count against the trading limits, so parking money and taking it back out is never a \"round trip\" and never uses up a new-stock slot.",
    suggest:
      "Agreed, with Cam's condition built in: VOO is parking, not a position. In code that means VOO is left out of the round-trip rule (pass mark 2), out of any weekly new-stock cap (question 6), out of the US$5,000 floor (question 8) and out of the rotation score in his track record. Nothing to discuss unless Graham objects to the condition.",
    suggestChoice: "voo",
  },
  "idle-cash-question": {
    stake:
      "Since Sep 30 Alfred's job has been to hold, and his check-ins became monitoring. The side effect: cash sat near US$9,000 for two weeks with nobody asking whether a winner deserved more. This adds one question at one check-in a day. It is a question, never a rule to spend.",
    where:
      "You agree: both said yes. Graham added that the answer can be to put more into one stock he really believes in rather than a new name, which is exactly what the question invites.",
    suggest:
      "Agreed. This ships in the next agent build, after tonight's discussion, as stage 5: at one check-in a day Alfred is asked whether a holding deserves a top-up or whether cash is sitting without a reason, and must answer in writing. Note this week he did top up twice without being asked (TDY and ATD on Oct 21), so the question is a backstop, not a kick.",
    suggestChoice: "yes",
  },
  "starters-per-week": {
    stake:
      "Today the code allows 25 new buys a week, which is no limit in practice. Last month's losses came from many small US$1,000 buys. The proposal was a ceiling of two new stocks a week. Top-ups to stocks he already owns would not count. It is a ceiling, never a quota: nothing forces him to use both.",
    where:
      "Both of you said Not sure, and your notes point the same way. Cam: with no rule he jumped to ten trades a day, and with a rule he has been performing strongly, but the number is unclear. Graham: no reason to keep buying when there is reason to hold; better one or two stocks he really believes in than a forced multitude. Neither of you wants a quota; both want few, well-chosen buys.",
    suggest:
      "Set two new stocks a week as the ceiling, with one exception written down: the first week after the restart allows up to four, because the book starts empty and pass mark 1 wants US$25,000 invested by Oct 30. After that, two. Top-ups never count. This is the number you both describe without naming.",
    suggestChoice: "cap-2",
  },
  "walls-as-anchors": {
    stake:
      "A \"wall\" is a price where a lot of option bets are stacked, and Alfred has been quoting them as reasons to act. This week he held GOOGL's sell decision to a US$334 close line next to a US$330 put wall. The question is whether walls should stop being a reason to buy or sell.",
    where:
      "Cam says stop using them. Graham has not answered. This is the one question with no answer from Graham; it is also the most technical of the eight, so a pass from Graham is reasonable.",
    suggest:
      "Retire walls as a reason to buy or sell; keep them as timing colour only (where an order might fill). That is a wording change in Alfred's instructions in the next build, nothing in the guardrails. If Graham has no view, Cam's answer stands.",
    suggestChoice: "retire",
  },
  "book-size": {
    stake:
      "Alfred owns 16 stocks today and most are small. Graham's floor of US$5,000 a stock would allow at most ten names on US$50,000; today only one of the sixteen (V) is above that floor. The \"about 15 names\" idea does not fit the same fund: 15 × US$5,000 is US$75,000.",
    where:
      "Graham wants no target count but says anything under US$5,000 in one stock should be strongly discouraged. Cam is not sure. Graham's floor and the 15-name idea cannot both be true, so this is really one decision: is there a minimum size?",
    suggest:
      "Adopt Graham's floor and drop the count: a new position is at least US$5,000 at entry (one tenth of the fund), top-ups are free, VOO is exempt. No target number of names. In code that is a minimum order value on a first buy, a §6-style rule humans own. It also makes question 6 easier: two US$5,000 starters a week is US$10,000 a week, on pace for pass mark 1.",
    suggestChoice: "no-target",
  },
};

export type AnswerIn = { questionKey: string; memberKey: "cam" | "graham" | null; choice: string; choiceLabel: string; note: string | null; at: string };
export type DecisionIn = { questionKey: string; choice: string; choiceLabel: string; note: string | null; decidedBy: string; at: string };

export function discussionStatus(cam: MemberAnswer | null, graham: MemberAnswer | null): DiscussionStatus {
  if (!cam && !graham) return "awaiting-both";
  if (!cam) return "awaiting-cam";
  if (!graham) return "awaiting-graham";
  if (cam.choice === graham.choice) return cam.choice === "unsure" ? "both-unsure" : "agreed";
  if (cam.choice === "unsure" || graham.choice === "unsure") return "one-unsure";
  return "differs";
}

export function discussionRows(questions: readonly PlanQuestion[], answers: AnswerIn[], decisions: DecisionIn[] = []): DiscussionRow[] {
  return questions.map((q, i) => {
    const pick = (who: "cam" | "graham"): MemberAnswer | null => {
      const a = answers.find((x) => x.questionKey === q.key && x.memberKey === who);
      return a ? { choice: a.choice, choiceLabel: a.choiceLabel, note: a.note, at: a.at } : null;
    };
    const cam = pick("cam");
    const graham = pick("graham");
    const d = decisions.find((x) => x.questionKey === q.key) ?? null;
    return {
      key: q.key,
      n: i + 1,
      title: q.title,
      options: q.options,
      cam,
      graham,
      status: discussionStatus(cam, graham),
      prep: PLAN_PREP[q.key] ?? null,
      decision: d ? { choice: d.choice, choiceLabel: d.choiceLabel, note: d.note, decidedBy: d.decidedBy, at: d.at } : null,
      priority: (() => {
        const r = PRIORITY.findIndex((x) => x.key === q.key);
        return r >= 0 ? { rank: r, ask: PRIORITY[r].ask } : null;
      })(),
    };
  });
}

export const STATUS_LABEL: Record<DiscussionStatus, string> = {
  agreed: "You agree",
  differs: "You differ",
  "both-unsure": "Both unsure",
  "one-unsure": "One unsure",
  "awaiting-cam": "Waiting on Cam",
  "awaiting-graham": "Waiting on Graham",
  "awaiting-both": "No answers yet",
};

/** The order of business: disagreements first, then the open ones, then what is already agreed. */
export const STATUS_ORDER: DiscussionStatus[] = ["differs", "one-unsure", "both-unsure", "awaiting-cam", "awaiting-graham", "awaiting-both", "agreed"];

export function orderOfBusiness(rows: DiscussionRow[]): DiscussionRow[] {
  return [...rows].sort((a, b) => {
    // Cam's priorities first, in his order, decided or not — they're the agenda.
    const pa = a.priority?.rank ?? 99;
    const pb = b.priority?.rank ?? 99;
    if (pa !== pb) return pa - pb;
    const da = a.decision ? 1 : 0;
    const db = b.decision ? 1 : 0;
    if (da !== db) return da - db; // decided ones sink to the bottom
    return STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.n - b.n;
  });
}

export type DiscussionSummary = { agreed: number; differ: number; open: number; decided: number; total: number };

export function discussionSummary(rows: DiscussionRow[]): DiscussionSummary {
  const s: DiscussionSummary = { agreed: 0, differ: 0, open: 0, decided: 0, total: rows.length };
  for (const r of rows) {
    if (r.decision) s.decided++;
    if (r.status === "agreed") s.agreed++;
    else if (r.status === "differs") s.differ++;
    else s.open++;
  }
  return s;
}
