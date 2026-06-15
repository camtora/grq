// The agent's OWN call on a name (its judgment) — distinct from the deterministic
// signal consensus (a technicals formula). The agent sets it in its dossier;
// the stock page shows it next to the signal read, and where the two DIVERGE is
// the interesting part (e.g. signals "Strong Buy" on momentum, agent "Avoid"
// because the balance sheet is rotting).

export const STANCE_VALUES = ["BUY", "ACCUMULATE", "HOLD", "WATCH", "TRIM", "AVOID", "SELL"] as const;
export type Stance = (typeof STANCE_VALUES)[number];

export const STANCES: Record<Stance, { label: string; tone: "emerald" | "teal" | "amber" | "red"; blurb: string }> = {
  BUY: { label: "Buy", tone: "emerald", blurb: "would open or add to the position at today's price" },
  ACCUMULATE: { label: "Accumulate", tone: "emerald", blurb: "worth building — on dips, over time, not all at once" },
  HOLD: { label: "Hold", tone: "teal", blurb: "own it; nothing here warrants buying more or selling" },
  WATCH: { label: "Watch", tone: "amber", blurb: "interesting, but not yet — waiting on a trigger or a better price" },
  TRIM: { label: "Trim", tone: "amber", blurb: "take some off the table; reduce the position" },
  AVOID: { label: "Avoid", tone: "red", blurb: "would not buy here" },
  SELL: { label: "Sell", tone: "red", blurb: "exit the position" },
};

export function stanceMeta(stance: string | null | undefined) {
  if (!stance) return null;
  return STANCES[stance.toUpperCase() as Stance] ?? null;
}

// Static Tailwind class strings per tone (kept here so the purge scanner sees them).
export const STANCE_TONE_CLASSES: Record<string, { text: string; border: string; bg: string }> = {
  emerald: { text: "text-emerald-400", border: "border-emerald-400/40", bg: "bg-emerald-400/[0.07]" },
  teal: { text: "text-teal-300", border: "border-teal-400/40", bg: "bg-teal-400/[0.07]" },
  amber: { text: "text-amber-400", border: "border-amber-400/40", bg: "bg-amber-400/[0.07]" },
  red: { text: "text-red-400", border: "border-red-400/40", bg: "bg-red-400/[0.07]" },
};

// Bullish / bearish / neutral direction of a stance — for spotting when the
// agent's call diverges from the deterministic signal read.
export function stanceDirection(stance: string | null | undefined): 1 | 0 | -1 {
  const s = stance?.toUpperCase();
  if (s === "BUY" || s === "ACCUMULATE") return 1;
  if (s === "SELL" || s === "TRIM" || s === "AVOID") return -1;
  return 0;
}
