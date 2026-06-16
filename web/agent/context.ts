import { prisma } from "../lib/db";
import { getPortfolio } from "../lib/portfolio";
import { etParts, isMarketOpen, minutesToClose } from "./calendar";
import { dayPnlBps, superficialLossWindows } from "./validator";
import { computeSignals, signalsOneLine } from "./signals";
import { getScoreboard, scoreboardText, MIN_GRADES_TO_RANK } from "../lib/scoreboard";
import { fmpEnabled, fmpEarnings } from "../lib/fmp";
import { getMacro, macroLine } from "../lib/macro";
import { HARD, DIALS, SOURCES, MACRO_SWEEP } from "./policy";

function money(c: number): string {
  return `$${(c / 100).toFixed(2)}`;
}

/** The stable context block prepended to every decision-capable session.
 *  Keep the ordering stable — it prompt-caches. */
export async function buildContext(): Promise<string> {
  const [pf, settings, lessons, retros, focus, openTheses, directives, slWindows, scoreboard, macro] =
    await Promise.all([
      getPortfolio(),
      prisma.settings.findUnique({ where: { id: 1 } }),
      prisma.journalEntry.findMany({ where: { kind: "LESSON" }, orderBy: { at: "desc" }, take: 10 }),
      prisma.journalEntry.findMany({ where: { kind: "RETRO" }, orderBy: { at: "desc" }, take: 5 }),
      prisma.agentFocus.findMany({ orderBy: { addedAt: "desc" } }),
      prisma.journalEntry.findMany({ where: { kind: "DECISION" }, orderBy: { at: "desc" }, take: 12 }),
      prisma.symbolDirective.findMany(),
      superficialLossWindows().catch(() => []),
      getScoreboard().catch(() => []),
      getMacro().catch(() => null),
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

  // Upcoming earnings on holdings + focus (Tier 6 awareness) — a catalyst to size
  // and time around. Best-effort; empty if FMP is off or uncovered.
  const earnSyms = [...new Set([...pf.positions.map((x) => x.symbol), ...focus.map((f) => f.symbol)])];
  const earnings = fmpEnabled()
    ? (
        await Promise.all(
          earnSyms.map(async (s) => {
            const e = await fmpEarnings(s).catch(() => null);
            if (!e?.upcoming) return null;
            const days = Math.round((new Date(e.date).getTime() - Date.now()) / 86_400_000);
            return days >= 0 && days <= 21 ? { symbol: s, date: e.date, days, eps: e.epsEstimated } : null;
          }),
        )
      )
        .filter((r): r is { symbol: string; date: string; days: number; eps: number | null } => !!r)
        .sort((a, b) => a.days - b.days)
    : [];

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

## Signals on holdings (v1 — on scoreboard probation; cite as "signal:<family>")
${
  pf.positions.length === 0
    ? "  (no holdings)"
    : (
        await Promise.all(
          pf.positions.map(async (x) => {
            const s = await computeSignals(x.symbol).catch(() => null);
            return s ? `  ${x.symbol}: ${signalsOneLine(s)}` : `  ${x.symbol}: (no bar history yet)`;
          }),
        )
      ).join("\n")
}

## Your focus (ACTIVE names you're monitoring for an entry — update via set_focus)
${focus.length === 0 ? "  (empty)" : focus.map((w) => `  ${w.symbol}${w.note ? ` — ${w.note}` : ""}`).join("\n")}

## Upcoming earnings (next 3 weeks — a catalyst; size and time around it)
${earnings.length === 0 ? "  (none on holdings or focus)" : earnings.map((e) => `  ${e.symbol}: reports ${e.date} (in ${e.days}d)${e.eps != null ? `, EPS est ${e.eps}` : ""}`).join("\n")}

## Macro (Bank of Canada — live structured feed; rate-sensitive names move on this)
${macro ? `  ${macroLine(macro)} (as of ${macro.asOf})` : "  (unavailable)"}

## Policy — ${dialName} dial (you cannot change any of this)
Max position ${dial.maxPositionPct}% NAV · cash floor ${dial.cashFloorPct}% · stop distance ${dial.stopPct}% below ACB (enforced deterministically) · max ${dial.maxNewTradesPerWeek} new buys/week · tiers ${dial.tiers.join("+")}
Hard limits: max ${HARD.maxPositions} positions · ${HARD.maxOrdersPerDay} orders/day · ${HARD.maxOrdersPerHour}/hour · no shorting · no margin · no options · no same-day round trips · no entries first/last ${HARD.noEntriesFirstMin} min · daily-loss pause at ${HARD.dailyLossPauseBps / 100}% · BUY targets must clear ${HARD.feeEdgeMultiple}× round-trip commissions.

## Member directives (binding — set by Cam & Graham on the stock pages)
${
  directives.length === 0
    ? "  (none)"
    : directives
        .map((d) => `  ${d.directive === "BLOCKED" ? "🚫 BLOCKED" : "📌 PINNED"}: ${d.symbol} — ${d.by}${d.note ? `: "${d.note}"` : ""}`)
        .join("\n")
}

## Superficial-loss windows (no rebuy — CRA denies the loss)
${slWindows.length === 0 ? "  (none open)" : slWindows.map((w) => `  ${w.symbol}: blocked until ${w.until.toISOString().slice(0, 10)}`).join("\n")}

## Source scoreboard (grade sources in retros; ranked after ${MIN_GRADES_TO_RANK} grades)
${
  scoreboard.length === 0
    ? "  (no grades yet — your retros build this)"
    : "Trust the top, downweight the bottom:\n" +
      scoreboardText(scoreboard.slice(0, 5)) +
      (scoreboard.length > 5 ? "\n…worst:\n" + scoreboardText(scoreboard.slice(-3)) : "")
}

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
