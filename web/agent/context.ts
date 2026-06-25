import { prisma } from "../lib/db";
import { getPortfolio } from "../lib/portfolio";
import { etParts, isMarketOpen, minutesToClose } from "./calendar";
import { dayPnlBps, superficialLossWindows } from "./validator";
import { computeSignals, signalsOneLine } from "./signals";
import { getScoreboard, scoreboardText, MIN_GRADES_TO_RANK } from "../lib/scoreboard";
import { fmpEnabled, fmpEarnings } from "../lib/fmp";
import { getSmartMoneyForSymbol, smartMoneySummaryLine } from "../lib/smart-money/queries";
import { getMacro, macroLine } from "../lib/macro";
import { HARD, DIALS, SOURCES, MACRO_SWEEP, CHECKIN_TIMES_ET } from "./policy";

function money(c: number): string {
  return `$${(c / 100).toFixed(2)}`;
}

/** The stable context block prepended to every decision-capable session.
 *  Keep the ordering stable — it prompt-caches. */
export async function buildContext(): Promise<string> {
  const [pf, settings, lessons, retros, focus, openTheses, directives, slWindows, scoreboard, macro, wakeups, agenda] =
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
      prisma.agentWakeup.findMany({ where: { status: "PENDING" }, orderBy: { dueAt: "asc" } }),
      prisma.agentAgendaItem.findMany({ where: { status: "OPEN" }, orderBy: { createdAt: "asc" } }),
    ]);
  const pad2 = (n: number) => String(n).padStart(2, "0");
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

  // Cash is multi-currency (D34): the fund holds CAD and USD separately. NEVER
  // describe the total as "CAD idle" — the US$ leg funds US-listed buys directly
  // (no FX needed) and converting between currencies requires a member-approved
  // request_fx (D62). Spell the split out so the agent reasons per-currency.
  const fxNote = pf.fxUsdCad ? ` @ ${pf.fxUsdCad.toFixed(4)} USD→CAD` : "";
  const cashLine =
    pf.usdCashCents > 0
      ? `Cash by currency: CA$${(pf.cadCashCents / 100).toFixed(2)} + US$${(pf.usdCashCents / 100).toFixed(2)} (= ${money(pf.cashCents)} total valued in CAD${fxNote}). The US$ leg funds US-listed buys directly and is NOT idle CAD; only CA$ funds CAD buys. Moving cash between currencies needs a member-approved request_fx.`
      : `Cash: ${money(pf.cashCents)}, all CAD.`;

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

  // Smart money on the names we hold or are watching — disclosed 13F holdings,
  // congress + insider trades (D28). An INPUT the agent weighs, never a guardrail.
  const smSyms = [...new Set([...pf.positions.map((x) => x.symbol), ...focus.map((f) => f.symbol)])];
  const smartLines = (
    await Promise.all(
      smSyms.map(async (s) => {
        const sm = await getSmartMoneyForSymbol(s).catch(() => null);
        const line = sm ? smartMoneySummaryLine(sm) : "";
        return line ? `  ${s}: ${line}` : null;
      }),
    )
  ).filter((l): l is string => !!l);

  // Current dossier verdict per focus name — the AUTHORITATIVE live call (latest
  // "Dossier —" RESEARCH entry). Surfaced next to each focus note so the agent
  // grounds on real state instead of its own scratch note, which has no update
  // timestamp and can drift stale (e.g. L's note kept claiming a "CPI-error dossier,
  // needs a refresh" long after the clean refresh landed it at Hold/63 — every
  // check-in re-read the stale note and parroted it; D-fix 2026-06-24).
  const focusSyms = [...new Set(focus.map((f) => f.symbol.toUpperCase()))];
  const focusDossierRows = focusSyms.length
    ? await prisma.journalEntry.findMany({
        where: { kind: "RESEARCH", title: { startsWith: "Dossier" }, symbol: { in: focusSyms } },
        orderBy: { at: "desc" },
        select: { symbol: true, stance: true, confidence: true, at: true },
      })
    : [];
  const focusDossier = new Map<string, { stance: string | null; confidence: number | null; at: Date }>();
  for (const d of focusDossierRows) {
    if (d.symbol && !focusDossier.has(d.symbol)) focusDossier.set(d.symbol, { stance: d.stance, confidence: d.confidence, at: d.at });
  }
  const focusLine = (w: { symbol: string; note: string | null }): string => {
    const d = focusDossier.get(w.symbol.toUpperCase());
    const call = d ? ` — GRQ's call ${d.stance ?? "?"}${d.confidence != null ? `/${d.confidence}%` : ""} as of dossier ${d.at.toISOString().slice(0, 10)}` : " — (no dossier yet)";
    return `  ${w.symbol}${call}${w.note ? ` · your note: ${w.note}` : ""}`;
  };

  return `# GRQ FUND STATE (generated ${p.dateStr} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")} ET)

Market: ${isMarketOpen() ? `OPEN (closes in ${minutesToClose()} min)` : "CLOSED"} — TSX session 9:30–16:00 ET.
Kill switch: ${pf.killSwitch ? "ENGAGED — no order will fill" : "off"}.

## Account
NAV ${money(pf.navCents)} = cash ${money(pf.cashCents)} (valued in CAD) + positions ${money(pf.positionsCents)}
${cashLine}
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
The dated "GRQ's call" is the CURRENT dossier verdict and is AUTHORITATIVE. Your note is scratch text with no update timestamp — if it disagrees with a fresher dossier (e.g. claims a name "needs a refresh" or cites old data, but the dossier date is newer), the DOSSIER WINS: act on it and fix the note via set_focus. Don't re-state a stale note as if it were today's read.
${focus.length === 0 ? "  (empty)" : focus.map(focusLine).join("\n")}

## Your agenda — follow-ups to work at your NEXT hourly check-in (add via add_agenda, close via resolve_agenda)
${
  agenda.length === 0
    ? "  (empty — park follow-ups here instead of scheduling separate sessions: \"revisit DRX once its dossier lands\", \"watch LNR for the add-zone\")"
    : agenda.map((a) => `  #${a.id}${a.symbol ? ` [${a.symbol}]` : ""}: ${a.body}`).join("\n")
}

## Your scheduled wake-ups today (ONLY for events that can't wait until the next hourly check-in; revise via schedule_checkin / cancel_checkin)
${
  wakeups.length === 0
    ? "  (none — for anything that can wait an hour, use add_agenda instead)"
    : wakeups.map((w) => `  ${pad2(etParts(w.dueAt).hour)}:${pad2(etParts(w.dueAt).minute)} ET — ${w.reason}`).join("\n")
}
Fixed daily trading check-ins run at ${CHECKIN_TIMES_ET.join(", ")} ET (you don't schedule those).

## Upcoming earnings (next 3 weeks — a catalyst; size and time around it)
${earnings.length === 0 ? "  (none on holdings or focus)" : earnings.map((e) => `  ${e.symbol}: reports ${e.date} (in ${e.days}d)${e.eps != null ? `, EPS est ${e.eps}` : ""}`).join("\n")}

## Smart money on your names (disclosed positions/trades — an INPUT you weigh, NEVER the gate; 13F lags ~45 days, congress amounts are ranges)
${smartLines.length === 0 ? "  (none disclosed on holdings or focus)" : smartLines.join("\n")}

## Macro (Bank of Canada + US Fed/Treasury via FRED — live structured feeds; rate-sensitive names move on this)
${macro ? `  ${macroLine(macro)} (as of ${macro.asOf})` : "  (unavailable)"}

## Policy — ${dialName} dial (you cannot change any of this)
Max position ${dial.maxPositionPct}% NAV · cash floor ${dial.cashFloorPct}% · stop distance ${dial.stopPct}% below ACB (enforced deterministically) · max ${dial.maxNewTradesPerWeek} new buys/week · tiers ${dial.tiers.join("+")}
Hard limits: ${HARD.maxOrdersPerDay} orders/day · ${HARD.maxOrdersPerHour}/hour · no cap on # of holdings (breadth is your call — size, the cash floor, and the weekly BUY cap still bind) · no shorting · no margin · no options · no same-day round trips · no entries first/last ${HARD.noEntriesFirstMin} min · daily-loss pause at ${HARD.dailyLossPauseBps / 100}% · BUY targets must clear ${HARD.feeEdgeMultiple}× round-trip commissions.

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
