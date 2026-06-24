import { query } from "@anthropic-ai/claude-agent-sdk";
import { prisma } from "../lib/db";
import { getPortfolio } from "../lib/portfolio";
import { getQuote } from "../lib/broker/quotes";
import { universeEntry, allUniverse, isTradeable } from "../lib/universe";
import { setBootstrapMode } from "./promote";
import { queueDossiers } from "../lib/hunt";
import { startOfEtDay, etDateStr } from "./calendar";
import { buildContext } from "./context";
import { computeSignals, signalsOneLine } from "./signals";
import { grqServer, GRQ_TOOL_NAMES, grqResearchServer, GRQ_RESEARCH_TOOL_NAMES } from "./tools";
import { MODELS, AGENT_VERSION, taxContext, SELF_INVEST } from "./policy";
import { alert, heartbeat } from "./alerts";
import { getPortfolios, getCongressLeaderboard, getFundsPilingIn, getInsiderTopBuys, getSmartMoneyForSymbol, smartMoneySummaryLine } from "../lib/smart-money/queries";
import { fmtUsd } from "../lib/smart-money/types";

const PERSONA = `You are GRQ's trading agent — an autonomous swing-trading fund manager for Cam & Graham's $25,000 CAD fund (it will become real money; treat it as real).

Your job is to PUT THE FUND TO WORK. You are an active manager, not a cash custodian — the members hired a stock-picker. A portfolio that sits in cash because nothing on a short watchlist triggered is failing at the job. Over a month, chronic under-deployment is a BIGGER risk than any single wrong pick.

Disposition:
- The scorecard is MONTH-OVER-MONTH, not daily. Day-to-day P&L is noise. You're measured on whether the fund compounds over months — and you can neither compound nor LEARN without taking real positions. A trade that goes wrong is tuition; refusing to trade teaches the fund nothing.
- When your watched names don't clear the bar, the answer is to WIDEN THE SEARCH, not default to cash. Go research more names — across the whole market, not just your current focus list — until you find ones you'd genuinely back, then track/promote and trade them. There is almost always a high-conviction setup somewhere. Cash is the right call only after a genuinely wide look comes up empty, or the whole tape is clearly risk-off — not after glancing at five names.
- The conviction bar is real and you keep it HONEST — never inflate a number to clear a gate. But "I can't get to high conviction on these few names" means "find better names," never "hold cash and wait."
- Research is ALWAYS available — you never need permission or a special session for it. Any time a name is worth a look (or you need more conviction on one), research it and write a dossier (write_journal), and add_candidate it to your watchlist — that both tracks it AND queues a FULL dossier the runner completes in the background. Do this anytime, in any session. If you'd act on a name but its dossier isn't ready yet, do NOT drop it and do NOT rush a thesis to beat a clock: add_candidate it now and schedule_checkin a time to come back once the research has landed, then decide with the finished dossier in front of you. A parked idea with a scheduled follow-up beats a forgotten idea or a forced thesis.

Operating principles:
- Hard guardrails are enforced in code. You cannot change them. A rejection from propose_order is FINAL — adapt, never retry the same order hoping for a different answer.
- US names are first-class — treat a US-listed name exactly like a Canadian one when picking. BUT the fund holds CAD and USD as SEPARATE cash (mirroring the broker), and a USD buy must be covered by USD cash — there is no auto-FX and no margin. If a US buy is rejected for "Insufficient USD", use request_fx to ask a member to convert CAD→USD (any amount you'd genuinely deploy — the member is the gate). You cannot convert currency yourself; money moves only when a member approves. Until then, set_focus the name and move on — don't drop a good idea just because the USD isn't funded yet.
- Every thesis must be falsifiable (target, stop, horizon, invalidation) and must cite sources. Your retros grade those sources' hit-rates — the fund learns which inputs deserve trust.
- Diversify the THESIS, not just the tickers. Count independent thesis axes (e.g. rates / secular compounders / idiosyncratic catalysts / index ballast / commodity), not symbols — three names riding one rate bet is ONE bet, not three positions. Whenever the book holds more than a couple of names, keep at least 2–3 independent axes live, and name the concentration out loud the moment it drifts toward a single factor. (Approved standing rule, 2026-06-21 weekly review §4.)
- Fees and taxes are real drags on a small account: a trade must clear ≥3× its round-trip commissions, and when you realize a gain, name the tax consequence. Taxes (Canadian, CRA): ${taxContext()} This is a reason to pick well and let winners run — NOT a reason to never trade.
- "vs just buying XIC" is the benchmark you must beat — and you beat it by deploying into better ideas, not by hiding in cash to stay nominally "ahead" of the index. Being ahead of XIC while sitting in cash is not a win; it's an un-deployed fund.
- Be honest in journals and reports: luck is luck, mistakes are named.
- Literacy: when you write for Cam & Graham, wrap finance/investing jargon a non-expert might not know in [[double brackets]] — e.g. [[shell company]], [[free cash flow]], [[short interest]], [[dilution]]. The app turns those into tap-to-explain links. Sparingly — only genuinely non-obvious terms, and don't bracket the same term twice in one piece.
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
    let resultMsg: any = null;
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
        resultMsg = message;
        result = message.subtype === "success" ? message.result : null;
        if (message.subtype !== "success") {
          await alert("warning", `Agent session "${opts.label}" ended: ${message.subtype}`, "", { category: "system" });
        }
      }
    }
    await heartbeat({ lastSessionAt: new Date() });
    await recordUsage(opts, resultMsg, result);
    return result;
  } catch (e) {
    await alert("warning", `Agent session "${opts.label}" failed`, e instanceof Error ? e.message : String(e), { category: "system" });
    return null;
  }
}

// Persist per-session token/cost from the Agent-SDK result message (AgentUsage row), and log a
// rich one-liner to stdout. Tokens are SUMMED across modelUsage so subagent fan-out + any triage
// model the session spawned are all counted (a startup scan fans out to ~12 subagents — the
// single biggest token sink); falls back to the aggregate `usage` shape. Cost may be 0 on a
// Max/OAuth token that doesn't meter cost, so token counts are the real signal. Never throws
// into the session — logging must not break a trading session.
async function recordUsage(opts: SessionOpts, rm: any, result: string | null): Promise<void> {
  let inT = 0, outT = 0, ccT = 0, crT = 0, cost = 0;
  const mu = rm?.modelUsage && typeof rm.modelUsage === "object" ? rm.modelUsage : null;
  if (mu && Object.keys(mu).length) {
    for (const k of Object.keys(mu)) {
      const e = mu[k] || {};
      inT += e.inputTokens || 0;
      outT += e.outputTokens || 0;
      ccT += e.cacheCreationInputTokens || 0;
      crT += e.cacheReadInputTokens || 0;
      cost += e.costUSD || 0;
    }
  } else if (rm?.usage) {
    const u = rm.usage;
    inT = u.input_tokens || u.inputTokens || 0;
    outT = u.output_tokens || u.outputTokens || 0;
    ccT = u.cache_creation_input_tokens || u.cacheCreationInputTokens || 0;
    crT = u.cache_read_input_tokens || u.cacheReadInputTokens || 0;
  }
  if (!cost && typeof rm?.total_cost_usd === "number") cost = rm.total_cost_usd;
  const turns = rm?.num_turns || 0;
  console.log(
    `[session] ${opts.label} done — ${result ? result.length : 0} chars · ${turns} turns · ` +
      `in ${inT} out ${outT} cacheW ${ccT} cacheR ${crT} (total ${inT + outT + ccT + crT}) · ~$${cost.toFixed(2)}`,
  );
  try {
    await prisma.agentUsage.create({
      data: {
        label: opts.label,
        model: opts.model,
        status: rm?.subtype || (result ? "success" : "unknown"),
        numTurns: turns,
        durationMs: rm?.duration_ms || 0,
        inputTokens: inT,
        outputTokens: outT,
        cacheCreationTokens: ccT,
        cacheReadTokens: crT,
        costMicroUsd: Math.round(cost * 1e6),
        modelUsageJson: mu ? JSON.stringify(mu) : null,
        agentVersion: AGENT_VERSION,
      },
    });
  } catch (e) {
    console.error(`[usage-log] failed for ${opts.label}:`, e instanceof Error ? e.message : e);
  }
}

export async function runMorningResearch(): Promise<void> {
  const ctx = await buildContext();
  const prompt = `${ctx}

# TASK: Morning research (pre-market, ${etDateStr()})

1. Work through your seed sources and the macro sweep with WebSearch (and WebFetch for promising articles). You're looking for anything that affects current holdings, your focus list, or presents a swing opportunity.
2. Review every open position against its thesis — still valid?
3. Build a focus list of GENUINE, actionable setups (set_focus) — names with a live entry trigger you'd act on today. This list is your pipeline; an empty or stale focus list during market hours is a problem to fix now, not a state to accept.
3a. WIDEN IF THIN: if your current ACTIVE universe + watchlist doesn't give you enough high-conviction setups (and most days a handful of stale blue-chips won't), go HUNT. WebSearch the whole market — sectors with momentum, earnings beats, breakouts, the growth names on your watchlist — for stocks you'd genuinely back. Don't re-chew the same five rate-sensitive names and conclude "nothing's actionable"; that's under-deployment, which is the failure mode. Find better names.
3b. SELF-INVEST: when you find a name you'd back, research it (write a symbol-tagged RESEARCH/dossier entry with stance + confidence + sources), add_candidate it if untracked, and once your call is ≥ Buy with confidence ≥75 and it's liquid + CAD/USD-tradeable, promote_to_universe it so you can trade it — one-line reason (members get a Discord and can veto). Rules are enforced; rejections explain themselves. A promoted name still clears the order gate before any buy.
4. Write ONE RESEARCH journal entry (write_journal) titled "Game plan — ${etDateStr()}": today's read of the market, what you're watching, planned actions with conditions ("buy X if it holds above Y"), and cited sources. When a finding is specifically about one symbol, ALSO write a short symbol-tagged RESEARCH entry for it — the stock pages collect those.
5. Do NOT place orders now — the market is closed and entries are blocked in the first 15 minutes anyway. Trades happen via your plan when conditions trigger, or at the midday check-ins.

Be selective on sources (3 great beat 10 skimmed) but NOT timid on ideas: the goal of this session is to walk into the day with real setups to deploy into, not reasons to stay in cash. End with a one-paragraph summary of the plan.`;
  await runSession({ label: "morning-research", prompt, model: MODELS.decision, withTools: true, maxTurns: 40 });
}

/** Startup universe review (D30, Cam 2026-06-17) — the members demote the whole
 *  universe to the watchlist; on the next boot the agent reviews every candidate
 *  and BUILDS its own tradeable universe from the names it would genuinely invest
 *  in, logs the reasoning, then plans/places entries. Runs in the bootstrap window
 *  (per-week self-promote cap lifted; every quality gate still applies). */
export async function runStartupUniverseReview(): Promise<void> {
  const universe = await allUniverse();
  const candidates = universe.filter((u) => u.status === "CANDIDATE");
  if (candidates.length === 0) return;

  const rows = await Promise.all(
    candidates.map(async (c) => {
      const dossier = await prisma.journalEntry.findFirst({ where: { symbol: c.symbol, stance: { not: null } }, orderBy: { at: "desc" } });
      const sig = await computeSignals(c.symbol).catch(() => null);
      const tradeable = isTradeable(c.currency, c.yahoo);
      return `- ${c.symbol} (${c.name})${tradeable ? "" : " [non-CAD/USD — research-only]"}: your call ${dossier?.stance ?? "none yet"}${dossier?.confidence != null ? ` @ ${dossier.confidence}%` : ""}; signals ${sig ? signalsOneLine(sig) : "n/a"}`;
    }),
  );

  const ctx = await buildContext();
  const prompt = `${ctx}

# TASK: Startup universe review (${etDateStr()})

The members RESET the universe — everything is on the WATCHLIST now (candidates, not tradeable). Your job: decide which of these you would genuinely invest in, and BUILD the tradeable universe yourself.

## Watchlist candidates (${candidates.length})
${rows.join("\n")}

For EACH candidate you would actually put real money into RIGHT NOW:
1. Confirm conviction — your latest dossier must rate it ≥ Buy with confidence ≥ ${SELF_INVEST.minConfidence}. If you believe in it but the dossier is stale or weaker, write a fresh symbol-tagged RESEARCH entry (write_journal with stance + confidence + sources) FIRST, then promote.
2. promote_to_universe it. CAD/USD-tradeable + liquid only; rules are enforced and rejections explain themselves. Members get a Discord on each.
Be SELECTIVE — promote only names you'd defend buying today, NOT the whole list. Quality over quantity; the universe caps at ${SELF_INVEST.maxUniverseSize}.

Then:
3. Write ONE RESEARCH journal entry titled "Startup universe review — ${etDateStr()}": which names you promoted and why, which you left on the watchlist and why, and your opening game plan.
4. INVEST: if the market is OPEN, propose_order your best ideas now (full thesis, within the gate). If CLOSED, set_focus on them with the entry trigger you'll act on at the open.`;

  setBootstrapMode(true);
  try {
    await runSession({ label: "startup-universe-review", prompt, model: MODELS.decision, withTools: true, maxTurns: 80 });
  } finally {
    setBootstrapMode(false);
  }
}

/** Discovery hunt (2026-06-14) — the agent web-searches for under-the-radar,
 *  high-upside Canadian small-caps the members have NOT heard of, and PROPOSES
 *  them (it cannot add to the universe — members decide; D16). Research-only. */
export async function runDiscoveryHunt(brief?: string): Promise<void> {
  const universe = await allUniverse();
  const have = universe.map((u) => u.symbol).join(", ");
  const b = brief?.trim();
  const focus = b
    ? `\n## FOCUS — a member briefed this hunt\n«${b}»\n\nTreat this brief as the PRIMARY filter: theme, sector, catalyst, size, and timing all come from it. Everything below still holds (under-the-radar, leads-not-verdicts, North-American-tradeable preferred), but every name you surface must genuinely fit the brief. If it's narrow and you can only find 4–6 real fits, surface those — don't pad with off-brief names.\n`
    : "";
  const prompt = `# TASK: Discovery hunt — under-the-radar opportunities (${etDateStr()})
${focus}
You are hunting for stocks Cam & Graham have NOT heard of: under-covered, smaller names with asymmetric upside — explicitly NOT blue chips. The whole point is to surface names that aren't on the front page but could deliver high percentage growth.

REACH: the fund holds CAD + USD and trades both Canadian listings (TSX · TSX-V · CSE · NEO) and US listings (NYSE · Nasdaq) — so range across North America for the best fits. Prefer names the fund could eventually trade; you may surface up to ~2 listed elsewhere if they're clearly the best match, but flag those plainly as leads-only (not tradeable here).

We already track these — do NOT re-suggest them: ${have || "(none)"}.

Use WebSearch (and WebFetch for promising leads) to find ${b ? "as many genuine fits to the brief as you can (aim for 6–12)" : "8–12 genuinely interesting candidates"}: small/micro-cap, high-growth, special situations, recent breakouts, sector tailwinds, clustered insider buying — the kind of name a retail investor wouldn't stumble on.

For EACH name you choose, write a SEPARATE symbol-tagged dossier via write_journal:
- symbol = the bare ticker (e.g. "PRL")
- exchange = the EXACT exchange it trades on — one of NYSE, NASDAQ, AMEX, TSX, TSXV, CSE, NEO. REQUIRED: a bare ticker is ambiguous (AII is American Integrity Insurance on NYSE but Almonty Industries on TSX; LGN is Legence on NASDAQ but Logan Energy on TSXV) — without the right exchange we'd show a same-ticker DIFFERENT company's price, chart, and logo. This resolves the exact listing; it's confirmed against FMP on save.
- title = "Hunt dossier — TICKER — ${etDateStr()}"
- body = markdown that LEADS with the two things that matter most, in this order:
  **Why we care** — 1–2 sentences a non-expert grasps: the catalyst / asymmetry / why it looks mispriced or is being overlooked *right now*. This is the most important line.
  **Key facts** — 3–4 concrete bullets: market cap, recent revenue/earnings growth, the specific catalyst (a contract, a drill result, an earnings beat, a sector tailwind), and how it's valued vs peers.
  …then a "read more" deeper read: what it does, recent developments (dated, sourced), bull case, bear case, the single biggest risk.
- targetFarCents = your rough 12-month price target in cents, if you have a view
- confidence = your conviction this is worth a look (0–100)
- obscurity = how under-the-radar it is, 1–5 (5 = a deep cut almost nobody covers — no analysts, tiny float; 1 = a widely-followed name). Be honest; the hunt is meant to live at the obscure end.
- sources = every source you used

Lead with WHY it matters, not just what the company is. Be honest: smaller names are higher-risk — flag the lottery tickets vs. the ones with real businesses. You can't add anything to the TRADEABLE universe; each name you surface is automatically queued for a FULL dossier, and Cam & Graham decide which to promote to tradeable.`;
  await runSession({ label: "discovery-hunt", prompt, model: MODELS.decision, withTools: true, toolset: "research", maxTurns: 36 });

  // D (Cam 2026-06-19): the hunt writes only LEADS ("Hunt dossier — TICKER") — all in this
  // one pass. The full dossier is NO LONGER auto-queued for every find; it's kicked ON
  // DEMAND when a member opens the find's stock page (or clicks Research on Browse). That
  // drops ~8–12 redundant Opus research passes per hunt — finds nobody opens cost nothing.
}

/** Smart-money read (D27) — the EDITORIAL narrative on top of the structured
 *  data the runner already ingested (FMP congress/insider/13F + OpenInsider) and
 *  the /market/smart-money page already shows. The model synthesizes, it doesn't
 *  re-fetch. Research-only. */
export async function runSmartMoneyScan(): Promise<void> {
  const [universe, portfolios, congress, funds, insiders] = await Promise.all([
    allUniverse(),
    getPortfolios(),
    getCongressLeaderboard(90, 8),
    getFundsPilingIn(8),
    getInsiderTopBuys(14, 10),
  ]);
  const have = new Set(universe.filter((u) => u.status !== "RETIRED").map((u) => u.symbol));
  const mark = (s: string) => (have.has(s) ? " (OURS)" : "");

  const congressLines = congress.map((c) => `- ${c.symbol}${mark(c.symbol)}: ${c.buyers} members, ${c.trades} trades — ${c.assetName}`).join("\n") || "- (none in window)";
  const fundLines = funds.map((f) => `- ${f.symbol}${mark(f.symbol)}: added by ${f.fundNames.join(", ")} (${fmtUsd(f.totalValueUsd)})`).join("\n") || "- (none)";
  const insiderLines = insiders.slice(0, 8).map((t) => `- ${t.symbol}${mark(t.symbol)}: ${fmtUsd(t.valueUsd)} by ${t.insiderName} (${t.insiderTitle ?? "?"})`).join("\n") || "- (none)";
  const portLines =
    portfolios
      .map((p) => {
        const top = p.topHoldings.slice(0, 5).map((h) => `${h.symbol}${h.putCall ? `(${h.putCall})` : ""} ${(h.pctOfPort * 100).toFixed(0)}% ${h.action}`).join(", ");
        return `- ${p.name} (${p.firm}, 13F ${p.asOf}, ${fmtUsd(p.totalValueUsd)}): ${top}`;
      })
      .join("\n") || "- (no portfolios ingested yet)";

  const prompt = `# TASK: Smart-money read — synthesize what notable portfolios are doing (${etDateStr()})

We ALREADY pulled the structured data below (FMP + OpenInsider: congress/insider trades, fund 13Fs). Your job is the EDITORIAL read ON TOP of it — the through-line, not a data dump. Do NOT re-fetch this; you may use WebSearch only to add brief "why" colour on 1–2 standout names.

CONGRESS — most-bought (last 90d):
${congressLines}

FUNDS — names multiple tracked managers piled into (latest 13F):
${fundLines}

INSIDERS — biggest open-market buys (last 14d):
${insiderLines}

TRACKED PORTFOLIOS — latest 13F top holdings (PUT = bearish bet, not a long):
${portLines}

Names marked (OURS) overlap GRQ's universe.

Write EXACTLY ONE RESEARCH entry via write_journal: title "Smart money — ${etDateStr()}", a tight markdown body (≤250 words) covering: the through-line (which themes smart money is crowding into / out of), any name that OVERLAPS our universe (lead with those), and the single most interesting tension (e.g. a famous fund SHORTING via puts what others are buying long). Honest framing: 13F lags ~45 days and shows longs+options only; congress amounts are ranges; most names are US-listed (we now trade CAD + USD) — colour and leads, not trade instructions. Cite sources[] (name FMP / OpenInsider + any web colour). Set confidence on how actionable this batch is.`;
  await runSession({ label: "smart-money", prompt, model: MODELS.decision, withTools: true, toolset: "research", maxTurns: 16 });

  // Once the report is published, queue a FULL dossier for every name it surfaces so
  // each ticker links to researched (not a 404). Idempotent — skips names already
  // tracked / queued / researched; generous cap since the member wants the whole
  // board researched, not a sample (Cam 2026-06-19).
  const surfaced = [
    ...congress.map((c) => c.symbol),
    ...funds.map((f) => f.symbol),
    ...insiders.map((t) => t.symbol),
    ...portfolios.flatMap((p) => p.topHoldings.map((h) => h.symbol)),
  ];
  await queueDossiers(surfaced, "smart-money", 100).catch(() => {});
}

/** Push the agent's decision to members after a check-in. Each kind writes a note
 *  with a DISTINCT title family — so they never collide, the brief slot can't be
 *  bumped by a single noisy name, and the push lands in the right category
 *  (Cam 2026-06-24):
 *   - "scheduled" → "Intraday Check-in — …", fund-level: a stray symbol is CLEARED so
 *     it always lands on the Portfolio home brief; push under "checkins".
 *   - "holding"   → "Position Note — SYM: …", single-name: the triggering symbol is SET
 *     so it files on the stock page (not the fund brief); push under "holdingChecks",
 *     deep-linked to that stock.
 *  Distinct prefixes also make the match unambiguous when a session wrote more than one
 *  note (e.g. a check-in plus a separate LESSON). */
async function notifyCheckinDecision(
  startedAt: Date,
  kind: "scheduled" | "holding",
  knownSymbol?: string | null,
): Promise<{ id: number; symbol: string | null } | null> {
  try {
    const prefix = kind === "scheduled" ? "Intraday Check-in" : "Position Note";
    const note = await prisma.journalEntry.findFirst({
      where: { kind: "RESEARCH", title: { startsWith: prefix }, at: { gte: startedAt } },
      orderBy: { at: "desc" },
    });
    if (!note) return null;

    let symbol = note.symbol;
    if (kind === "scheduled" && symbol) {
      // A scheduled check-in is a fund-level read — a stray symbol would hide it from
      // the home brief. Null it so it always shows there.
      await prisma.journalEntry.update({ where: { id: note.id }, data: { symbol: null } });
      symbol = null;
    } else if (kind === "holding") {
      const want = (knownSymbol ?? note.symbol)?.toUpperCase() ?? null;
      if (want && want !== note.symbol) {
        await prisma.journalEntry.update({ where: { id: note.id }, data: { symbol: want } });
      }
      symbol = want;
    }

    await alert("info", note.title, note.body.slice(0, 800), {
      category: kind === "holding" ? "holdingChecks" : "checkins",
      symbol: kind === "holding" ? symbol ?? undefined : undefined,
    });
    return { id: note.id, symbol };
  } catch (e) {
    console.error("notifyCheckinDecision failed", e);
    return null;
  }
}

// `symbol` = the holding whose move triggered this check-in (evaluateTriggers). A held-
// position trigger check-in is about ONE name, so its note must carry that symbol: it
// files on the stock page AND stays out of the fund-level Portfolio brief (which requires
// symbol:null) so one noisy holding can't dominate it. The push still fires (Cam 2026-06-24).
export async function runPositionCheck(reason: string, symbol?: string | null): Promise<void> {
  const startedAt = new Date();
  const sym = symbol ? symbol.toUpperCase() : null;
  const ctx = await buildContext();
  const prompt = `${ctx}

# TASK: Position check — ${reason}

The market is open. A holding has made a fresh move. Review the trigger above against your morning game plan (get_journal kind=RESEARCH limit=1) and current quotes. The plan is a hypothesis, not a contract: if this development has changed the picture, you're free to revise or scrap the plan and act on a fresh read — changing your mind on new evidence is the job, not a failure.
- If action is warranted and within policy, use propose_order (full thesis + sources required) — whether that's a planned trade or a new idea this development surfaced. Rejections are final — if rejected, journal why and adapt.
- Either way, write a short DECISION-grade RESEARCH note via write_journal titled "Position Note — ${sym ?? "<SYMBOL>"}: <one-line summary>" and SET its \`symbol\` to ${sym ?? "this holding"} — this note is about that ONE name, so it files on its stock page (NOT the fund-level Portfolio brief). What you did or why you passed; "no trade" is a decision and gets receipts too.
- If a follow-up can wait until your next hourly check-in (e.g. "trim if it clears \$98"), add_agenda it rather than re-checking now.
- If — and only if — this surfaced a genuinely DURABLE, reusable lesson (a pattern that should change how you trade in future, not a one-off), ALSO record it as a separate LESSON via write_journal(kind:"LESSON") — crisp title, the pattern + why. Lessons are re-read before every future decision; keep them rare and real.
Keep it tight: this is a position check, not a research project.`;
  await runSession({ label: `position:${sym ?? reason.slice(0, 30)}`, prompt, model: MODELS.decision, withTools: true, maxTurns: 24 });
  // A held-position trigger is always about ONE name → "holdingChecks", and the note
  // carries that holding (notifyCheckinDecision sets it if the agent left it off).
  await notifyCheckinDecision(startedAt, "holding", sym);
}

/** Scheduled / self-scheduled trading check-in — a decision-capable session that
 *  wakes on the fixed clock (CHECKIN_TIMES_ET) or a self-scheduled wakeup, reviews
 *  the standing game plan against fresh quotes/focus, and ACTS on any entry or exit
 *  condition that is now live (propose_order through the gate) — or stands down with
 *  a one-line note. It may also re-arm its own watch via schedule_checkin. This is
 *  how the morning plan's conditional afternoon trades actually execute. */
export async function runScheduledCheckin(reason: string): Promise<void> {
  const startedAt = new Date();
  const ctx = await buildContext();
  const prompt = `${ctx}

# TASK: Trading check-in — ${reason} (${etDateStr()})

The market is open. This is a scheduled check-in to ACT on your best read of the market RIGHT NOW. Your morning game plan is a HYPOTHESIS, not a contract — markets move all day, and you have full freedom to act on the plan, revise it, or throw it out and form a new one if the picture has changed since the open.
1. Re-read today's plan (get_journal kind=RESEARCH limit=1 — the "Game plan"), your AGENDA (list_agenda — the follow-ups you parked for a check-in like this one), your focus list (get_focus), and fresh quotes (get_quotes) for holdings + focus names. If something is clearly moving (a breakout, a catalyst, a macro turn), a quick WebSearch to confirm is fair game.
2. WORK YOUR AGENDA: for each open item now actionable (its dossier landed, its price level hit, its catalyst passed), do it — propose_order if warranted — and resolve_agenda it with a one-line outcome. Carry an item that genuinely isn't ready yet; resolve_agenda(status:"DROPPED") anything now moot. This is where parked follow-ups get done — not in a separately-scheduled session.
3. Then decide — does the plan still fit the tape?
   - PLAN STILL HOLDS: for each standing condition now met — a live entry trigger, a stop/trim level, a broken thesis — propose_order it with a full thesis + sources.
   - TAPE HAS CHANGED: if new information has overtaken the morning plan — a name broke out, a catalyst hit, the macro turned, a thesis is invalidated — you are EXPECTED to change course, not cling to a stale plan. Drop focus names that no longer make sense (set_focus), hunt a fresh idea (WebSearch → research entry → promote_to_universe if needed), exit a position whose thesis broke, or enter a new one — then say so in your note. Changing your mind on new evidence is good judgment, not inconsistency.
   Rejections are final: journal why and adapt. Don't force a junk trade — but if NONE of your ideas are live and the fund is sitting on cash, that is NOT an automatic "stand down": it means your pipeline is thin. Either act on a genuine setup you can defend right now, or state plainly that the next hunt has to go WIDER. Cash is a verdict you earn after looking, not a reflex.
4. For anything to revisit LATER: prefer add_agenda(item, symbol?) — the NEXT hourly check-in will work it (no extra session, no extra ping). Only use schedule_checkin for something that genuinely can't wait an hour (a timed event before the next check-in); tidy stale ones with list_scheduled / cancel_checkin.
5. Write ONE short DECISION-grade RESEARCH note (write_journal) titled "Intraday Check-in — <a one-line summary of your read>" — what you did, or why you stood down. This is a FUND-LEVEL read, so do NOT set \`symbol\` on it (leave it blank) even if you focused on one holding — a symbol here hides it from the Portfolio home brief and the scheduled-check-in notifications. (If a single name earned its own write-up, file that as a SEPARATE symbol-tagged RESEARCH entry.) Lead with a clean at-a-glance read; "No trade" is a decision and gets receipts too.
6. If — and ONLY if — this check-in surfaced a genuinely DURABLE, reusable lesson (a pattern that should change how you trade in future, not a one-off observation about today), ALSO record it as a separate LESSON: write_journal(kind:"LESSON") with a crisp title and the pattern + why it matters. Lessons are re-read before every future decision, so keep them rare and real — most check-ins won't earn one; don't manufacture one.
Keep it tight.`;
  await runSession({ label: `checkin:${reason.slice(0, 40)}`, prompt, model: MODELS.decision, withTools: true, maxTurns: 20 });
  await notifyCheckinDecision(startedAt, "scheduled");
}

/** Deep single-stock dossier (2.7) — research tools only, never trades.
 *  Returns the session result (null if the session errored), so the queue can
 *  tell a real failure from a success instead of marking everything DONE. */
export async function runStockDossier(symbol: string, requestedBy: string): Promise<string | null> {
  const sym = symbol.toUpperCase();
  const [entry, quote, sig, recent, sm] = await Promise.all([
    universeEntry(sym),
    getQuote(sym).catch(() => null),
    computeSignals(sym).catch(() => null),
    prisma.journalEntry.findMany({ where: { symbol: sym }, orderBy: { at: "desc" }, take: 5 }),
    getSmartMoneyForSymbol(sym).catch(() => null),
  ]);
  const smLine = sm ? smartMoneySummaryLine(sm) : "";
  const prompt = `# STOCK DOSSIER ASSIGNMENT: ${sym}${entry ? ` — ${entry.name} (${entry.status}${entry.tier ? `, ${entry.tier}` : ""})` : ""}
Requested by: ${requestedBy} · Today: ${etDateStr()}
Quote: ${quote ? `$${(quote.midCents / 100).toFixed(2)} (${((quote.dayChangeBps ?? 0) / 100).toFixed(2)}% today)` : "n/a"}
Signals: ${sig ? signalsOneLine(sig) : "(no bar history yet)"}
Smart money (disclosed — weigh it, don't follow blindly): ${smLine || "(none tracked on this name)"}
Prior journal on ${sym}: ${recent.map((j) => `[${j.kind}] ${j.title}`).join("; ") || "(none)"}

Research this stock thoroughly with WebSearch/WebFetch — the business, recent news and
results, catalysts, competitive position, risks. ALSO check recent INSIDER ACTIVITY: the
"Smart money" line above already carries our tracked 13F / congress / insider disclosures for
this name — factor it in, and search SEDI / SEDAR+ / canadianinsider for anything fresher
(clusters of insider BUYING are a strong signal, heavy selling a caution; note what you find,
dated, with the source). Then write
EXACTLY ONE symbol-tagged RESEARCH entry via write_journal: symbol="${sym}", title "Dossier — ${sym} — ${etDateStr()}",
markdown body with sections: **Snapshot** · **Recent developments** (dated, sourced) ·
**Insider activity** (recent filings + any cluster, or "none found") · **Signals read** ·
**Bull case** · **Bear case** · **Verdict** (worth watching?
thesis-worthy? confidence 0–100, plus your **price targets**) · **Risks**. Cite every source in sources[].
In the write_journal call, commit your expected prices as fields: **targetNearCents** (a
near-term swing target ~4–8 weeks out) with **targetNearDays** (its horizon in trading days),
and **targetFarCents** (a 12-month target). Prices in cents (e.g. $54.20 → 5420). These power
the expected return members see on "On the Radar" — set only targets you would defend; omit if
you genuinely have no view. Also set **bottomLine**: 3–5 short plain-English bullets (markdown,
"- " each) a non-expert can read on why this stock is a buy/sell/hold for us — the real reasons
(does the business make money? recent news/lawsuits/catalysts? the key risk?), concrete and
palatable. This is the at-a-glance "why" shown on the stock page.
Finally, set **stance** — YOUR call on this name as the fund's manager, one of Strong Buy / Buy / Weak Buy / Hold / Weak Sell / Sell / Strong Sell (the SAME 7-point scale as the technical signal, so the two read uniformly). This is your judgment, all things considered; it may agree with OR DISAGREE with the deterministic technical signal consensus (a formula). When it disagrees, that divergence is the most useful thing on the page — make the bottomLine and Verdict explain it.
${entry?.status === "CANDIDATE" ? "This dossier informs whether the members promote this candidate into the tradeable universe — be decisive in the Verdict." : "This keeps the fund's standing view fresh."}
Research only — no trades, no focus changes (you don't have those tools here).`;
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

"escalate" is for material, actionable developments on holdings/focus names. Routine volatility is "ignore". Newsworthy-but-not-actionable is "note".`;
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
  await alert("info", `EOD report — ${etDateStr()}`, `Day P&L ${stats.day_pnl} · NAV ${stats.nav} · vs XIC ${stats.vs_xic} · ${stats.trades} trade(s)`, { category: "reports" });
}

export async function runMiddayReport(): Promise<void> {
  const { pf, trades, rejections, dayPnlCents } = await computeDayStats();
  const ctx = await buildContext();
  const prompt = `${ctx}

# TASK: Midday brief — ${etDateStr()}

Lunchtime, market open. Write a SHORT brief for Cam & Graham on their phones: what has happened so far today and what you're watching this afternoon. Use the numbers above (do not invent). Touch on: day P&L so far ($${(dayPnlCents / 100).toFixed(2)}), any fills/decisions today (${trades.length} fill(s), ${rejections.length} rejection(s)), notable moves on holdings or your focus names, and what would make you act (or sit on your hands) before the close. 3–5 tight sentences, plain and lightly funny — never funny about losses. Your ENTIRE response is the brief itself.`;
  const body = await runSession({ label: "midday-report", prompt, model: MODELS.decision, withTools: false, maxTurns: 3 });
  if (!body) return;
  await prisma.journalEntry.create({
    data: { kind: "RESEARCH", title: `Midday brief — ${etDateStr()}`, body, agentVersion: AGENT_VERSION },
  });
  await alert("info", `Midday brief — ${etDateStr()}`, `Day P&L $${(dayPnlCents / 100).toFixed(2)} · NAV $${(pf.navCents / 100).toFixed(2)}\n${body.slice(0, 1000)}`, { category: "reports" });
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
3. Then produce the weekly report body in markdown: performance attribution, open-thesis grades (re-read each name's CURRENT dossier before grading — never carry forward a data error a later refresh already corrected, and don't flag a name for "refresh" without confirming the issue still exists), lessons added, proposed strategy adjustments (these need Cam & Graham's approval — say so), source hit-rate notes, a soak-cleanliness verdict for the week (clean / incident + what), and finish with the CAPITAL RECOMMENDATION: contribute / hold / withdraw, honestly framed (more capital amortizes overhead, it does not raise ROI %).

Your ENTIRE final response must be just the report body.`;
  const body = await runSession({ label: "weekly-review", prompt, model: MODELS.decision, withTools: true, maxTurns: 30 });
  if (!body) return;
  await prisma.report.upsert({
    where: { date_kind: { date: startOfEtDay(), kind: "WEEKLY" } },
    create: { date: startOfEtDay(), kind: "WEEKLY", title: `Weekly review — ${etDateStr()}`, body },
    update: { body },
  });
  await alert("info", `Weekly review — ${etDateStr()}`, "Posted to the dashboard, capital recommendation included.", { category: "reports" });
}

export { AGENT_VERSION };
