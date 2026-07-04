/** Chess Moves board helpers — the pure slice of web/lib/chess-board.ts (the
 * chain-map ranges + the bare-ticker key). The board itself arrives parsed from
 * /api/chess/[id]; the phone only slices the per-piece tapes client-side. */

// Bare-ticker key, stripping CA venues AND ".US" — the canonical key the knowledge
// graph uses, so board pieces join plays + trends.
export const bareChainKey = (s: string) => s.trim().toUpperCase().replace(/\.(TO|V|NE|CN|US)$/i, '');

export type TrendPoint = { t: number; c: number };
export type BoardTrend = { series: TrendPoint[]; todayBps?: number | null };

export type BoardRangeKey = '1D' | '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y';

// The same range set as the stock page tape. 1D is the last two points — because
// the server appends today's live quote as the final point, that's today's move.
export const BOARD_RANGES: { key: BoardRangeKey; days: number | null }[] = [
  { key: '1D', days: 1 },
  { key: '1W', days: 7 },
  { key: '1M', days: 30 },
  { key: '3M', days: 91 },
  { key: '6M', days: 182 },
  { key: 'YTD', days: null },
  { key: '1Y', days: 366 },
];

/** Slice a daily close series to a range window and compute the % move across it.
 *  Returns null when the window has < 2 usable points — the caller shows no tape. */
export function sliceBoardRange(series: TrendPoint[], key: BoardRangeKey): { pts: TrendPoint[]; changePct: number } | null {
  if (!series || series.length < 2) return null;
  const last = series[series.length - 1].t;
  let win: TrendPoint[];
  if (key === '1D') {
    win = series.slice(-2);
  } else if (key === 'YTD') {
    // Bars are the ET trading day at UTC midnight, so the UTC year holds the trading year.
    const jan1 = Date.UTC(new Date(last).getUTCFullYear(), 0, 1);
    win = series.filter((p) => p.t >= jan1);
  } else {
    const days = BOARD_RANGES.find((r) => r.key === key)?.days ?? 30;
    const cutoff = last - days * 86_400_000;
    win = series.filter((p) => p.t >= cutoff);
  }
  if (win.length < 2) return null;
  const a = win[0].c;
  const b = win[win.length - 1].c;
  if (a <= 0) return null;
  return { pts: win, changePct: (b - a) / a };
}
