/** Money & number formatting — integer cents in, strings out (house rule #4,
 * docs/MOBILE-DESIGN.md §5). Never toFixed money in a component. */

export function money(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString('en-CA');
  return `${sign}$${dollars}.${String(abs % 100).padStart(2, '0')}`;
}

export function signedMoney(cents: number): string {
  return cents > 0 ? `+${money(cents)}` : money(cents);
}

/** bps → "+1.23%" */
export function signedPctFromBps(bps: number, dp = 2): string {
  return `${bps > 0 ? '+' : ''}${(bps / 100).toFixed(dp)}%`;
}

/** fraction (0.12) → "12%" */
export function pctFromFrac(frac: number, dp = 0): string {
  return `${(frac * 100).toFixed(dp)}%`;
}

export function pnlColor(v: number, p: { pos: string; neg: string; textMuted: string }): string {
  return v > 0 ? p.pos : v < 0 ? p.neg : p.textMuted;
}

const DAY_MS = 86_400_000;

/** "today" / "tomorrow" / "in 3d" / "2d ago" for YYYY-MM-DD pairs. */
export function relDay(d: string, today: string): string {
  const n = Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n < 0 ? `${-n}d ago` : `in ${n}d`;
}

/** "Thu, Jul 3" from YYYY-MM-DD. */
export function fmtDate(d: string): string {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function fmtEps(v: number | null): string {
  return v == null ? '—' : `${v < 0 ? '−' : ''}$${Math.abs(v).toFixed(2)}`;
}
