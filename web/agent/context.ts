import { prisma } from "../lib/db";
import { getPortfolio } from "../lib/portfolio";
import { etParts, isMarketOpen, minutesToClose } from "./calendar";
import { dayPnlBps } from "./validator";
import { HARD, DIALS, SOURCES, MACRO_SWEEP } from "./policy";

function money(c: number): string {
  return `$${(c / 100).toFixed(2)}`;
}

/** The stable context block prepended to every decision-capable session.
 *  Keep the ordering stable — it prompt-caches. */
export async function buildContext(): Promise<string> {
  const [pf, settings, lessons, retros, watchlist, openTheses] = await Promise.all([
    getPortfolio(),
    prisma.settings.findUnique({ where: { id: 1 } }),
    prisma.journalEntry.findMany({ where: { kind: "LESSON" }, orderBy: { at: "desc" }, take: 10 }),
    prisma.journalEntry.findMany({ where: { kind: "RETRO" }, orderBy: { at: "desc" }, take: 5 }),
    prisma.watchlist.findMany({ orderBy: { addedAt: "desc" } }),
    prisma.journalEntry.findMany({ where: { kind: "DECISION" }, orderBy: { at: "desc" }, take: 12 }),
  ]);
  const dialName = settings?.riskLevel ?? "BALANCED";
  const dial = DIALS[dialName];
  const p = etParts();
  const dayBps = await dayPnlBps().catch(() => 0);

  const positions =
    pf.positions.length === 0
      ? "  (all cash)"
      : pf.positions
          .map(
            (x) =>
              `  ${x.symbol}: ${x.qty} sh @ avg ${money(x.avgCostCents)}, last ${money(x.lastCents)} (${(x.dayChangeBps / 100).toFixed(2)}% today), unrealized ${money(x.unrealizedPnlCents)}`,
          )
          .join("\n");

  const benchLine =
    pf.benchmarkCents !== null
      ? `vs-XIC benchmark: same contributions in XIC would be ${money(pf.benchmarkCents)} (we are ${money(pf.navCents - pf.benchmarkCents)} ${pf.navCents >= pf.benchmarkCents ? "ahead" : "behind"})`
      : "vs-XIC benchmark: unavailable";

  return `# GRQ FUND STATE (generated ${p.dateStr} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")} ET)

Market: ${isMarketOpen() ? `OPEN (closes in ${minutesToClose()} min)` : "CLOSED"} — TSX session 9:30–16:00 ET.
Kill switch: ${pf.killSwitch ? "ENGAGED — no order will fill" : "off"}.

## Account
NAV ${money(pf.navCents)} = cash ${money(pf.cashCents)} + positions ${money(pf.positionsCents)}
Contributions ${money(pf.contributionsCents)} · Total P&L ${money(pf.totalPnlCents)} · Day P&L ${(dayBps / 100).toFixed(2)}%
${benchLine}
Fee budget: ${money(pf.feeSpentMonthCents)} spent of ${money(pf.feeBudgetCentsMonth)} this month.

## Positions
${positions}

## Watchlist
${watchlist.length === 0 ? "  (empty)" : watchlist.map((w) => `  ${w.symbol}${w.note ? ` — ${w.note}` : ""}`).join("\n")}

## Policy — ${dialName} dial (you cannot change any of this)
Max position ${dial.maxPositionPct}% NAV · cash floor ${dial.cashFloorPct}% · stop distance ${dial.stopPct}% below ACB (enforced deterministically) · max ${dial.maxNewTradesPerWeek} new buys/week · tiers ${dial.tiers.join("+")}
Hard limits: max ${HARD.maxPositions} positions · ${HARD.maxOrdersPerDay} orders/day · ${HARD.maxOrdersPerHour}/hour · no shorting · no margin · no options · no same-day round trips · no entries first/last ${HARD.noEntriesFirstMin} min · daily-loss pause at ${HARD.dailyLossPauseBps / 100}% · BUY targets must clear ${HARD.feeEdgeMultiple}× round-trip commissions.

## Seed sources (you may use others; cite everything; your retros grade source hit-rates)
${SOURCES.map((s) => `- ${s}`).join("\n")}
Macro sweep each morning: ${MACRO_SWEEP.join(" · ")}

## Recent decisions (latest 12)
${openTheses.map((j) => `- [${j.at.toISOString().slice(0, 10)}] ${j.title}`).join("\n") || "  (none yet)"}

## Lessons learned (read these before deciding)
${lessons.map((l) => `- ${l.title}: ${l.body.slice(0, 200).replace(/\n/g, " ")}`).join("\n") || "  (none yet — earn some)"}

## Recent retros
${retros.map((r) => `- ${r.title}: ${r.body.slice(0, 200).replace(/\n/g, " ")}`).join("\n") || "  (none yet)"}
`;
}
