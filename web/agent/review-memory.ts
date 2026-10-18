// What the Saturday review must remember before it proposes anything (D139, 2026-10-18). For 19
// weeks it proposed strategy changes "pending the members' approval" with no memory of what it
// had already asked, what the members had answered, or what had shipped — so it asked for a
// single-name cap eight times and for a cancel tool three days after one landed. Pure: the
// runner gathers the rows, this shapes the block the prompt carries.

export type DiaryEntry = { date: string; title: string; body: string };
export type AnswerLine = { question: string; name: string; choice: string; note: string | null; date: string };

const HEADING = /^## .*proposed strategy/i;

/** The "Proposed strategy …" section of a weekly report, without its heading; null when absent. */
export function proposalsSection(md: string): string | null {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => HEADING.test(l));
  if (start < 0) return null;
  let end = lines.findIndex((l, i) => i > start && l.startsWith("## "));
  if (end < 0) end = lines.length;
  const body = lines.slice(start + 1, end).join("\n").trim();
  return body || null;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).trimEnd()} …` : s);

export function reviewMemoryBlock(args: {
  diary: DiaryEntry[];
  lastProposals: string | null;
  lastProposalsDate: string | null;
  answers: AnswerLine[];
}): string {
  const diary = args.diary.length
    ? args.diary.map((d) => `- ${d.date} — ${d.title}: ${clip(d.body.replace(/\s+/g, " ").trim(), 900)}`).join("\n")
    : "- (nothing shipped this week)";
  const last = args.lastProposals
    ? `Your proposals last week (${args.lastProposalsDate ?? "previous review"}):\n${args.lastProposals}`
    : "You made no proposals last week.";
  const answers = args.answers.length
    ? args.answers.map((a) => `- ${a.question} — ${a.name}: ${a.choice}${a.note ? ` (${a.note})` : ""} · ${a.date}`).join("\n")
    : "- (no answers recorded yet)";
  return `# WHAT CHANGED THIS WEEK — read before proposing anything
The build diary for the last 7 days, written for the members. A proposal that has shipped is CLOSED: do not ask for it again, note it as done.
${diary}

# WHAT YOU ALREADY PROPOSED, AND WHAT THE MEMBERS ANSWERED
${last}

The members' standing answers to the plan's questions. These are DECISIONS: an accepted item is approved (say it is, and act within it), a declined item is declined (do not re-propose it), an unsure one is still open (one line under "Still open", not a fresh pitch):
${answers}`;
}
