import type { Palette } from '../constants/theme';

/** Alfred's call — the 7-point vocabulary + tone (mirrors web lib/stance.ts).
 * Legacy word stances (BUY/ACCUMULATE/…) in older journal rows map onto the scale. */

export type StanceTone = 'emerald' | 'teal' | 'amber' | 'red';

const META: Record<string, { label: string; tone: StanceTone }> = {
  'strong buy': { label: 'Strong Buy', tone: 'emerald' },
  buy: { label: 'Buy', tone: 'emerald' },
  'weak buy': { label: 'Weak Buy', tone: 'teal' },
  hold: { label: 'Hold', tone: 'amber' },
  'weak sell': { label: 'Weak Sell', tone: 'amber' },
  sell: { label: 'Sell', tone: 'red' },
  'strong sell': { label: 'Strong Sell', tone: 'red' },
};

const LEGACY: Record<string, string> = {
  BUY: 'buy',
  ACCUMULATE: 'weak buy',
  HOLD: 'hold',
  WATCH: 'hold',
  TRIM: 'weak sell',
  AVOID: 'weak sell',
  SELL: 'sell',
};

export function stanceMeta(stance: string | null | undefined): { label: string; tone: StanceTone } | null {
  if (!stance) return null;
  const key = stance.trim().toLowerCase();
  if (META[key]) return META[key];
  const legacy = LEGACY[stance.trim().toUpperCase()];
  return legacy ? META[legacy] : null;
}

/** Tone → palette colour (emerald=gains, amber=caution, red=losses, teal=brand). */
export function toneColor(tone: StanceTone | string | null | undefined, p: Palette): string {
  if (tone === 'emerald') return p.pos;
  if (tone === 'red') return p.neg;
  if (tone === 'amber') return p.warn;
  return p.accentText;
}
