import { prisma } from "../../lib/db";
import { getQuotes } from "../../lib/broker/quotes";
import { trackedUniverse } from "../../lib/universe";
import { getMacro, macroLine } from "../../lib/macro";
import { DIALS, SHORTDESK } from "../policy";
import { etParts, isMarketOpen, minutesToClose } from "../calendar";
import { accrueBorrowCents, shortUnrealizedCents } from "../../lib/short/mechanics";
import { SHORTDESK_CONTROL_SUFFIX, SHORTDESK_TREATMENT_SUFFIX } from "./desk-parse";

// The frozen snapshot fed to ONE Short-Desk arm each session — its own long/short book + the shared
// menu. Single-currency virtual book (no FX; educational). Mirrors buildDeskContext.
export type ShortArmLite = { id: number; model: string; arm: string; dial: string; label: string; cashCents: number };

const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const DAY_MS = 86_400_000;
const UNIVERSE_CAP = 80;

export async function buildShortDeskContext(a: ShortArmLite, startingStakeCents: number, maintPct: number): Promise<string> {
  const treatment = a.arm === "treatment";
  const dial = DIALS[a.dial as keyof typeof DIALS] ?? DIALS.BALANCED;
  const p = etParts();
  const now = Date.now();
  const [positions, uni] = await Promise.all([
    prisma.shortDeskPosition.findMany({ where: { armId: a.id, status: "OPEN" }, orderBy: { symbol: "asc" } }),
    trackedUniverse(),
  ]);

  const dossierRows = await prisma.journalEntry.findMany({
    where: { kind: "RESEARCH", title: { startsWith: "Dossier" }, symbol: { in: uni.map((u) => u.symbol) } },
    orderBy: { at: "desc" },
    select: { symbol: true, stance: true, confidence: true },
  });
  const callBy = new Map<string, { stance: string | null; confidence: number | null }>();
  for (const d of dossierRows) if (d.symbol && !callBy.has(d.symbol)) callBy.set(d.symbol, { stance: d.stance, confidence: d.confidence });
  const candidates = [...uni].sort((x, y) => (callBy.get(y.symbol)?.confidence ?? -1) - (callBy.get(x.symbol)?.confidence ?? -1)).slice(0, UNIVERSE_CAP);

  const quotes = await getQuotes([...new Set([...positions.map((x) => x.symbol), ...candidates.map((u) => u.symbol)])]);

  let longVal = 0;
  let shortVal = 0;
  let borrow = 0;
  const longViews: string[] = [];
  const shortViews: string[] = [];
  for (const x of positions) {
    const q = quotes.get(x.symbol.toUpperCase());
    const mark = q && q.midCents > 0 ? q.midCents : x.lastMarkCents ?? x.avgCostCents;
    if (x.side === "SHORT") {
      const accrued = x.accruedBorrowCents + accrueBorrowCents(x.qty * mark, x.borrowBps, Math.max(0, (now - x.lastAccruedAt.getTime()) / DAY_MS));
      shortVal += x.qty * mark;
      borrow += accrued;
      shortViews.push(`  SHORT ${x.qty} ${x.symbol} @ ${money(x.avgCostCents)} → mark ${money(mark)}, unrealized ${money(shortUnrealizedCents(x.qty, x.avgCostCents, mark, accrued))} · borrow ~${(x.borrowBps / 100).toFixed(1)}%/yr`);
    } else {
      longVal += x.qty * mark;
      longViews.push(`  ${x.qty} ${x.symbol} @ avg ${money(x.avgCostCents)} → mark ${money(mark)}, unrealized ${money(x.qty * (mark - x.avgCostCents))}`);
    }
  }
  const equity = a.cashCents + longVal - shortVal - borrow;
  const retPct = startingStakeCents > 0 ? ((equity - startingStakeCents) / startingStakeCents) * 100 : 0;
  const maxPos = Math.round((dial.maxPositionPct / 100) * equity);
  const maxShort = Math.round((SHORTDESK.maxShortPctNav / 100) * equity);
  const maintReq = Math.round((maintPct / 100) * shortVal);

  const universeBlock = candidates
    .map((u) => {
      const q = quotes.get(u.symbol.toUpperCase());
      const px = q && q.midCents > 0 ? `${money(q.midCents)} (${((q.dayChangeBps ?? 0) / 100).toFixed(2)}%)` : "(no quote)";
      const c = callBy.get(u.symbol);
      return `  ${u.symbol} — ${u.name}: ${px}${c ? ` · GRQ: ${c.stance ?? "?"}${c.confidence != null ? `/${c.confidence}%` : ""}` : ""}`;
    })
    .join("\n");
  const macro = await getMacro().catch(() => null);

  return `# SHORT LAB A/B — you are "${a.label}" (${a.model})
You run a virtual paper account in a two-arm experiment: a CONTROL (long only) vs a TREATMENT (long PLUS the power to SHORT). ${treatment ? "You are the TREATMENT — you can also bet AGAINST names by shorting." : "You are the CONTROL — long only, exactly what the live fund does."} Grow this account over time, on conviction, within your risk dial. Decisions are YOURS and execute in YOUR book. (Modeled sandbox, single-currency, no FX.)

Market: ${isMarketOpen() ? `OPEN (closes in ${minutesToClose()} min)` : "CLOSED"} — ${p.dateStr} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")} ET.

## Your account
Equity ${money(equity)} = cash ${money(a.cashCents)} + longs ${money(longVal)} − shorts ${money(shortVal)} − borrow ${money(borrow)}. Started ${money(startingStakeCents)} → return ${retPct >= 0 ? "+" : ""}${retPct.toFixed(2)}%.

## Your long positions
${longViews.length ? longViews.join("\n") : "  (none)"}
${treatment ? `\n## Your short positions\n${shortViews.length ? shortViews.join("\n") : "  (none)"}\nMaintenance margin needed for your shorts: ${money(maintReq)} (${maintPct}% of short value). If equity falls below it, your worst short is FORCE-COVERED.` : ""}

## Your risk dial — ${a.dial}
Longs: max ${dial.maxPositionPct}% of equity per name = **${money(maxPos)}**.${treatment ? ` Shorts: max ${SHORTDESK.maxShortPctNav}% of equity per short = **${money(maxShort)}**; ${SHORTDESK.maxShortsPerWeek} new shorts / rolling week.` : " No shorting, no margin."}

## GRQ's researched library (your menu — "GRQ:" is our dossier call, an INPUT to weigh, NOT a rule)
${universeBlock}

## Macro
${macro ? `  ${macroLine(macro)} (as of ${macro.asOf})` : "  (unavailable)"}${treatment ? SHORTDESK_TREATMENT_SUFFIX : SHORTDESK_CONTROL_SUFFIX}`;
}
