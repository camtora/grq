import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { snapshotPredictions } from "./snapshot";
import { scorePrediction, tally, type PredDir, type Tally } from "./score";

export type ReportRow = {
  id: number;
  source: "chess" | "call" | "hunt";
  symbol: string;
  yahoo: string | null;
  currency: string | null;
  direction: PredDir;
  label: string | null;
  conviction: number | null;
  effectOrder: number | null;
  context: string | null;
  predictedAt: Date;
  entryPriceCents: number;
  markCents: number | null;
  returnBps: number | null; // raw price move
  calledReturnBps: number | null; // oriented to the call (a right DOWN bet is +)
  isGreen: boolean | null;
  ageDays: number;
};

export type SourceTally = { source: "chess" | "call" | "hunt"; label: string; tally: Tally };

export type ReportCard = {
  rows: ReportRow[]; // ALL predictions, newest first — the page caps what it renders
  overall: Tally;
  bySource: SourceTally[];
  byEffectOrder: { order: number; tally: Tally }[]; // chess plays only — does the ripple pay?
  asOf: Date;
};

const SOURCE_LABEL: Record<string, string> = { chess: "Chess Moves", call: "Alfred's calls", hunt: "Hunt leads" };
const DAY_MS = 86_400_000;

/** The latest stored close per symbol, in ONE query — the mark we grade against. Daily-close
 *  resolution is the right granularity for a forward-test (the bars are refreshed nightly for
 *  tracked names + by the snapshot script for the rest); it also keeps the page off the
 *  per-symbol live-quote fan-out, which would be hundreds of fetches on a 700-row ledger. */
async function lastCloseBySymbol(symbols: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (symbols.length === 0) return out;
  const rows = await prisma.$queryRaw<{ symbol: string; closeCents: number }[]>`
    SELECT DISTINCT ON (symbol) symbol, "closeCents"
    FROM "Bar"
    WHERE symbol IN (${Prisma.join(symbols)})
    ORDER BY symbol, date DESC
  `;
  for (const r of rows) out.set(r.symbol.toUpperCase(), r.closeCents);
  return out;
}

/** Load the report card: every snapshotted prediction marked to its last close, scored on
 *  absolute direction, with hit-rate + avg called-return tallies (overall, per source, and —
 *  the thesis — Chess plays by effect-order). Fast-path snapshots any new priceable
 *  predictions first (no network) so freshly-made calls self-capture on view. */
export async function loadReportCard(): Promise<ReportCard> {
  try {
    await snapshotPredictions({ fetchMissingBars: false });
  } catch {
    /* a snapshot hiccup must not take down the page */
  }

  const preds = await prisma.prediction.findMany({ orderBy: { predictedAt: "desc" } });
  const now = Date.now();
  const marks = await lastCloseBySymbol([...new Set(preds.map((p) => (p.yahoo || p.symbol).toUpperCase()))]);

  const rows: ReportRow[] = preds.map((p) => {
    const markCents = marks.get((p.yahoo || p.symbol).toUpperCase()) ?? null;
    const s = scorePrediction(p.direction as PredDir, p.entryPriceCents, markCents);
    return {
      id: p.id,
      source: p.source as ReportRow["source"],
      symbol: p.symbol,
      yahoo: p.yahoo,
      currency: p.currency,
      direction: p.direction as PredDir,
      label: p.label,
      conviction: p.conviction,
      effectOrder: p.effectOrder,
      context: p.context,
      predictedAt: p.predictedAt,
      entryPriceCents: p.entryPriceCents,
      markCents,
      returnBps: s?.returnBps ?? null,
      calledReturnBps: s?.calledReturnBps ?? null,
      isGreen: s?.isGreen ?? null,
      ageDays: Math.floor((now - p.predictedAt.getTime()) / DAY_MS),
    };
  });

  const toScored = (rs: ReportRow[]) => rs.map((r) => ({ dir: r.direction, entryPriceCents: r.entryPriceCents, markCents: r.markCents }));

  const bySource: SourceTally[] = (["chess", "call", "hunt"] as const)
    .map((source) => ({ source, label: SOURCE_LABEL[source], tally: tally(toScored(rows.filter((r) => r.source === source))) }))
    .filter((s) => s.tally.graded + s.tally.pending > 0);

  const byEffectOrder = [1, 2, 3]
    .map((order) => ({ order, tally: tally(toScored(rows.filter((r) => r.source === "chess" && r.effectOrder === order))) }))
    .filter((e) => e.tally.graded + e.tally.pending > 0);

  return { rows, overall: tally(toScored(rows)), bySource, byEffectOrder, asOf: new Date() };
}
