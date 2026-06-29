// Confidence levers (D — "what would make us more confident"): the specific,
// falsifiable things that would reframe Alfred's call on a name. A dossier's
// confidence is a bare 0–100 number; these decompose what's pinning it below
// 100 — for each lever: what we don't yet know, which way resolving it would
// move the call, how much, and how/when we'd learn it. Two kinds:
//   • data-gap  — information that EXISTS but we don't have (retrievable → a
//     research action: read the latest 10-Q, no guidance feed, insider dark).
//   • catalyst  — an EVENT that will resolve an uncertainty on a known horizon
//     (earnings, an FDA date, a ruling) — not retrievable, just watched.
// Stored as a JSON array on JournalEntry.confidenceLeversJson, written by the
// agent in write_journal and rendered on the stock page. Pure display data — it
// never touches the order gate.

export type LeverDirection = "up" | "down" | "tighten";
export type LeverMagnitude = "small" | "moderate" | "large";
export type LeverKind = "data-gap" | "catalyst";

export type ConfidenceLever = {
  // The specific unknown, falsifiable — "Q3 gross margin > 42%", not "macro clarity".
  gap: string;
  // Where the BASE-CASE resolution would push the call: up = toward buy, down =
  // toward sell, tighten = genuinely two-sided (resolving it just narrows the band).
  direction: LeverDirection;
  // How much it would move confidence if it resolves.
  magnitude: LeverMagnitude;
  kind: LeverKind;
  // How/when we'd learn it: a date, a filing, a price level, or a dark data tier.
  trigger: string;
  // Can we go get it now (a research action) vs. wait for an event to land?
  retrievable: boolean;
};

const MAG_ORDER: Record<LeverMagnitude, number> = { large: 0, moderate: 1, small: 2 };
const DIRECTIONS: LeverDirection[] = ["up", "down", "tighten"];
const MAGNITUDES: LeverMagnitude[] = ["small", "moderate", "large"];

/** Tolerant parse of the stored JSON — drops malformed items, never throws, and
 *  sorts the largest-magnitude levers first so the page leads with what matters. */
export function parseConfidenceLevers(json: string | null | undefined): ConfidenceLever[] {
  if (!json) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((l): l is Record<string, unknown> => !!l && typeof l === "object" && typeof (l as { gap?: unknown }).gap === "string" && !!String((l as { gap: unknown }).gap).trim())
    .map((l): ConfidenceLever => {
      const kind: LeverKind = l.kind === "catalyst" ? "catalyst" : "data-gap";
      return {
        gap: String(l.gap).trim(),
        direction: DIRECTIONS.includes(l.direction as LeverDirection) ? (l.direction as LeverDirection) : "tighten",
        magnitude: MAGNITUDES.includes(l.magnitude as LeverMagnitude) ? (l.magnitude as LeverMagnitude) : "moderate",
        kind,
        trigger: typeof l.trigger === "string" ? l.trigger.trim() : "",
        retrievable: typeof l.retrievable === "boolean" ? l.retrievable : kind !== "catalyst",
      };
    })
    .sort((a, b) => MAG_ORDER[a.magnitude] - MAG_ORDER[b.magnitude]);
}
