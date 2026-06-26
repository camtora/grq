import { prisma } from "../../lib/db";
import { getQuotes } from "../../lib/broker/quotes";
import { trackedUniverse } from "../../lib/universe";
import { usdCadRate, toCadCents } from "../../lib/fx";
import { computeSignals, signalsOneLine } from "../signals";
import { getMacro, macroLine } from "../../lib/macro";
import { DIALS } from "../policy";
import { etParts, isMarketOpen, minutesToClose } from "../calendar";
import { BULL_DECISION_SUFFIX } from "./shadow";

// The frozen snapshot fed to ONE bull each race session — built from ITS OWN book + ITS OWN dial.
// Same market data every bull sees; the portfolio is the bull's. Mirrors agent/context.ts in
// spirit but is self-contained and race-scoped (no fund lessons/directives/scoreboard).

export type EntrantLite = { id: number; model: string; dial: string; persona: string | null; label: string; cashCents: number };

const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const UNIVERSE_CAP = 100; // names offered as the tradeable set (the whole tracked library fits)

export async function buildBullContext(e: EntrantLite, startingStakeCents: number): Promise<string> {
  const dial = DIALS[e.dial as keyof typeof DIALS] ?? DIALS.BALANCED;
  const p = etParts();
  const [positions, uni, fx] = await Promise.all([
    prisma.racePosition.findMany({ where: { entrantId: e.id }, orderBy: { symbol: "asc" } }),
    trackedUniverse(), // ACTIVE + CANDIDATE — the whole RESEARCHED library, not just the tradeable subset
    usdCadRate(),
  ]);

  // GRQ's latest dossier verdict (stance + confidence) per researched name — the no-tools bull's
  // research to reason on. Same shared seed every bull gets; an input, not a rule.
  const dossierRows = await prisma.journalEntry.findMany({
    where: { kind: "RESEARCH", title: { startsWith: "Dossier" }, symbol: { in: uni.map((u) => u.symbol) } },
    orderBy: { at: "desc" },
    select: { symbol: true, stance: true, confidence: true },
  });
  const callBy = new Map<string, { stance: string | null; confidence: number | null }>();
  for (const d of dossierRows) if (d.symbol && !callBy.has(d.symbol)) callBy.set(d.symbol, { stance: d.stance, confidence: d.confidence });

  // Highest-conviction (and dossier'd) names first, so the cap (if ever hit) keeps the best.
  const candidates = [...uni].sort((a, b) => (callBy.get(b.symbol)?.confidence ?? -1) - (callBy.get(a.symbol)?.confidence ?? -1)).slice(0, UNIVERSE_CAP);
  const quotes = await getQuotes([...new Set([...positions.map((x) => x.symbol), ...candidates.map((u) => u.symbol)])]);

  // Value the book in CAD.
  let positionsCad = 0;
  const posViews = positions.map((x) => {
    const q = quotes.get(x.symbol.toUpperCase());
    const lastNative = q && q.midCents > 0 ? q.midCents : x.avgCostCents;
    const mvCad = toCadCents(x.qty * lastNative, x.currency, fx);
    positionsCad += mvCad;
    return { x, lastNative, mvCad, unrealCad: toCadCents(x.qty * (lastNative - x.avgCostCents), x.currency, fx) };
  });
  const navCad = e.cashCents + positionsCad;
  const retPct = startingStakeCents > 0 ? ((navCad - startingStakeCents) / startingStakeCents) * 100 : 0;
  const cashPct = navCad > 0 ? (e.cashCents / navCad) * 100 : 100;
  // Concrete CAD limits so a no-tools bull can SIZE its order to fit instead of guessing the % math
  // (over-sized BUYs were the #1 auto-reject — e.g. proposing a TSM stake > the position cap).
  const maxPosCad = Math.round((dial.maxPositionPct / 100) * navCad);
  const cashFloorCad = Math.round((dial.cashFloorPct / 100) * navCad);
  const deployableCad = Math.max(0, e.cashCents - cashFloorCad);

  const positionsBlock =
    posViews.length === 0
      ? "  (all cash — no positions yet)"
      : posViews
          .map(({ x, lastNative, mvCad, unrealCad }) => {
            const wt = navCad > 0 ? ((mvCad / navCad) * 100).toFixed(1) : "0.0";
            const room = maxPosCad - mvCad;
            const roomStr = room > 0 ? `room to add ${money(room)} before the ${dial.maxPositionPct}% cap` : `AT/OVER the ${dial.maxPositionPct}% cap — cannot add`;
            return `  ${x.symbol}: ${x.qty} sh @ avg ${money(x.avgCostCents)} ${x.currency}, last ${money(lastNative)} → ${money(mvCad)} CAD = ${wt}% of NAV, unrealized ${money(unrealCad)} CAD · ${roomStr}`;
          })
          .join("\n");

  const signalsBlock = positions.length
    ? (
        await Promise.all(
          positions.map(async (x) => {
            const s = await computeSignals(x.symbol).catch(() => null);
            return s ? `  ${x.symbol}: ${signalsOneLine(s)}` : `  ${x.symbol}: (no bar history)`;
          }),
        )
      ).join("\n")
    : "  (no holdings)";

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

  return `# BULL RACE — you are "${e.label}" (${e.model})
You run a virtual paper account in a multi-model competition. Your job: grow this account over time, on conviction, within your risk dial. Decisions are YOURS and execute in YOUR book.
Risk dial: ${e.dial}${e.persona ? ` · style: ${e.persona}` : ""}.

Market: ${isMarketOpen() ? `OPEN (closes in ${minutesToClose()} min)` : "CLOSED"} — ${p.dateStr} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")} ET.

## Your account (CAD)
NAV ${money(navCad)} = cash ${money(e.cashCents)} + positions ${money(positionsCad)}. Started ${money(startingStakeCents)} → return ${retPct >= 0 ? "+" : ""}${retPct.toFixed(2)}%.
Cash ${money(e.cashCents)} = ${cashPct.toFixed(1)}% of NAV.

## Your positions
${positionsBlock}

## Signals on your holdings
${signalsBlock}

## Your risk dial — ${e.dial} (HARD: calls that violate are auto-rejected by the race gate)
Max position ${dial.maxPositionPct}% of NAV = **${money(maxPosCad)} per name** — a NEW name can take up to ${money(maxPosCad)}; for a name you already hold, only add up to its "room" shown above. SIZE each BUY to fit (an order over this in one name is auto-rejected, and the round is wasted).
Keep ≥ ${dial.cashFloorPct}% cash (${money(cashFloorCad)}) → deployable right now: **${money(deployableCad)}**. Max ${dial.maxNewTradesPerWeek} new buys / rolling week · prefer tiers ${dial.tiers.join("+")}.
No shorting, no margin: a BUY must fit your cash; a SELL only trims a name you hold.

## GRQ's researched library (your menu — pick BUYs from here; "GRQ:" is our dossier call (stance/confidence), an INPUT to weigh, NOT a rule; you may also SELL anything you hold)
${universeBlock}

## Macro
${macro ? `  ${macroLine(macro)} (as of ${macro.asOf})` : "  (unavailable)"}
${e.persona ? `\nYour mandate/style: ${e.persona}` : ""}${BULL_DECISION_SUFFIX}`;
}
