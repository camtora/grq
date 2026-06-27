import { prisma } from "@/lib/db";
import { getQuotes } from "@/lib/broker/quotes";
import { getCloses } from "@/lib/bars";
import { BENCHMARK } from "@/lib/universe";
import { usdCadRate, toCadCents } from "@/lib/fx";
import { startOfEtDay, etDateStr } from "@/agent/calendar";
import { RACE, MODELS } from "@/agent/policy";
import { modelLabel } from "@/lib/race/models";
import { scoreCall, benchmarkReturnBps, type CallScore } from "@/lib/race/score";
import { replayBook } from "@/lib/race/book";

// The Race standings — the server-side engine the overview tiles and the day matrix share.
// Two readings of the same calls, both on a single CAD board (BoC rate) so every mind is judged on
// identical terms:
//   • Decision quality (per call): each BUY/SELL is snapshotted at call time and marked to the live
//     price → hit rate, avg return, vs-XIC. A re-called name counts each time (repeated conviction).
//   • The book (portfolio): each model's calls are REPLAYED through a fixed virtual stake
//     (RACE.shadowStakeCents) into a bounded book — holdings + NAV-based P&L. This is what stops a
//     model "holding" 659 TSM ≈ $250k on a $50k account. See lib/race/book.ts.
// Only DECISION sessions carry calls; narrative (midday/eod) rows are kept for the read but never scored.

const DECISION_KINDS = new Set(["morning", "checkin", "position"]);
const DAY_MS = 24 * 60 * 60 * 1000;

const ROW_SELECT = {
  id: true,
  sessionAt: true,
  sessionKind: true,
  label: true,
  reason: true,
  model: true,
  role: true,
  text: true,
  action: true,
  symbol: true,
  qty: true,
  confidence: true,
  thesis: true,
  entryPriceCents: true,
  entryCurrency: true,
} as const;

export type ShadowRow = {
  id: number;
  sessionAt: Date;
  sessionKind: string;
  label: string;
  reason: string;
  model: string;
  role: string;
  text: string;
  action: string | null;
  symbol: string | null;
  qty: number | null;
  confidence: number | null;
  thesis: string | null;
  entryPriceCents: number | null;
  entryCurrency: string | null;
};

export type ModelStanding = {
  model: string;
  label: string;
  role: "champion" | "challenger";
  pnlCadCents: number; // the virtual book's P&L (NAV − stake), CAD
  scoredCalls: number; // BUY/SELL with a mark
  greens: number;
  hitRate: number | null; // 0..1
  avgReturnBps: number | null;
  vsBenchmarkBps: number | null; // avg per-call excess vs XIC over each call's window
  counts: { BUY: number; SELL: number; HOLD: number; NONE: number };
  totalCalls: number; // all decision rows for the model
  avgConfidence: number | null;
  spark: number[]; // virtual book P&L (NAV − stake) after each call, chronological
  // The model's virtual BOOK (lib/race/book.ts): the names it actually HOLDS after replaying its
  // calls through a fixed stake — bounded shares (no runaway accretion), native ACB per share, the
  // # of buy calls it made on the name, and marked-to-now unrealized CAD P&L.
  positions: { symbol: string; pnlCadCents: number; calls: number; shares: number; avgPriceCents: number | null; currency: string | null }[];
};

export type DayRollup = {
  date: string; // ET YYYY-MM-DD
  sessions: number;
  calls: number;
  leader: { label: string; role: string; pnlCadCents: number } | null;
  champion: { pnlCadCents: number } | null;
};

export type CellView = { row: ShadowRow; score: CallScore | null; pnlCadCents: number | null };
export type SessionView = {
  key: string;
  sessionAt: Date;
  sessionKind: string;
  label: string;
  reason: string;
  cells: Record<string, CellView>; // model id → cell
};

export type Standings = { models: ModelStanding[]; days: DayRollup[]; asOf: Date; fxUsdCad: number | null };
export type DayDetail = {
  date: string;
  models: string[]; // column order: champion first, then by label
  sessions: SessionView[];
  standings: ModelStanding[];
  fxUsdCad: number | null;
  hasData: boolean;
};

/** Live mark (native ccy cents) per symbol: the quote cache first, the latest daily bar as a
 *  fallback for anything the quote layer can't price (a model's call on an exotic name). */
async function fetchMarks(symbols: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const uniq = [...new Set(symbols.map((s) => s.toUpperCase()))];
  if (uniq.length === 0) return out;
  const quotes = await getQuotes(uniq).catch(() => new Map());
  for (const s of uniq) {
    const q = quotes.get(s);
    if (q && q.midCents > 0) out.set(s, q.midCents);
  }
  for (const s of uniq.filter((x) => !out.has(x))) {
    const closes = await getCloses(s, 1).catch(() => [] as { date: Date; closeCents: number }[]);
    const last = closes[closes.length - 1];
    if (last && last.closeCents > 0) out.set(s, last.closeCents);
  }
  return out;
}

/** Pure: turn a set of rows + marks into per-model standings. */
function computeStandings(
  rows: ShadowRow[],
  marks: Map<string, number>,
  xicCloses: { date: Date; closeCents: number }[],
  xicNowCents: number | null,
  fx: number | null,
): ModelStanding[] {
  const byModel = new Map<string, ShadowRow[]>();
  for (const r of rows) {
    if (!DECISION_KINDS.has(r.sessionKind)) continue;
    const arr = byModel.get(r.model);
    if (arr) arr.push(r);
    else byModel.set(r.model, [r]);
  }

  const standings: ModelStanding[] = [];
  for (const [model, mrows] of byModel) {
    const role: "champion" | "challenger" = mrows.some((r) => r.role === "champion") ? "champion" : "challenger";
    const counts = { BUY: 0, SELL: 0, HOLD: 0, NONE: 0 };
    let scored = 0;
    let greens = 0;
    let retSum = 0;
    let excessSum = 0;
    let excessN = 0;
    let confSum = 0;
    let confN = 0;
    const buyCalls = new Map<string, number>(); // BUY calls per name — the "· N calls" badge (each re-call counts)

    const sorted = [...mrows].sort((a, b) => a.sessionAt.getTime() - b.sessionAt.getTime());
    // Per-call DECISION QUALITY: every BUY/SELL marked to now → hit rate, avg return, vs-XIC.
    for (const r of sorted) {
      if (r.action && r.action in counts) counts[r.action as keyof typeof counts]++;
      if (r.confidence != null) {
        confSum += r.confidence;
        confN++;
      }
      if (r.action === "BUY" && r.symbol) {
        const sym = r.symbol.toUpperCase();
        buyCalls.set(sym, (buyCalls.get(sym) ?? 0) + 1);
      }
      const mark = r.symbol ? marks.get(r.symbol.toUpperCase()) ?? null : null;
      const sc = scoreCall(r, mark);
      if (!sc) continue;
      scored++;
      if (sc.isGreen) greens++;
      retSum += sc.returnBps;
      const bench = benchmarkReturnBps(xicCloses, xicNowCents, r.sessionAt);
      if (bench != null) {
        excessSum += sc.returnBps - bench;
        excessN++;
      }
    }

    // The BOOK: replay the calls through a fixed virtual stake → bounded holdings + NAV P&L + curve.
    const book = replayBook(sorted, marks, fx, RACE.shadowStakeCents);

    standings.push({
      model,
      label: modelLabel(model),
      role,
      pnlCadCents: book.pnlCadCents,
      scoredCalls: scored,
      greens,
      hitRate: scored ? greens / scored : null,
      avgReturnBps: scored ? Math.round(retSum / scored) : null,
      vsBenchmarkBps: excessN ? Math.round(excessSum / excessN) : null,
      counts,
      totalCalls: mrows.length,
      avgConfidence: confN ? Math.round(confSum / confN) : null,
      spark: book.spark,
      positions: book.positions
        .map((p) => ({
          symbol: p.symbol,
          pnlCadCents: p.pnlCadCents,
          calls: buyCalls.get(p.symbol) ?? 1,
          shares: p.qty,
          avgPriceCents: p.avgPriceCents,
          currency: p.currency,
        }))
        .sort((a, b) => b.pnlCadCents - a.pnlCadCents),
    });
  }
  return standings;
}

function computeDays(
  rows: ShadowRow[],
  marks: Map<string, number>,
  xicCloses: { date: Date; closeCents: number }[],
  xicNowCents: number | null,
  fx: number | null,
): DayRollup[] {
  const byDay = new Map<string, ShadowRow[]>();
  for (const r of rows) {
    const d = etDateStr(r.sessionAt);
    const arr = byDay.get(d);
    if (arr) arr.push(r);
    else byDay.set(d, [r]);
  }
  const days: DayRollup[] = [];
  for (const [date, drows] of byDay) {
    const sessions = new Set(drows.map((r) => r.sessionAt.toISOString())).size;
    const calls = drows.filter((r) => DECISION_KINDS.has(r.sessionKind) && r.action).length;
    const st = computeStandings(drows, marks, xicCloses, xicNowCents, fx);
    const scored = st.filter((s) => s.scoredCalls > 0);
    const leader = scored.length
      ? scored.reduce((a, b) => (b.pnlCadCents > a.pnlCadCents ? b : a))
      : null;
    const champ = st.find((s) => s.role === "champion") ?? null;
    days.push({
      date,
      sessions,
      calls,
      leader: leader ? { label: leader.label, role: leader.role, pnlCadCents: leader.pnlCadCents } : null,
      champion: champ ? { pnlCadCents: champ.pnlCadCents } : null,
    });
  }
  return days.sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** A zero-state standing for a configured model that hasn't raced yet — so the overview shows the
 *  full field (champion + every challenger in GRQ_RACE_CHALLENGERS), not just models with data. */
function emptyStanding(model: string, role: "champion" | "challenger"): ModelStanding {
  return {
    model,
    label: modelLabel(model),
    role,
    pnlCadCents: 0,
    scoredCalls: 0,
    greens: 0,
    hitRate: null,
    avgReturnBps: null,
    vsBenchmarkBps: null,
    counts: { BUY: 0, SELL: 0, HOLD: 0, NONE: 0 },
    totalCalls: 0,
    avgConfidence: null,
    spark: [],
    positions: [],
  };
}

/** The full configured roster: the champion + every challenger, in config order. */
function roster(): { model: string; role: "champion" | "challenger" }[] {
  return [
    { model: MODELS.decision, role: "champion" },
    ...RACE.challengers.map((m) => ({ model: m, role: "challenger" as const })),
  ];
}

/** Symbols we need a live mark for: every priced directional call. */
function callSymbols(rows: ShadowRow[]): string[] {
  return rows
    .filter((r) => (r.action === "BUY" || r.action === "SELL") && r.symbol && r.entryPriceCents != null)
    .map((r) => r.symbol as string);
}

async function loadBenchmark(): Promise<{ closes: { date: Date; closeCents: number }[]; nowCents: number | null }> {
  const [closes, q] = await Promise.all([
    getCloses(BENCHMARK).catch(() => [] as { date: Date; closeCents: number }[]),
    getQuotes([BENCHMARK]).catch(() => new Map()),
  ]);
  return { closes, nowCents: q.get(BENCHMARK)?.midCents ?? null };
}

/** Overview: all-time standings (leader first) + per-day rollups (reverse-chron). */
export async function loadStandings(): Promise<Standings> {
  const rows = (await prisma.shadowRun.findMany({
    orderBy: { sessionAt: "desc" },
    take: 4000,
    select: ROW_SELECT,
  })) as ShadowRow[];

  const [marks, bench, fx] = await Promise.all([fetchMarks(callSymbols(rows)), loadBenchmark(), usdCadRate().catch(() => null)]);
  const dataStandings = computeStandings(rows, marks, bench.closes, bench.nowCents, fx);

  // Show the FULL field: union the data with the configured roster, so a challenger with no calls
  // yet (just added, awaiting its first session) still gets a tile (the page fades it).
  const present = new Set(dataStandings.map((s) => s.model));
  const placeholders = roster()
    .filter((r) => !present.has(r.model))
    .map((r) => emptyStanding(r.model, r.role));

  // Active models first (leader P&L), then the not-yet-raced placeholders, alphabetical.
  const models = [...dataStandings, ...placeholders].sort(
    (a, b) => Number(b.totalCalls > 0) - Number(a.totalCalls > 0) || b.pnlCadCents - a.pnlCadCents || a.label.localeCompare(b.label),
  );
  const days = computeDays(rows, marks, bench.closes, bench.nowCents, fx);
  return { models, days, asOf: new Date(), fxUsdCad: fx };
}

/** One ET day: the session call-matrix views + that day's standings. */
export async function loadDay(dateStr: string): Promise<DayDetail> {
  const anchor = new Date(`${dateStr}T12:00:00Z`);
  const start = startOfEtDay(anchor);
  const end = new Date(start.getTime() + DAY_MS);
  const rows = (await prisma.shadowRun.findMany({
    where: { sessionAt: { gte: start, lt: end } },
    orderBy: { sessionAt: "desc" },
    select: ROW_SELECT,
  })) as ShadowRow[];

  if (rows.length === 0) {
    return { date: dateStr, models: [], sessions: [], standings: [], fxUsdCad: null, hasData: false };
  }

  const [marks, bench, fx] = await Promise.all([fetchMarks(callSymbols(rows)), loadBenchmark(), usdCadRate().catch(() => null)]);
  const standings = computeStandings(rows, marks, bench.closes, bench.nowCents, fx).sort((a, b) => b.pnlCadCents - a.pnlCadCents);

  // Column order: champion first, then challengers by label.
  const modelMeta = new Map<string, { role: string; label: string }>();
  for (const r of rows) if (!modelMeta.has(r.model)) modelMeta.set(r.model, { role: r.role, label: modelLabel(r.model) });
  const models = [...modelMeta.entries()]
    .sort((a, b) => {
      if (a[1].role !== b[1].role) return a[1].role === "champion" ? -1 : 1;
      return a[1].label.localeCompare(b[1].label);
    })
    .map(([m]) => m);

  // Group into sessions and score each cell.
  const groups = new Map<string, ShadowRow[]>();
  for (const r of rows) {
    const k = r.sessionAt.toISOString();
    const arr = groups.get(k);
    if (arr) arr.push(r);
    else groups.set(k, [r]);
  }
  const sessions: SessionView[] = [...groups.values()]
    .sort((a, b) => b[0].sessionAt.getTime() - a[0].sessionAt.getTime())
    .map((g) => {
      const head = g[0];
      const cells: Record<string, CellView> = {};
      for (const r of g) {
        const mark = r.symbol ? marks.get(r.symbol.toUpperCase()) ?? null : null;
        const score = scoreCall(r, mark);
        cells[r.model] = {
          row: r,
          score,
          pnlCadCents: score ? toCadCents(score.pnlNativeCents, r.entryCurrency, fx) : null,
        };
      }
      return { key: head.sessionAt.toISOString(), sessionAt: head.sessionAt, sessionKind: head.sessionKind, label: head.label, reason: head.reason, cells };
    });

  return { date: dateStr, models, sessions, standings, fxUsdCad: fx, hasData: true };
}
