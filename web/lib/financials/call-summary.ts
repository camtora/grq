// Earnings-call summaries — the PURE half (D140 F8). The prompt, the output schema, and the check
// that keeps a summary honest: every "quote" must appear verbatim in the transcript, or it is dropped.
//
// The summary is written from the TRANSCRIPT ALONE: no persona, no tools, no fund context. That is
// why the open user tier may read it (Cam, 2026-10-22) — it is not one of Alfred's write-ups, which
// carry the book (D122). Never add the book, a position, or Alfred's call to this prompt.

export type CallSummary = {
  headline: string; // one plain sentence: what this call said
  guidance: { direction: "raised" | "maintained" | "lowered" | "introduced" | "withdrawn" | "none"; detail: string };
  tone: "confident" | "balanced" | "cautious" | "defensive";
  toneWhy: string;
  highlights: string[]; // the numbers that mattered, dollars first
  risks: string[];
  dodged: string[]; // analyst questions management did not answer directly
  quotes: Array<{ speaker: string; text: string }>; // verbatim — checked against the transcript
};

export const CALL_SUMMARY_SYSTEM =
  "You summarize a public company's earnings-call transcript for two non-expert investors. Write in plain " +
  "English a 12-year-old could follow: short sentences, no jargon without a few words saying what it means, and " +
  "dollar amounts before percentages (\"sales of $4.1 billion, up $600 million on a year ago\"). Report only what " +
  "the transcript says — no outside knowledge, no opinion on the stock, no buy or sell view. Be strict about " +
  "'dodged': list an analyst question only when management clearly did not answer it. Quotes must be copied " +
  "exactly, word for word, from the transcript.";

export const CALL_SUMMARY_SCHEMA = {
  type: "json_schema" as const,
  schema: {
    type: "object",
    properties: {
      headline: { type: "string" },
      guidance: {
        type: "object",
        properties: {
          direction: { enum: ["raised", "maintained", "lowered", "introduced", "withdrawn", "none"] },
          detail: { type: "string" },
        },
        required: ["direction", "detail"],
        additionalProperties: false,
      },
      tone: { enum: ["confident", "balanced", "cautious", "defensive"] },
      toneWhy: { type: "string" },
      highlights: { type: "array", items: { type: "string" } },
      risks: { type: "array", items: { type: "string" } },
      dodged: { type: "array", items: { type: "string" } },
      quotes: {
        type: "array",
        items: {
          type: "object",
          properties: { speaker: { type: "string" }, text: { type: "string" } },
          required: ["speaker", "text"],
          additionalProperties: false,
        },
      },
    },
    required: ["headline", "guidance", "tone", "toneWhy", "highlights", "risks", "dodged", "quotes"],
    additionalProperties: false,
  },
};

export function callSummaryPrompt(company: string, label: string, transcript: string): string {
  return (
    `Company: ${company}\nCall: ${label}\n\n` +
    `Summarize this earnings call. headline: one sentence. guidance: did they raise, keep, lower, introduce or ` +
    `withdraw their outlook, and what exactly. tone: how management sounded, and why you say so. highlights: 3–5 ` +
    `of the numbers that mattered. risks: up to 3 worries they raised or were asked about. dodged: up to 3 analyst ` +
    `questions they did not answer directly (empty if none). quotes: up to 3 short sentences copied exactly.\n\n` +
    `<transcript>\n${transcript}\n</transcript>`
  );
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-z0-9$%'".,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Keep a quote only if it appears verbatim in the transcript (whitespace, case and curly quotes
 *  aside). A model that paraphrases into quote marks is the one failure a reader can't catch. */
export function verifiedQuotes(quotes: CallSummary["quotes"], transcript: string): CallSummary["quotes"] {
  const hay = norm(transcript);
  return quotes.filter((q) => {
    const n = norm(q.text);
    return n.length >= 12 && hay.includes(n);
  });
}

const DIRECTIONS = new Set(["raised", "maintained", "lowered", "introduced", "withdrawn", "none"]);
const TONES = new Set(["confident", "balanced", "cautious", "defensive"]);
const strs = (v: unknown, max: number): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, max) : [];

/** Parse + validate the model's JSON; null if the shape is wrong. Quotes are checked here too. */
export function parseCallSummary(text: string | null, transcript: string): CallSummary | null {
  if (!text) return null;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(text);
  } catch {
    return null;
  }
  const g = (o.guidance ?? {}) as Record<string, unknown>;
  if (typeof o.headline !== "string" || !DIRECTIONS.has(String(g.direction)) || !TONES.has(String(o.tone))) return null;
  const quotes = Array.isArray(o.quotes)
    ? (o.quotes as Array<Record<string, unknown>>)
        .filter((q) => typeof q?.text === "string")
        .map((q) => ({ speaker: String(q.speaker ?? ""), text: String(q.text) }))
    : [];
  return {
    headline: o.headline,
    guidance: { direction: g.direction as CallSummary["guidance"]["direction"], detail: String(g.detail ?? "") },
    tone: o.tone as CallSummary["tone"],
    toneWhy: String(o.toneWhy ?? ""),
    highlights: strs(o.highlights, 5),
    risks: strs(o.risks, 3),
    dodged: strs(o.dodged, 3),
    quotes: verifiedQuotes(quotes, transcript).slice(0, 3),
  };
}
