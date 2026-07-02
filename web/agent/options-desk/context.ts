import { prisma } from "../../lib/db";
import { getQuotes } from "../../lib/broker/quotes";
import { trackedUniverse } from "../../lib/universe";
import { usdCadRate, toCadCents } from "../../lib/fx";
import { getMacro, macroLine } from "../../lib/macro";
import { DIALS, DESK } from "../policy";
import { etParts, isMarketOpen, minutesToClose } from "../calendar";
import { DESK_CONTROL_SUFFIX, DESK_TREATMENT_SUFFIX } from "./parse";
import { daysToExpiry } from "../../lib/options/price";

// The frozen snapshot fed to ONE desk arm each session — its OWN book + the shared market menu.
// Mirrors agent/race/context.ts; the only structural difference is the option-aware book + (for the
// treatment) the buy-option grammar. Self-contained and desk-scoped.

export type DeskEntrantLite = { id: number; model: string; arm: string; dial: string; label: string; cashCents: number };

const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const UNIVERSE_CAP = 100;

/** Per-share mark for an option position (engine-written), falling back to its cost. */
function optMark(p: { lastMarkCents: number | null; avgCostCents: number }): number {
  return p.lastMarkCents != null && p.lastMarkCents > 0 ? p.lastMarkCents : p.avgCostCents;
}

export async function buildDeskContext(e: DeskEntrantLite, startingStakeCents: number): Promise<string> {
  const treatment = e.arm === "treatment";
  const dial = DIALS[e.dial as keyof typeof DIALS] ?? DIALS.BALANCED;
  const p = etParts();
  const now = new Date();
  const [positions, uni, fx] = await Promise.all([
    prisma.deskPosition.findMany({ where: { entrantId: e.id }, orderBy: { underlying: "asc" } }),
    trackedUniverse(),
    usdCadRate(),
  ]);

  const dossierRows = await prisma.journalEntry.findMany({
    where: { kind: "RESEARCH", title: { startsWith: "Dossier" }, symbol: { in: uni.map((u) => u.symbol) } },
    orderBy: { at: "desc" },
    select: { symbol: true, stance: true, confidence: true },
  });
  const callBy = new Map<string, { stance: string | null; confidence: number | null }>();
  for (const d of dossierRows) if (d.symbol && !callBy.has(d.symbol)) callBy.set(d.symbol, { stance: d.stance, confidence: d.confidence });

  const candidates = [...uni].sort((a, b) => (callBy.get(b.symbol)?.confidence ?? -1) - (callBy.get(a.symbol)?.confidence ?? -1)).slice(0, UNIVERSE_CAP);
  const stockSymbols = positions.filter((x) => x.kind === "STOCK").map((x) => x.underlying);
  const quotes = await getQuotes([...new Set([...stockSymbols, ...candidates.map((u) => u.symbol)])]);

  // Value the book in CAD (stocks marked live, options marked to the engine's last per-share mark).
  let positionsCad = 0;
  const stockViews: string[] = [];
  const optViews: string[] = [];
  for (const x of positions) {
    if (x.kind === "STOCK") {
      const q = quotes.get(x.underlying.toUpperCase());
      const last = q && q.midCents > 0 ? q.midCents : x.avgCostCents;
      const mvCad = toCadCents(x.qty * last, x.currency, fx);
      positionsCad += mvCad;
      const unreal = toCadCents(x.qty * (last - x.avgCostCents), x.currency, fx);
      stockViews.push(`  ${x.underlying}: ${x.qty} sh @ avg ${money(x.avgCostCents)} ${x.currency}, last ${money(last)} → ${money(mvCad)} CAD, unrealized ${money(unreal)} CAD`);
    } else {
      const right = x.kind as "CALL" | "PUT";
      const mark = optMark(x);
      const mvNative = x.qty * 100 * mark;
      const mvCad = toCadCents(mvNative, x.currency, fx);
      positionsCad += mvCad;
      const unreal = toCadCents(x.qty * 100 * (mark - x.avgCostCents), x.currency, fx);
      const dte = x.expiry ? daysToExpiry(x.expiry, now) : 0;
      const be = right === "CALL" ? (x.strikeCents ?? 0) + x.avgCostCents : (x.strikeCents ?? 0) - x.avgCostCents;
      optViews.push(
        `  ${x.underlying} ${x.expiry} ${money(x.strikeCents ?? 0)} ${right} ×${x.qty}: paid ${money(x.avgCostCents)}/sh, mark ${money(mark)} → ${money(mvCad)} CAD, unrealized ${money(unreal)} CAD · breakeven ${money(be)} · ${dte}d to expiry`,
      );
    }
  }
  const navCad = e.cashCents + positionsCad;
  const retPct = startingStakeCents > 0 ? ((navCad - startingStakeCents) / startingStakeCents) * 100 : 0;
  const cashPct = navCad > 0 ? (e.cashCents / navCad) * 100 : 100;
  const maxPosCad = Math.round((dial.maxPositionPct / 100) * navCad);
  const cashFloorCad = Math.round((dial.cashFloorPct / 100) * navCad);
  const deployableCad = Math.max(0, e.cashCents - cashFloorCad);
  const maxOptPremiumCad = Math.round((8 / 100) * navCad); // mirrors DESK.optionMaxPremiumPctNav (the gate enforces the live value)

  const universeBlock = candidates
    .map((u) => {
      const q = quotes.get(u.symbol.toUpperCase());
      const px = q && q.midCents > 0 ? `${money(q.midCents)} ${u.currency ?? "CAD"} (${((q.dayChangeBps ?? 0) / 100).toFixed(2)}%)` : "(no quote)";
      const c = callBy.get(u.symbol);
      const call = c ? ` · GRQ: ${c.stance ?? "?"}${c.confidence != null ? `/${c.confidence}%` : ""}` : "";
      return `  ${u.symbol} — ${u.name}: ${px}${call}`;
    })
    .join("\n");

  const macro = await getMacro().catch(() => null);

  return `# OPTIONS DESK — you are "${e.label}" (${e.model})
You run a virtual paper account in a two-arm experiment: a CONTROL (stocks only) vs a TREATMENT (stocks PLUS the power to buy options). ${treatment ? "You are the TREATMENT — you have the extra option power." : "You are the CONTROL — stocks only, exactly what the live fund does."} Grow this account over time, on conviction, within your risk dial. Decisions are YOURS and execute in YOUR book.

Market: ${isMarketOpen() ? `OPEN (closes in ${minutesToClose()} min)` : "CLOSED"} — ${p.dateStr} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")} ET.

## Your account (CAD)
NAV ${money(navCad)} = cash ${money(e.cashCents)} + positions ${money(positionsCad)}. Started ${money(startingStakeCents)} → return ${retPct >= 0 ? "+" : ""}${retPct.toFixed(2)}%.
Cash ${money(e.cashCents)} = ${cashPct.toFixed(1)}% of NAV.

## Your stock positions
${stockViews.length ? stockViews.join("\n") : "  (no stock positions)"}
${treatment ? `\n## Your option positions\n${optViews.length ? optViews.join("\n") : "  (no option positions)"}` : ""}

## Your risk dial — ${e.dial} (HARD: calls that violate are auto-rejected by the desk gate)
Stocks: max position ${dial.maxPositionPct}% of NAV = **${money(maxPosCad)} per name**. Keep ≥ ${dial.cashFloorPct}% cash (${money(cashFloorCad)}) → deployable now: **${money(deployableCad)}**. Max ${dial.maxNewTradesPerWeek} new stock buys / rolling week. No shorting, no margin.${
    treatment
      ? `\nOptions: BUY-TO-OPEN ONLY (never sell/write, never spreads). Premium per option position capped at ~${money(maxOptPremiumCad)} (8% of NAV) — that premium IS your max loss. ${DESK.optionMaxOpenPerWeek > 0 ? `Max ${DESK.optionMaxOpenPerWeek} new option opens / rolling week.` : "No weekly cap on the number of option opens (still bounded by the premium cap + your cash)."} US-listed underlyings only.`
      : ""
  }

## GRQ's researched library (your menu — "GRQ:" is our dossier call, an INPUT to weigh, NOT a rule)
${universeBlock}

## Macro
${macro ? `  ${macroLine(macro)} (as of ${macro.asOf})` : "  (unavailable)"}${treatment ? DESK_TREATMENT_SUFFIX : DESK_CONTROL_SUFFIX}`;
}
