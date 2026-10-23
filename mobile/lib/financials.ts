// Company financials display helpers (D140) — a port of web/lib/financials/format.ts, which the app can't
// import (the web build context is ./web). Keep the two in step: same rules, same words. The server has
// already applied every judgment (n/m growth, the bank card, segment re-cuts, health grades); these only
// format. Currency: CAD is a bare "$", anything else carries its own symbol (US$, €), and it is the
// company's REPORTING currency, which for SHOP.TO is US$ though it trades in C$.
import type { FinGrowth } from '@shared/contract';

export type { Financials, FinancialsCompany, FinGrowth } from '@shared/contract';

const SYMBOLS: Record<string, string> = { CAD: '$', USD: 'US$', EUR: '€', GBP: '£', JPY: 'JP¥', TWD: 'NT$', CHF: 'CHF ', AUD: 'A$', HKD: 'HK$', CNY: 'CN¥', DKK: 'DKK ', SEK: 'SEK ' };
export function currencySymbol(ccy: string | null | undefined): string {
  const c = (ccy || 'CAD').toUpperCase();
  return SYMBOLS[c] ?? `${c} `;
}

/** Compact money from cents: US$96.2B, $344M, −US$4.1M. */
export function bigMoney(cents: number | null | undefined, ccy: string | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return '—';
  const v = Math.abs(cents) / 100;
  const units: Array<[number, string]> = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  let body = v < 1000 ? v.toFixed(0) : '';
  for (const [n, u] of units) {
    if (v >= n) {
      const x = v / n;
      body = `${x >= 100 ? x.toFixed(0) : x.toFixed(1).replace(/\.0$/, '')}${u}`;
      break;
    }
  }
  return `${cents < 0 ? '−' : ''}${currencySymbol(ccy)}${body}`;
}

/** EPS (× 10,000) as money; four decimals under a dime, where two would round a real figure to $0.00. */
export function epsMoney(eps4: number | null | undefined, ccy: string | null | undefined): string {
  if (eps4 == null) return '—';
  const v = Math.abs(eps4) / 10_000;
  const body = v > 0 && v < 0.1 ? v.toFixed(4) : v.toFixed(2);
  return `${eps4 < 0 ? '−' : ''}${currencySymbol(ccy)}${body}`;
}

export function growthText(g: FinGrowth | null | undefined): string {
  if (!g) return '—';
  if (g.kind === 'nm') return 'n/m';
  const p = g.bps / 100;
  const body = Math.abs(p) >= 1000 ? Math.abs(p).toFixed(0) : Math.abs(p).toFixed(1);
  return `${p > 0 ? '+' : p < 0 ? '−' : ''}${body}%`;
}

export function bpsText(bps: number | null | undefined, digits = 1): string {
  if (bps == null) return '—';
  return `${(bps / 100).toFixed(digits)}%`;
}

export function ptsText(bps: number | null | undefined): string {
  if (bps == null) return '—';
  const p = bps / 100;
  return `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p).toFixed(1)} pts`;
}

export function growthTone(g: FinGrowth | null | undefined): 'up' | 'down' | 'flat' {
  if (!g || g.kind !== 'ok' || g.bps === 0) return 'flat';
  return g.bps > 0 ? 'up' : 'down';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-07-26" → "Jul 2026" (no Intl dependency: Hermes' locale data is thin). */
export function monthLabel(isoDay: string): string {
  const [y, m] = isoDay.split('-');
  return `${MONTHS[Number(m) - 1] ?? ''} ${y}`;
}

/** A growth figure for a change in cents: "+12.3%" — null when the base isn't positive. */
export function grow(cur: number, prev: number): FinGrowth | null {
  return prev > 0 ? { kind: 'ok', bps: Math.round(((cur - prev) / prev) * 10_000) } : null;
}

/** FMP passes some names in capitals ("TAIWAN, PROVINCE OF CHINA") or with a redundant "Segment". */
export function tidyName(raw: string): string {
  const n = raw.replace(/\s+Segment$/i, '');
  if (n !== n.toUpperCase() || n.length <= 4) return n;
  return n.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\bOf\b/g, 'of').replace(/\bAnd\b/g, 'and');
}
