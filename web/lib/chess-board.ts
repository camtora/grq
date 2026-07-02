// Client-safe pure helpers + types for the Chess Moves board MAP (the chain
// visualization). Kept free of any server import (no prisma/quotes/bars) so the
// client <ChessBoard> — which owns the range toggle — can import parseBoard,
// bareChainKey, the board types, and the range math directly. lib/chess.ts (server)
// re-exports all of this, so existing `from "@/lib/chess"` imports are unchanged.

// Bare-ticker key, stripping CA venues AND ".US" — the canonical key the knowledge
// graph uses (lib/graph/related.ts), so plays join tracked names + persisted edges.
export const bareChainKey = (s: string) => s.trim().toUpperCase().replace(/\.(TO|V|NE|CN|US)$/i, "");

// ---- The board (chain map) the agent writes as boardJson on ChessTheme ----

export type BoardItem = { symbol?: string; name: string; note?: string };
export type BoardStage = { key?: string; label: string; role?: string; items: BoardItem[] };
export type BoardLink = { from: string; to: string; label?: string };
export type ChessBoardData = { stages: BoardStage[]; links: BoardLink[] };

/** Tolerant parse of boardJson — never throws, drops malformed bits. */
export function parseBoard(json: string | null | undefined): ChessBoardData {
  const empty: ChessBoardData = { stages: [], links: [] };
  if (!json) return empty;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return empty;
  }
  if (!raw || typeof raw !== "object") return empty;
  const o = raw as { stages?: unknown; links?: unknown };
  const stages: BoardStage[] = Array.isArray(o.stages)
    ? o.stages
        .filter((s): s is Record<string, unknown> => !!s && typeof s === "object" && typeof (s as { label?: unknown }).label === "string")
        .map((s) => ({
          key: typeof s.key === "string" ? s.key : undefined,
          label: String(s.label).trim(),
          role: typeof s.role === "string" ? s.role.trim() : undefined,
          items: Array.isArray(s.items)
            ? (s.items as unknown[])
                .filter((i): i is Record<string, unknown> => !!i && typeof i === "object" && typeof (i as { name?: unknown }).name === "string")
                .map((i) => ({
                  symbol: typeof i.symbol === "string" ? i.symbol.trim().toUpperCase() : undefined,
                  name: String(i.name).trim(),
                  note: typeof i.note === "string" ? i.note.trim() : undefined,
                }))
            : [],
        }))
    : [];
  const links: BoardLink[] = Array.isArray(o.links)
    ? o.links
        .filter((l): l is Record<string, unknown> => !!l && typeof l === "object" && typeof (l as { from?: unknown }).from === "string" && typeof (l as { to?: unknown }).to === "string")
        .map((l) => ({ from: String(l.from).trim(), to: String(l.to).trim(), label: typeof l.label === "string" ? l.label.trim() : undefined }))
    : [];
  return { stages, links };
}

// ---- Per-piece price tape for the board MAP ----

/** t = ms epoch of the trading day (bars store the ET day at UTC midnight), c = close cents. */
export type TrendPoint = { t: number; c: number };
/** The full daily-close series for a board piece (so the client can slice it to any range 1D…1Y,
 *  like the stock page's PriceChart), plus `todayBps` — the live quote's authoritative % move since
 *  the PRIOR session's close, in basis points. 1D uses todayBps so it means "since yesterday's close"
 *  exactly, even when a daily bar is missing (e.g. a holiday gap); null when we have no live quote. */
export type BoardTrend = { series: TrendPoint[]; todayBps?: number | null };

export type BoardRangeKey = "1D" | "1W" | "1M" | "3M" | "6M" | "YTD" | "1Y";

// The same range set as the stock page tape. `days` slices the series; YTD is special-cased
// to Jan 1; 1D is the last two points — which, because buildBoardTrends appends today's live
// quote as the final point, is today's move (how the name is doing right now vs the prior close).
export const BOARD_RANGES: { key: BoardRangeKey; days: number | null }[] = [
  { key: "1D", days: 1 },
  { key: "1W", days: 7 },
  { key: "1M", days: 30 },
  { key: "3M", days: 91 },
  { key: "6M", days: 182 },
  { key: "YTD", days: null },
  { key: "1Y", days: 366 },
];

/** Slice a daily close series to a range window and compute the % move across it.
 *  1D = the last two closes (one session). Returns null when the window has < 2 usable
 *  points (or the base is non-positive) — the caller then shows no tape for that name. */
export function sliceBoardRange(series: TrendPoint[], key: BoardRangeKey): { pts: TrendPoint[]; changePct: number } | null {
  if (!series || series.length < 2) return null;
  const last = series[series.length - 1].t;
  let win: TrendPoint[];
  if (key === "1D") {
    win = series.slice(-2);
  } else if (key === "YTD") {
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
