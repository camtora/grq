// "Heat" — the 0–100 "ready to pop" score that ranks The Hunt (the design handoff's
// central organizing metric). GRQ doesn't store a heat field; the agent already gives
// us the three honest inputs per Hunt dossier, so we DERIVE heat in the view layer:
//
//   • confidence (0–100) — the agent's conviction this is worth a look. Primary driver.
//   • change30d (fraction) — 30-day price momentum (first→last daily close). Recent
//     strength is what "about to pop" usually looks like.
//   • obscurity (1–5) — how under-the-radar it is. The hunt lives at the obscure end,
//     so a deep cut gets a small nudge.
//
// Weights blend 60/25/15; whenever an input is missing (an untracked find with no
// bars, or a dossier with no confidence) its weight drops out and the rest renormalize,
// so heat stays meaningful rather than collapsing to a default. This is explainable on
// screen (the literacy pillar): see the "how heat is scored" tooltip on The Hunt.

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export type HeatInputs = {
  confidence: number | null;
  change30d: number | null; // fraction, e.g. +0.12 = +12% over the window
  obscurity: number | null; // agent's 1–5 read
};

// Map 30-day momentum onto 0–100: −20% → 0, flat → 40, +30% → 100 (clamped).
function momentumScore(change30d: number): number {
  return clamp(((change30d + 0.2) / 0.5) * 100, 0, 100);
}

export function computeHeat({ confidence, change30d, obscurity }: HeatInputs): number {
  const parts: { w: number; v: number }[] = [];
  if (confidence != null) parts.push({ w: 0.6, v: clamp(confidence, 0, 100) });
  if (change30d != null) parts.push({ w: 0.25, v: momentumScore(change30d) });
  if (obscurity != null) parts.push({ w: 0.15, v: clamp(obscurity * 20, 0, 100) });
  if (parts.length === 0) return 50; // nothing to go on — neutral
  const wsum = parts.reduce((s, p) => s + p.w, 0);
  const score = parts.reduce((s, p) => s + p.w * p.v, 0) / wsum;
  return Math.round(clamp(score, 0, 100));
}

// Hue-coded heat color (kept from the handoff — it encodes the ranking visually and is
// theme-agnostic). Lightness 0.72 reads on both the dark near-black and the light card.
// Hue sweeps teal-green (cool, low heat) → amber/orange (hot) as heat climbs.
export function heatColor(heat: number): string {
  const h = Math.round(175 - (clamp(heat, 0, 100) / 100) * 150); // 175 → 25
  return `oklch(0.72 0.17 ${h})`;
}
