import { prisma } from "./db";
import { PLAN_ROUND, planQuestion, planOptionLabel } from "./plan-questions";
import { memberKeyForEmail, userForEmail } from "./users";

// The members' recorded answers to the plan's questions (D139). Append-only: every submission is a
// row, and the newest row per (question, member) is the standing answer — so a changed mind is
// kept, not overwritten. Read by the How-GRQ-works page (both members see both answers) and by
// the Saturday review, which treats them as decisions.
export type StandingAnswer = {
  round: string;
  questionKey: string;
  email: string;
  memberKey: "cam" | "graham" | null;
  name: string;
  choice: string;
  choiceLabel: string;
  note: string | null;
  at: Date;
};

export async function standingAnswers(round: string = PLAN_ROUND.key): Promise<StandingAnswer[]> {
  const rows = await prisma.planAnswer.findMany({ where: { round }, orderBy: { at: "desc" } });
  const seen = new Set<string>();
  const out: StandingAnswer[] = [];
  for (const r of rows) {
    const k = `${r.questionKey}|${r.email}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({
      round: r.round,
      questionKey: r.questionKey,
      email: r.email,
      memberKey: memberKeyForEmail(r.email),
      name: userForEmail(r.email)?.name ?? r.email.split("@")[0],
      choice: r.choice,
      choiceLabel: planOptionLabel(r.questionKey, r.choice),
      note: r.note,
      at: r.at,
    });
  }
  return out;
}

export type RecordAnswerInput = { email: string; questionKey: string; choice: string; note?: string | null; round?: string };

/** Validates against the question list and appends one row. Throws on an unknown question/option. */
export async function recordAnswer(input: RecordAnswerInput) {
  const round = input.round ?? PLAN_ROUND.key;
  const q = planQuestion(input.questionKey);
  if (!q) throw new Error("Unknown question.");
  if (!q.options.some((o) => o.key === input.choice)) throw new Error("Pick one of the offered answers.");
  const note = (input.note ?? "").trim().slice(0, 2000) || null;
  return prisma.planAnswer.create({ data: { round, questionKey: q.key, email: input.email.toLowerCase(), choice: input.choice, note } });
}
