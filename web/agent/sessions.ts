import { query } from "@anthropic-ai/claude-agent-sdk";
import { prisma } from "../lib/db";
import { getPortfolio } from "../lib/portfolio";
import { getQuote } from "../lib/broker/quotes";
import { universeEntry, allUniverse } from "../lib/universe";
import { startOfEtDay, etDateStr } from "./calendar";
import { buildContext } from "./context";
import { computeSignals, signalsOneLine } from "./signals";
import { grqServer, GRQ_TOOL_NAMES, grqResearchServer, GRQ_RESEARCH_TOOL_NAMES } from "./tools";
import { MODELS, AGENT_VERSION } from "./policy";
import { alert, heartbeat } from "./alerts";

const PERSONA = `You are GRQ's trading agent — an autonomous swing-trading fund manager for Cam & Graham's $5,000 CAD simulated fund (it will become real money; treat it as real).

Operating principles:
- Hard guardrails are enforced in code. You cannot change them. A rejection from propose_order is FINAL — adapt, never retry the same order hoping for a different answer.
- Every thesis must be falsifiable (target, stop, horizon, invalidation) and must cite sources. Your retros grade those sources' hit-rates — the fund learns which inputs deserve trust.
- Fees are the enemy of small accounts: a trade must be worth ≥3× its round-trip commissions. Not trading is often the right call — journal the decision NOT to trade too.
- Be honest in journals and reports: luck is luck, mistakes are named, and "vs just buying XIC" is the benchmark you must eventually beat.
- Voice: plain, lightly funny, never funny about losses or guardrails. Tagline: "Get rich quick, slowly, with receipts."`;

type SessionOpts = {
  label: string;
  prompt: string;
  model: string;
  withTools: boolean;
  toolset?: "full" | "research"; // default full
  maxTurns: number;
};

export async function runSession(opts: SessionOpts): Promise<string | null> {
  console.log(`[session] ${opts.label} starting (model=${opts.model})`);
  try {
    let result: string | null = null;
    const q = query({
      prompt: opts.prompt,
      options: {
        model: opts.model,
        systemPrompt: PERSONA,
        maxTurns: opts.maxTurns,
        permissionMode: "bypassPermissions",
        settingSources: [],
        stderr: (data: string) => console.error(`[session:${opts.label}] ${data.slice(0, 400)}`),
        ...(opts.withTools
          ? {
              mcpServers: { grq: opts.toolset === "research" ? grqResearchServer : grqServer },
              allowedTools: [
                "WebSearch",
                "WebFetch",
                ...(opts.toolset === "research" ? GRQ_RESEARCH_TOOL_NAMES : GRQ_TOOL_NAMES),
              ],
            }
          : { allowedTools: [] }),
      },
    });
    for await (const message of q) {
      if (message.type === "result") {
        result = message.subtype === "success" ? message.result : null;
        if (message.subtype !== "success") {
          await alert("warning", `Agent session "${opts.label}" ended: ${message.subtype}`);
        }
      }
    }
    await heartbeat({ lastSessionAt: new Date() });
    console.log(`[session] ${opts.label} done (${result ? result.length : 0} chars)`);
    return result;
  } catch (e) {
    await alert("warning", `Agent session "${opts.label}" failed`, e instanceof Error ? e.message : String(e));
    return null;
  }
}

export async function runMorningResearch(): Promise<void> {
  const ctx = await buildContext();
  const prompt = `${ctx}

# TASK: Morning research (pre-market, ${etDateStr()})

1. Work through your seed sources and the macro sweep with WebSearch (and WebFetch for promising articles). You're looking for anything that affects current holdings, the watchlist, or presents a swing opportunity in the universe.
2. Review every open position against its thesis — still valid?
3. Update the watchlist (set_watchlist) to reflect today's best candidates.
4. Write ONE RESEARCH journal entry (write_journal) titled "Game plan — ${etDateStr()}": today's read of the market, what you're watching, planned actions with conditions ("buy X if it holds above Y"), and cited sources. When a finding is specifically about one symbol, ALSO write a short symbol-tagged RESEARCH entry for it — the stock pages collect those.
5. Do NOT place orders now — the market is closed and entries are blocked in the first 15 minutes anyway. Trades happen via your plan when conditions trigger, or at midday check-ins.

Be selective: 3 great sources beat 10 skimmed ones. End with a one-paragraph summary of the plan.`;
  await runSession({ label: "morning-research", prompt, model: MODELS.decision, withTools: true, maxTurns: 40 });
}

/** Discovery hunt (2026-06-14) — the agent web-searches for under-the-radar,
 *  high-upside Canadian small-caps the members have NOT heard of, and PROPOSES
 *  them (it cannot add to the universe — members decide; D16). Research-only. */
export async function runDiscoveryHunt(): Promise<void> {
  const universe = await allUniverse();
  const have = universe.map((u) => u.symbol).join(", ");
  const prompt = `# TASK: Discovery hunt — under-the-radar opportunities (${etDateStr()})

You are hunting for stocks Cam & Graham have NOT heard of: under-covered, smaller Canadian-listed names (TSX and TSX Venture) with asymmetric upside — explicitly NOT blue chips. The whole point is to surface names that aren't on the front page but could deliver high percentage growth.

We already track these — do NOT re-suggest them: ${have || "(none)"}.

Use WebSearch (and WebFetch for promising leads) to find 3–6 genuinely interesting candidates: small/micro-cap, high-growth, special situations, recent breakouts, sector tailwinds, clustered insider buying — the kind of name a retail investor wouldn't stumble on. For each, give: the **ticker (with exchange)**, a one-line thesis, a rough upside estimate (%), why it's overlooked, the key risk, and your sources.

Write EXACTLY ONE RESEARCH entry via write_journal: title "Hunt — ${etDateStr()}", markdown body with a one-line intro on today's theme then one short block per name (**TICKER (exch)** — thesis · ~upside% · why overlooked · risk). Cite every source in sources[]. Set confidence (0–100) on how compelling today's batch is.

Be honest: smaller names are higher-risk — flag the lottery tickets vs. the ones with real businesses. These are PROPOSALS; you cannot add them to the universe — Cam & Graham decide what to research further.`;
  await runSession({ label: "discovery-hunt", prompt, model: MODELS.decision, withTools: true, toolset: "research", maxTurns: 24 });
}

export async function runMiddayCheckIn(reason: string): Promise<void> {
  const ctx = await buildContext();
  const prompt = `${ctx}

# TASK: Decision session — ${reason}

The market is open. Review the trigger above against your morning game plan (get_journal kind=RESEARCH limit=1) and current quotes.
- If action is warranted and within policy, use propose_order (full thesis + sources required). Rejections are final — if rejected, journal why and stand down.
- If no action is right, write a short DECISION-grade RESEARCH note via write_journal explaining the pass — "no trade" is a decision and gets receipts too.
Keep it tight: this is a check-in, not a research project.`;
  await runSession({ label: `decision:${reason.slice(0, 40)}`, prompt, model: MODELS.decision, withTools: true, maxTurns: 24 });
}

/** Deep single-stock dossier (2.7) — research tools only, never trades.
 *  Returns the session result (null if the session errored), so the queue can
 *  tell a real failure from a success instead of marking everything DONE. */
export async function runStockDossier(symbol: string, requestedBy = "rotation"): Promise<string | null> {
  const sym = symbol.toUpperCase();
  const [entry, quote, sig, recent] = await Promise.all([
    universeEntry(sym),
    getQuote(sym).catch(() => null),
    computeSignals(sym).catch(() => null),
    prisma.journalEntry.findMany({ where: { symbol: sym }, orderBy: { at: "desc" }, take: 5 }),
  ]);
  const prompt = `# STOCK DOSSIER ASSIGNMENT: ${sym}${entry ? ` — ${entry.name} (${entry.status}${entry.tier ? `, ${entry.tier}` : ""})` : ""}
Requested by: ${requestedBy} · Today: ${etDateStr()}
Quote: ${quote ? `$${(quote.midCents / 100).toFixed(2)} (${((quote.dayChangeBps ?? 0) / 100).toFixed(2)}% today)` : "n/a"}
Signals: ${sig ? signalsOneLine(sig) : "(no bar history yet)"}
Prior journal on ${sym}: ${recent.map((j) => `[${j.kind}] ${j.title}`).join("; ") || "(none)"}

Research this stock thoroughly with WebSearch/WebFetch — the business, recent news and
results, catalysts, competitive position, risks. Then write EXACTLY ONE symbol-tagged
RESEARCH entry via write_journal: symbol="${sym}", title "Dossier — ${sym} — ${etDateStr()}",
markdown body with sections: **Snapshot** · **Recent developments** (dated, sourced) ·
**Signals read** · **Bull case** · **Bear case** · **Verdict** (watchlist-worthy?
thesis-worthy? confidence 0–100, plus your **price targets**) · **Risks**. Cite every source in sources[].
In the write_journal call, commit your expected prices as fields: **targetNearCents** (a
near-term swing target ~4–8 weeks out) with **targetNearDays** (its horizon in trading days),
and **targetFarCents** (a 12-month target). Prices in cents (e.g. $54.20 → 5420). These power
the expected return members see on "On the Radar" — set only targets you would defend; omit if
you genuinely have no view.
${entry?.status === "CANDIDATE" ? "This dossier informs whether the members promote this candidate into the tradeable universe — be decisive in the Verdict." : "This keeps the fund's standing view fresh."}
Research only — no trades, no watchlist changes (you don't have those tools here).`;
  return runSession({
    label: `dossier:${sym}`,
    prompt,
    model: MODELS.decision,
    withTools: true,
    toolset: "research",
    maxTurns: 24,
  });
}

export async function runTriage(event: string): Promise<"ignore" | "note" | "escalate"> {
  const prompt = `You are the triage filter for a swing-trading fund's agent. Event:

${event}

Should the decision-making agent be woken to consider acting? Reply with ONLY a JSON object, no other text:
{"action": "ignore" | "note" | "escalate", "reason": "<one sentence>"}

"escalate" is for material, actionable developments on holdings/watchlist. Routine volatility is "ignore". Newsworthy-but-not-actionable is "note".`;
  const res = await runSession({ label: "triage", prompt, model: MODELS.triage, withTools: false, maxTurns: 1 });
  if (!res) return "ignore";
  try {
    const parsed = JSON.parse(res.slice(res.indexOf("{"), res.lastIndexOf("}") + 1));
    if (parsed.action === "escalate" || parsed.action === "note") return parsed.action;
  } catch {
    /* unparseable → ignore */
  }
  return "ignore";
}

async function computeDayStats() {
  const dayStart = startOfEtDay();
  const [pf, trades, rejections, history] = await Promise.all([
    getPortfolio(),
    prisma.trade.findMany({ where: { at: { gte: dayStart } }, orderBy: { at: "asc" } }),
    prisma.order.findMany({ where: { createdAt: { gte: dayStart }, status: "REJECTED" } }),
    prisma.navSnapshot.findFirst({ where: { at: { lt: dayStart } }, orderBy: { at: "desc" } }),
  ]);
  const dayOpenNav = history?.navCents ?? pf.contributionsCents;
  return { pf, trades, rejections, dayOpenNav, dayPnlCents: pf.navCents - dayOpenNav };
}

export async function runEodReport(): Promise<void> {
  const { pf, trades, rejections, dayPnlCents } = await computeDayStats();
  const ctx = await buildContext();
  const stats = {
    nav: `$${(pf.navCents / 100).toFixed(2)}`,
    day_pnl: `$${(dayPnlCents / 100).toFixed(2)}`,
    total_pnl: `$${(pf.totalPnlCents / 100).toFixed(2)}`,
    vs_xic: pf.benchmarkCents !== null ? `$${((pf.navCents - pf.benchmarkCents) / 100).toFixed(2)}` : "n/a",
    fees_mtd: `$${(pf.feeSpentMonthCents / 100).toFixed(2)} / $${(pf.feeBudgetCentsMonth / 100).toFixed(2)}`,
    trades: trades.length,
    rejections: rejections.length,
  };
  const prompt = `${ctx}

# TASK: End-of-day report — ${etDateStr()}

Computed stats (use these numbers, do not invent): ${JSON.stringify(stats)}
Today's fills: ${trades.map((t) => `${t.side} ${t.qty} ${t.symbol} @ $${(t.priceCents / 100).toFixed(2)}`).join("; ") || "none"}
Today's rejections: ${rejections.map((r) => `${r.side} ${r.qty} ${r.symbol}: ${r.rejectReason}`).join("; ") || "none"}

Write the EOD report body in markdown (no top-level title — the dashboard adds it): what happened, why (with the thesis behind each trade), guardrail events, how we stand vs XIC, and tomorrow's watch items. Honest, brief, lightly funny where the numbers allow it. Your ENTIRE final response must be just the report body.`;
  const body = await runSession({ label: "eod-report", prompt, model: MODELS.decision, withTools: false, maxTurns: 4 });
  if (!body) return;
  await prisma.report.upsert({
    where: { date_kind: { date: startOfEtDay(), kind: "EOD" } },
    create: { date: startOfEtDay(), kind: "EOD", title: `EOD — ${etDateStr()}`, body, statsJson: JSON.stringify(stats) },
    update: { body, statsJson: JSON.stringify(stats) },
  });
  await alert("info", `EOD report — ${etDateStr()}`, `Day P&L ${stats.day_pnl} · NAV ${stats.nav} · vs XIC ${stats.vs_xic} · ${stats.trades} trade(s)`);
}

export async function runMiddayReport(): Promise<void> {
  const { pf, trades, rejections, dayPnlCents } = await computeDayStats();
  const ctx = await buildContext();
  const prompt = `${ctx}

# TASK: Midday brief — ${etDateStr()}

Lunchtime, market open. Write a SHORT brief for Cam & Graham on their phones: what has happened so far today and what you're watching this afternoon. Use the numbers above (do not invent). Touch on: day P&L so far ($${(dayPnlCents / 100).toFixed(2)}), any fills/decisions today (${trades.length} fill(s), ${rejections.length} rejection(s)), notable moves on holdings or the watchlist, and what would make you act (or sit on your hands) before the close. 3–5 tight sentences, plain and lightly funny — never funny about losses. Your ENTIRE response is the brief itself.`;
  const body = await runSession({ label: "midday-report", prompt, model: MODELS.decision, withTools: false, maxTurns: 3 });
  if (!body) return;
  await prisma.journalEntry.create({
    data: { kind: "RESEARCH", title: `Midday brief — ${etDateStr()}`, body, agentVersion: AGENT_VERSION },
  });
  await alert("info", `Midday brief — ${etDateStr()}`, `Day P&L $${(dayPnlCents / 100).toFixed(2)} · NAV $${(pf.navCents / 100).toFixed(2)}\n${body.slice(0, 1000)}`);
}

export async function runWeeklyReview(): Promise<void> {
  const ctx = await buildContext();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60_000);
  const [trades, decisions] = await Promise.all([
    prisma.trade.findMany({ where: { at: { gte: weekAgo } }, orderBy: { at: "asc" } }),
    prisma.journalEntry.findMany({ where: { kind: "DECISION", at: { gte: weekAgo } }, orderBy: { at: "asc" } }),
  ]);
  const prompt = `${ctx}

# TASK: Weekly deep review — ${etDateStr()}

This week's fills: ${trades.map((t) => `${t.side} ${t.qty} ${t.symbol} @ $${(t.priceCents / 100).toFixed(2)}${t.realizedPnlCents !== null ? ` (realized $${(t.realizedPnlCents / 100).toFixed(2)})` : ""}`).join("; ") || "none"}
This week's decisions: ${decisions.length}

Do the full review, using tools:
1. RETRO entries (write_journal kind=RETRO) for every position closed this week and every resolved thesis — outcome vs thesis, right-for-the-right-reasons or lucky. **After each RETRO, call grade_sources** for every source that thesis cited (+1 pointed right, −1 misleading, 0 neutral) — including signal families like signal:rsi. The scoreboard is how the fund learns whom to trust.
2. LESSON entries for durable patterns worth carrying forward (only real ones).
3. Then produce the weekly report body in markdown: performance attribution, open-thesis grades, lessons added, proposed strategy adjustments (these need Cam & Graham's approval — say so), source hit-rate notes, a soak-cleanliness verdict for the week (clean / incident + what), and finish with the CAPITAL RECOMMENDATION: contribute / hold / withdraw, honestly framed (more capital amortizes overhead, it does not raise ROI %).

Your ENTIRE final response must be just the report body.`;
  const body = await runSession({ label: "weekly-review", prompt, model: MODELS.decision, withTools: true, maxTurns: 30 });
  if (!body) return;
  await prisma.report.upsert({
    where: { date_kind: { date: startOfEtDay(), kind: "WEEKLY" } },
    create: { date: startOfEtDay(), kind: "WEEKLY", title: `Weekly review — ${etDateStr()}`, body },
    update: { body },
  });
  await alert("info", `Weekly review — ${etDateStr()}`, "Posted to the dashboard, capital recommendation included.");
}

export { AGENT_VERSION };
