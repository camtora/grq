// GRQ's OWN call on a name (its judgment) — distinct from the deterministic
// signal consensus (a technicals formula, agent/signals.ts). The agent sets it
// in its dossier; the stock page shows it next to the signal read, and where the
// two DIVERGE is the interesting part (e.g. signal "Strong Buy" on momentum,
// GRQ "Weak Sell" because the balance sheet is rotting).
//
// 7-point scale (chosen 2026-06-16, Graham), deliberately the SAME VOCABULARY as
// the signal's graded label so the two read uniformly side by side — same words,
// different source. Green (buys) → amber (hold) → red (sells).

export const STANCE_VALUES = [
  "Strong Buy",
  "Buy",
  "Weak Buy",
  "Hold",
  "Weak Sell",
  "Sell",
  "Strong Sell",
] as const;
export type Stance = (typeof STANCE_VALUES)[number];

type Tone = "emerald" | "teal" | "amber" | "red";
// `pos` = needle position 0..1 on the red→amber→green track (Strong Sell 0 → Strong Buy 1),
// so a slider can render the CALL on the same axis as the signal (RatingBar).
type Meta = { label: Stance; abbr: string; tone: Tone; pos: number; blurb: string };

const META: Record<Stance, Meta> = {
  "Strong Buy": { label: "Strong Buy", abbr: "SB", tone: "emerald", pos: 1, blurb: "high-conviction buy at today's price" },
  Buy: { label: "Buy", abbr: "B", tone: "emerald", pos: 0.82, blurb: "would open or add to the position here" },
  "Weak Buy": { label: "Weak Buy", abbr: "WB", tone: "teal", pos: 0.64, blurb: "lean buy — worth building gradually, on dips" },
  Hold: { label: "Hold", abbr: "H", tone: "amber", pos: 0.5, blurb: "own it; nothing here warrants buying more or selling" },
  "Weak Sell": { label: "Weak Sell", abbr: "WS", tone: "amber", pos: 0.36, blurb: "lean sell — trim, or wait for a better exit" },
  Sell: { label: "Sell", abbr: "S", tone: "red", pos: 0.18, blurb: "exit the position" },
  "Strong Sell": { label: "Strong Sell", abbr: "SS", tone: "red", pos: 0, blurb: "high-conviction exit / would not own" },
};

// Back-compat: the retired word stance (BUY/ACCUMULATE/HOLD/WATCH/TRIM/AVOID/SELL)
// still lives in older dossiers — map it onto the new scale so it renders.
const LEGACY: Record<string, Stance> = {
  BUY: "Buy",
  ACCUMULATE: "Weak Buy",
  HOLD: "Hold",
  WATCH: "Hold",
  TRIM: "Weak Sell",
  AVOID: "Weak Sell",
  SELL: "Sell",
};

export function stanceMeta(stance: string | null | undefined): Meta | null {
  if (!stance) return null;
  const s = stance.trim();
  const direct = STANCE_VALUES.find((v) => v.toLowerCase() === s.toLowerCase());
  if (direct) return META[direct];
  const legacy = LEGACY[s.toUpperCase()];
  return legacy ? META[legacy] : null;
}

// Static Tailwind class strings per tone (kept here so the purge scanner sees them).
export const STANCE_TONE_CLASSES: Record<string, { text: string; border: string; bg: string }> = {
  emerald: { text: "text-emerald-400", border: "border-emerald-400/40", bg: "bg-emerald-400/[0.07]" },
  teal: { text: "text-teal-300", border: "border-teal-400/40", bg: "bg-teal-400/[0.07]" },
  amber: { text: "text-amber-400", border: "border-amber-400/40", bg: "bg-amber-400/[0.07]" },
  red: { text: "text-red-400", border: "border-red-400/40", bg: "bg-red-400/[0.07]" },
};

// Bullish / bearish / neutral direction of a stance — for spotting when GRQ's
// call diverges from the deterministic signal read.
export function stanceDirection(stance: string | null | undefined): 1 | 0 | -1 {
  const m = stanceMeta(stance);
  if (!m) return 0;
  if (m.label === "Strong Buy" || m.label === "Buy" || m.label === "Weak Buy") return 1;
  if (m.label === "Strong Sell" || m.label === "Sell" || m.label === "Weak Sell") return -1;
  return 0;
}
