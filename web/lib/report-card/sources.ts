import { prisma } from "@/lib/db";
import { stanceMeta } from "@/lib/stance";
import { yahooForListing } from "@/lib/universe";
import type { PredDir } from "./score";

// Gather every dated, DIRECTIONAL prediction the fund has filed, normalized into one shape,
// from the three experiments that make calls. Read-only — we never touch the source rows.
// NEUTRAL / Hold (non-directional) calls are dropped here so they never reach the scorer.
//
//   • chess — a ChessPlay (BENEFICIARY → UP, VICTIM → DOWN), one row per piece.
//   • call  — a JournalEntry carrying a 7-point stance (Buy-side → UP, Sell-side → DOWN),
//             one row per dossier that set a call (every dated call scored on its own, like
//             The Race — a re-researched name is a fresh prediction).
//   • hunt  — a JournalEntry "Hunt dossier …" lead. A lead is an implicit bullish flag
//             (worth a look → UP); it carries upside + conviction, no Buy/Hold/Sell.

export type RawPrediction = {
  source: "chess" | "call" | "hunt";
  refId: number; // the source row's id — provenance + idempotency key
  symbol: string; // bare ticker (display)
  yahoo: string; // resolved Bar/quote key
  currency: "CAD" | "USD"; // display only — the grade is a unitless return %
  direction: PredDir;
  label: string; // human tag for the row
  conviction: number | null;
  effectOrder: number | null;
  context: string | null; // row subtitle (board title / "Alfred's call" / hunt blurb)
  predictedAt: Date;
};

const ccyForYahoo = (y: string): "CAD" | "USD" => (/\.(TO|V|NE|CN)$/i.test(y) ? "CAD" : "USD");
const firstLine = (s: string | null | undefined): string | null =>
  s ? (s.split("\n").find((l) => l.trim()) ?? "").replace(/^[-*]\s*/, "").replace(/[*_`]/g, "").trim() || null : null;

async function chessPredictions(): Promise<RawPrediction[]> {
  const plays = await prisma.chessPlay.findMany({
    where: { direction: { in: ["BENEFICIARY", "VICTIM"] }, theme: { status: { not: "RETIRED" } } },
    include: { theme: { select: { title: true } } },
  });
  return plays.map((p) => {
    const yahoo = p.yahoo || yahooForListing(p.symbol, p.exchange);
    return {
      source: "chess" as const,
      refId: p.id,
      symbol: p.symbol.toUpperCase(),
      yahoo: yahoo.toUpperCase(),
      currency: ccyForYahoo(yahoo),
      direction: p.direction === "VICTIM" ? "DOWN" : "UP",
      label: `${p.direction === "VICTIM" ? "victim" : "beneficiary"} · ${p.effectOrder}${["", "st", "nd", "rd"][p.effectOrder] ?? "th"}-order`,
      conviction: p.conviction || null,
      effectOrder: p.effectOrder,
      context: p.theme?.title ?? null,
      predictedAt: p.createdAt,
    };
  });
}

async function callPredictions(): Promise<RawPrediction[]> {
  // Stance-bearing dossiers, excluding hunt leads (those are leads, not Buy/Hold/Sell calls).
  const rows = await prisma.journalEntry.findMany({
    where: {
      kind: { in: ["RESEARCH", "DECISION"] },
      stance: { not: null },
      symbol: { not: null },
      NOT: { title: { startsWith: "Hunt dossier" } },
    },
    select: { id: true, symbol: true, exchange: true, stance: true, confidence: true, at: true },
  });
  const out: RawPrediction[] = [];
  for (const r of rows) {
    const meta = stanceMeta(r.stance);
    if (!meta || meta.pos === 0.5) continue; // unknown or Hold → not a directional bet
    const yahoo = yahooForListing(r.symbol!, r.exchange).toUpperCase();
    out.push({
      source: "call",
      refId: r.id,
      symbol: r.symbol!.toUpperCase(),
      yahoo,
      currency: ccyForYahoo(yahoo),
      direction: meta.pos > 0.5 ? "UP" : "DOWN",
      label: meta.label,
      conviction: r.confidence ?? null,
      effectOrder: null,
      context: "Alfred's call",
      predictedAt: r.at,
    });
  }
  return out;
}

async function huntPredictions(): Promise<RawPrediction[]> {
  const rows = await prisma.journalEntry.findMany({
    where: { kind: "RESEARCH", title: { startsWith: "Hunt dossier" }, symbol: { not: null } },
    select: { id: true, symbol: true, exchange: true, confidence: true, obscurity: true, bottomLine: true, at: true },
  });
  return rows.map((r) => {
    const yahoo = yahooForListing(r.symbol!, r.exchange).toUpperCase();
    return {
      source: "hunt" as const,
      refId: r.id,
      symbol: r.symbol!.toUpperCase(),
      yahoo,
      currency: ccyForYahoo(yahoo),
      direction: "UP" as const, // a lead is an implicit bullish flag
      label: "hunt lead",
      conviction: r.confidence ?? null,
      effectOrder: null,
      context: firstLine(r.bottomLine) ?? (r.obscurity ? `obscurity ${r.obscurity}/5` : null),
      predictedAt: r.at,
    };
  });
}

export async function gatherPredictions(): Promise<RawPrediction[]> {
  const [chess, call, hunt] = await Promise.all([chessPredictions(), callPredictions(), huntPredictions()]);
  return [...chess, ...call, ...hunt];
}
