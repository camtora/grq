/** Shared Hunt vocabulary — the heat ramp + obscurity labels + thesis preview
 * (mirrors web lib/heat.ts + components/hunt/shared.ts). Used by The Hunt page
 * (More ▸ The Hunt) and the Wire's find cards. */

// The Hunt's heat ramp — hue teal-green (cool) → amber/orange (hot), same as web.
export function heatColor(heat: number): string {
  const h = 175 - (Math.max(0, Math.min(100, heat)) / 100) * 150;
  return `hsl(${Math.round(h)}, 70%, 55%)`;
}

export function obscurityLabel(o: number | null | undefined): string | null {
  if (o === 5) return '🔍 deep cut';
  if (o === 4) return 'under-the-radar';
  if (o === 3) return 'lesser-known';
  return null;
}

/** Strip markdown to a clean one-paragraph preview for clamped thesis text. */
export function previewText(body: string): string {
  return body
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/[#*_>`-]/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}
