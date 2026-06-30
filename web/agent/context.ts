import { prisma } from "../lib/db";
import { getPortfolio } from "../lib/portfolio";
import { etParts, isMarketOpen, minutesToClose } from "./calendar";
import { dayPnlBps, superficialLossWindows } from "./validator";
import { computeSignals, signalsOneLine } from "./signals";
import { getScoreboard, scoreboardText, MIN_GRADES_TO_RANK } from "../lib/scoreboard";
import { fmpEnabled, fmpEarnings } from "../lib/fmp";
import { getSmartMoneyForSymbol, smartMoneySummaryLine } from "../lib/smart-money/queries";
import { getMacro, macroLine } from "../lib/macro";
import { recentMacroEvents, upcomingEvents } from "../lib/macro-events";
import { recentNewsDigest } from "../lib/news/queries";
import { screenFinds, findLine } from "../lib/market-screen/retrieval";
import { getOptions, optionsLine } from "../lib/options/store";
import { getSocial, socialLine } from "../lib/social/store";
import { accountsForMembers } from "../lib/external/store";
import { memberEmails } from "../lib/users";
import { personByEmail } from "../lib/people";
import { HARD, DIALS, SOURCES, MACRO_SWEEP, CHECKIN_TIMES_ET, OPERATING_COST_USD_CENTS_PER_MONTH } from "./policy";

function money(c: number): string {
  return `$${(c / 100).toFixed(2)}`;
}

/** Normalize a symbol to its bare ticker for cross-account overlap (strip known exchange
 *  suffixes only — NOT class-share dots like BRK.B). Fund stores US as TICKER.US / CA as bare;
 *  external holdings are bare + a currency — both collapse to the same key here. */
function bareKey(s: string): string {
  return s.toUpperCase().replace(/\.(TO|TSX|TSXV|V|CN|CSE|NE|NEO|US)$/i, "");
}

/** Tier 11 — members' personal brokerage accounts (Cam & Graham's TD TFSA etc. via SnapTrade).
 *  READ-ONLY VISIBILITY: the agent SEES what they hold so it can weigh cross-account
 *  concentration, but it can NEVER trade these accounts — they're isolated from the broker seam
 *  (there is no order path here; this is a context string, not a tool). Best-effort; values are
 *  marked live by accountsForMembers. Toggle off without a deploy via GRQ_AGENT_SEES_EXTERNAL=off. */
async function personalAccountsBlock(fundBareHeld: Set<string>): Promise<string> {
  if (process.env.GRQ_AGENT_SEES_EXTERNAL === "off") return "  (disabled)";
  const views = await accountsForMembers(memberEmails()).catch(() => [] as Awaited<ReturnType<typeof accountsForMembers>>);
  const connected = views.filter((v) => v.connected && v.accounts.some((a) => a.holdings.length > 0));
  if (connected.length === 0) return "  (none linked yet — Cam & Graham can connect a brokerage on /accounts)";
  const blocks: string[] = [];
  for (const v of connected) {
    const who = personByEmail(v.email)?.name ?? v.email;
    // Aggregate a member's duplicate tickers across their accounts into one line each.
    const bySym = new Map<string, { qty: number; valCents: number }>();
    for (const a of v.accounts) {
      for (const h of a.holdings) {
        const k = bareKey(h.symbol);
        const prev = bySym.get(k) ?? { qty: 0, valCents: 0 };
        prev.qty += Number(h.qty) || 0;
        prev.valCents += h.marketValueCents;
        bySym.set(k, prev);
      }
    }
    const total = [...bySym.values()].reduce((s, x) => s + x.valCents, 0);
    const items = [...bySym.entries()]
      .sort((a, b) => b[1].valCents - a[1].valCents)
      .map(([sym, x]) => {
        const pct = total > 0 ? Math.round((x.valCents / total) * 100) : 0;
        const overlap = fundBareHeld.has(sym) ? "  ⚠ FUND ALSO HOLDS — combined household exposure" : "";
        return `    ${sym}: ${money(x.valCents)} (${pct}% of their book)${overlap}`;
      });
    blocks.push(`  ${who} — ${money(total)} across ${bySym.size} name(s):\n${items.join("\n")}`);
  }
  return blocks.join("\n");
}

/** The stable context block prepended to every decision-capable session.
 *  Keep the ordering stable — it prompt-caches. */
export async function buildContext(): Promise<string> {
  const MBL_ON = process.env.MARKET_BASE_RETRIEVAL !== "off"; // Slice-3 retrieval (docs/MARKET-BASE-LAYER.md); set "off" to disable
  const [pf, settings, lessons, retros, focus, openTheses, directives, slWindows, scoreboard, macro, macroEvents, upcoming, news, wakeups, agenda, marketFinds] =
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
      recentMacroEvents().catch(() => []),
      upcomingEvents().catch(() => []),
      recentNewsDigest().catch(() => []),
      prisma.agentWakeup.findMany({ where: { status: "PENDING" }, orderBy: { dueAt: "asc" } }),
      prisma.agentAgendaItem.findMany({ where: { status: "OPEN" }, orderBy: { createdAt: "asc" } }),
      MBL_ON ? screenFinds(6).catch(() => []) : Promise.resolve([]),
    ]);
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const dialName = settings?.riskLevel ?? "BALANCED";
  const dial = DIALS[dialName];
  const p = etParts();
  const dayBps = await dayPnlBps().catch(() => 0);

  // Tier 11 — members' personal accounts (READ-ONLY visibility; see personalAccountsBlock).
  // fundBareHeld lets us flag names the fund AND a member hold (combined household exposure).
  const fundBareHeld = new Set(pf.positions.map((x) => bareKey(x.symbol)));
  const personalBlock = await personalAccountsBlock(fundBareHeld);

  // Current dossier verdict per HOLDING and focus name — the AUTHORITATIVE live call
  // (latest "Dossier —" RESEARCH entry). Surfaced next to each position AND focus note
  // so the agent grounds on real state — and can RANK its own book by conviction for
  // rotation decisions — instead of its own scratch note, which has no update timestamp
  // and can drift stale (e.g. L's note kept claiming a "CPI-error dossier, needs a
  // refresh" long after the clean refresh landed it at Hold/63 — every check-in re-read
  // the stale note and parroted it; D-fix 2026-06-24).
  const bookSyms = [...new Set([...pf.positions.map((x) => x.symbol.toUpperCase()), ...focus.map((f) => f.symbol.toUpperCase())])];
  const dossierRows = bookSyms.length
    ? await prisma.journalEntry.findMany({
        where: { kind: "RESEARCH", title: { startsWith: "Dossier" }, symbol: { in: bookSyms } },
        orderBy: { at: "desc" },
        select: { symbol: true, stance: true, confidence: true, at: true },
      })
    : [];
  const bookDossier = new Map<string, { stance: string | null; confidence: number | null; at: Date }>();
  for (const d of dossierRows) {
    if (d.symbol && !bookDossier.has(d.symbol)) bookDossier.set(d.symbol, { stance: d.stance, confidence: d.confidence, at: d.at });
  }
  // Tier 3 — cached options positioning for the book's US names (lib/options; a signal, never traded).
  const optRows = bookSyms.length ? (await Promise.all(bookSyms.map((s) => getOptions(s)))).filter((x): x is NonNullable<typeof x> => !!x) : [];
  // Tier 8 — cached social buzz for the book's names (lib/social; a crowding/risk signal, on probation).
  const socRows = bookSyms.length ? (await Promise.all(bookSyms.map((s) => getSocial(s)))).filter((x): x is NonNullable<typeof x> => !!x) : [];
  const callOf = (sym: string): string => {
    const d = bookDossier.get(sym.toUpperCase());
    return d
      ? ` — GRQ's call ${d.stance ?? "?"}${d.confidence != null ? `/${d.confidence}%` : ""} (dossier ${d.at.toISOString().slice(0, 10)})`
      : " — (no current dossier)";
  };

  const positions =
    pf.positions.length === 0
      ? "  (all cash)"
      : pf.positions
          .map((x) => {
            const wt = pf.navCents > 0 ? ((x.marketValueCadCents / pf.navCents) * 100).toFixed(1) : "0.0";
            return `  ${x.symbol}: ${x.qty} sh @ avg ${money(x.avgCostCents)}, last ${money(x.lastCents)} (${(x.dayChangeBps / 100).toFixed(2)}% today), mkt val ${money(x.marketValueCadCents)} = ${wt}% of NAV, unrealized ${money(x.unrealizedPnlCents)}${callOf(x.symbol)}`;
          })
          .join("\n");

  const benchLine =
    pf.benchmarkCents !== null
      ? `vs-XIC benchmark (the MARKET reference, NOT the bar for success): same contributions in XIC would be ${money(pf.benchmarkCents)} (we are ${money(pf.navCents - pf.benchmarkCents)} ${pf.navCents >= pf.benchmarkCents ? "ahead" : "behind"})`
      : "vs-XIC benchmark: unavailable";

  // The REAL hurdle (Cam 2026-06-25): clear the fund's own running costs before any "return" is
  // genuine. Computed live so the % shrinks as capital grows.
  const costCadCentsYr = OPERATING_COST_USD_CENTS_PER_MONTH * 12 * (pf.fxUsdCad || 1.37);
  const hurdlePct = pf.navCents > 0 ? (costCadCentsYr / pf.navCents) * 100 : 0;
  const hurdleLine = `Operating-cost hurdle (THE REAL BAR): ~US$490/mo (Claude Max + FMP) ≈ ${money(Math.round(costCadCentsYr))}/yr in CAD. The fund only makes GENUINE money once monthly P&L clears its own costs — beating XIC while under this hurdle is NOT a win. At current NAV that's ~${hurdlePct.toFixed(1)}%/yr to break even on costs alone; it eases as capital grows, so the path is more capital + compounding, never oversized risk to chase it (the gate + 75% bar still bind).`;

  // Cash is multi-currency (D34): the fund holds CAD and USD separately. NEVER
  // describe the total as "CAD idle" — the US$ leg funds US-listed buys directly
  // (no FX needed) and converting between currencies requires a member-approved
  // request_fx (D62). Spell the split out so the agent reasons per-currency.
  // Cash floor/ceiling are enforced PER CURRENCY-ACCOUNT (Cam 2026-06-25): each of CAD and USD
  // is its own account, its cash measured against THAT account's NAV (its cash + its positions,
  // native units) — never summed. Surface each leg's cash %, the floor/ceiling, and a ⚠ flag so
  // the agent deploys the idle leg (preference a real stock; index-ETF ballast only with no
  // conviction; FX is a member-approved request_fx — a ROUTINE funding step, EITHER direction.
  // CAD & US listings are EQUAL: currency never tips the call (Cam 2026-06-29)).
  const cadPosCents = pf.positions.filter((x) => x.currency === "CAD").reduce((s, x) => s + x.marketValueCadCents, 0);
  const usdPosCents = pf.positions.filter((x) => x.currency === "USD").reduce((s, x) => s + x.marketValueCents, 0); // native USD
  const cadAcctNav = pf.cadCashCents + cadPosCents;
  const usdAcctNav = pf.usdCashCents + usdPosCents;
  const cadCashPct = cadAcctNav > 0 ? (pf.cadCashCents / cadAcctNav) * 100 : 0;
  const usdCashPct = usdAcctNav > 0 ? (pf.usdCashCents / usdAcctNav) * 100 : 0;
  const cashFlag = (pct: number, acctNonEmpty: boolean): string =>
    acctNonEmpty && pct > dial.cashCeilingPct
      ? ` ⚠ OVER the ${dial.cashCeilingPct}% ceiling — DEPLOY this leg (a real name, or index-ETF ballast only if no conviction)`
      : pct < dial.cashFloorPct
        ? ` (below the ${dial.cashFloorPct}% floor)`
        : ` (within the ${dial.cashFloorPct}–${dial.cashCeilingPct}% band)`;
  const fxNote = pf.fxUsdCad ? ` @ ${pf.fxUsdCad.toFixed(4)} USD→CAD` : "";
  const cashLine =
    pf.usdCashCents > 0
      ? `Cash by currency — floor ${dial.cashFloorPct}% / ceiling ${dial.cashCeilingPct}% apply PER currency-account (its cash ÷ its own sleeve), NOT summed${fxNote}:
  CA$ ${(pf.cadCashCents / 100).toFixed(2)} = ${cadCashPct.toFixed(1)}% of the CAD sleeve (CA$${(cadAcctNav / 100).toFixed(0)})${cashFlag(cadCashPct, cadAcctNav > 0)}
  US$ ${(pf.usdCashCents / 100).toFixed(2)} = ${usdCashPct.toFixed(1)}% of the USD sleeve (US$${(usdAcctNav / 100).toFixed(0)})${cashFlag(usdCashPct, usdAcctNav > 0)}
  CANADIAN AND US LISTINGS ARE EQUAL — the listing currency is NOT a selection factor and a thin sleeve is NOT a strike against a name (Cam 2026-06-29). Pick the best idea on its merits, wherever it trades. Moving money between the CAD and USD sleeves is a NORMAL, routine funding step — NOT a fallback or a last resort. So whenever a name CLEARS the gate (≥Buy/75) and the sleeve it trades in can't cover the position you'd open, SIZE a conversion to that intended position (the currency you need + a small fee/slippage buffer) and request_fx to fund it AS A MATTER OF COURSE — USD_TO_CAD to fund a Canadian name, CAD_TO_USD to fund a US name. e.g. you want to open ~CA$3,000 of a Canadian name but hold only dust in CAD → request_fx USD_TO_CAD for ~CA$3,100, then buy once it lands. A member approves each conversion (that's the only gate on it; it isn't for trivial/dust amounts) — so never downweight, defer, or skip a ≥75 idea because of its currency or because its sleeve is thin. If nothing clears the bar in either currency, that's fine — stand down; just don't let currency itself tip the call. PROACTIVE, MEMBER-DIRECTED TOP-UP: if a MEMBER has explicitly DIRECTED you to build or top up a sleeve (e.g. an AGENDA item asking for a CAD sleeve), raise that request_fx NOW — you do NOT need a gate-clearing name first. The member's instruction is the trigger and their approval of the conversion is the authorization; pre-positioning the sleeve so the next Canadian buy has no FX-approval delay is EXACTLY what they asked for. Do not defer or queue a member-directed top-up "until a name clears" — that's the very lag they're trying to remove. Size it sensibly per their instruction and raise it.`
      : `Cash: ${money(pf.cashCents)}, all CAD = ${cadCashPct.toFixed(1)}% of the CAD sleeve, floor ${dial.cashFloorPct}% / ceiling ${dial.cashCeilingPct}%${cashFlag(cadCashPct, cadAcctNav > 0)}.`;

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

  // Focus line reuses the shared book-dossier map computed above (callOf) so a focus
  // name and a held name read the same authoritative "GRQ's call".
  const focusLine = (w: { symbol: string; note: string | null }): string =>
    `  ${w.symbol}${callOf(w.symbol)}${w.note ? ` · your note: ${w.note}` : ""}`;

  return `# GRQ FUND STATE (generated ${p.dateStr} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")} ET)

Market: ${isMarketOpen() ? `OPEN (closes in ${minutesToClose()} min)` : "CLOSED"} — TSX session 9:30–16:00 ET.
Kill switch: ${pf.killSwitch ? "ENGAGED — no order will fill" : "off"}.

## Account
NAV ${money(pf.navCents)} = cash ${money(pf.cashCents)} (valued in CAD) + positions ${money(pf.positionsCents)}
${cashLine}
Contributions ${money(pf.contributionsCents)} · Total P&L ${money(pf.totalPnlCents)} · Day P&L ${(dayBps / 100).toFixed(2)}%
${benchLine}
${hurdleLine}
Fee budget: ${money(pf.feeSpentMonthCents)} spent of ${money(pf.feeBudgetCentsMonth)} this month.

## Positions (each line shows its weight as % of NAV + GRQ's current dossier call — use these to rank your own book by conviction and spot the weakest holding to rotate out of)
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

## Tier 11 — Cam & Graham's personal accounts (READ-ONLY: you can SEE these but CANNOT trade them — no order ever touches a personal account; their money, their calls)
Weigh this for CROSS-ACCOUNT CONCENTRATION: a name flagged "FUND ALSO HOLDS" means the household's combined exposure is larger than the fund's book alone shows — lean toward diversifying total risk rather than doubling down, and you may note the overlap in a dossier. It can also be a lead (a name a member backed with their own money is worth a look). An INPUT you weigh, NEVER a gate; never assume you should mirror or hedge their picks.
${personalBlock}

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
${
  macroEvents.length === 0
    ? "  Recent moves: (none notable in the last ~10 days)"
    : "  Recent moves:\n" + macroEvents.map((e) => `    [${e.at.toISOString().slice(0, 10)}] ${e.headline}`).join("\n")
}
${
  upcoming.length === 0
    ? "  Upcoming catalysts: (none scheduled)"
    : "  Upcoming catalysts (size & time around these):\n" + upcoming.map((e) => `    [${e.at.toISOString().slice(0, 10)}] ${e.headline}`).join("\n")
}

## What moved (recent triaged news — market + your names; an INPUT you weigh, NEVER the gate; WebSearch any item to go deeper)
${
  news.length === 0
    ? "  (no material news triaged in the last ~36h)"
    : news
        .map(
          (n) =>
            `  [${n.publishedAt.toISOString().slice(0, 10)}] ${n.symbol ? `${n.symbol} · ` : ""}${n.sentiment ?? "NEU"}·rel${n.relevance ?? 0} — ${n.summary || n.title}`,
        )
        .join("\n")
}

## Market screen — fresh finds (INTERESTING & not yet tracked — leads from our deterministic + Haiku scan of the whole market; an INPUT to widen the funnel, NEVER the gate; research before acting)
${marketFinds.length === 0 ? "  (none surfaced — or retrieval disabled)" : marketFinds.map(findLine).join("\n")}

## Options positioning (held/focus US names — dealer gamma · put/call · IV-skew; a SIGNAL about the underlying, you NEVER trade options)
${
  optRows.length === 0
    ? "  (no listed-options coverage on the book — CA/illiquid names)"
    : optRows.map((o) => `  ${o.symbol}: ${optionsLine(o)}`).join("\n")
}

## Social buzz (held/focus names — Reddit mentions/velocity + Stocktwits mood; a CROWDING/RISK signal, ON PROBATION — noisy & gameable, weigh it lightly, never the gate)
${
  socRows.length === 0
    ? "  (no retail chatter on the book — quiet, which for holdings means no crowd to unwind)"
    : socRows.map((s) => `  ${s.symbol}: ${socialLine(s)}`).join("\n")
}

## Policy — ${dialName} dial (you cannot change any of this)
Max position ${dial.maxPositionPct}% NAV · cash floor ${dial.cashFloorPct}% / ceiling ${dial.cashCeilingPct}% (PER currency-account) · stop distance ${dial.stopPct}% below ACB (enforced deterministically) · max ${dial.maxNewTradesPerWeek} new buys/week · tiers ${dial.tiers.join("+")}
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
