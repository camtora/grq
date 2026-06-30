import { query } from "@anthropic-ai/claude-agent-sdk";
import { prisma } from "../lib/db";
import { getPortfolio } from "../lib/portfolio";
import { getQuote } from "../lib/broker/quotes";
import { universeEntry, allUniverse, isTradeable, currencyForSymbol } from "../lib/universe";
import { setBootstrapMode } from "./promote";
import { queueDossiers } from "../lib/hunt";
import { huntAvoidAndSeed, findLine, type ScreenFind } from "../lib/market-screen/retrieval";
import { startOfEtDay, etDateStr } from "./calendar";
import { buildContext } from "./context";
import { computeSignals, signalsOneLine } from "./signals";
import { grqServer, GRQ_TOOL_NAMES, makeResearchServer, GRQ_RESEARCH_TOOL_NAMES } from "./tools";
import { MODELS, RACE, AGENT_VERSION, SELF_INVEST } from "./policy";
import { chatComplete, isOpenRouterModel, type ChatResult } from "./openrouter";
import { parseProposal, SHADOW_DECISION_SUFFIX, SHADOW_NARRATIVE_SUFFIX } from "./race/shadow";
import { PERSONA } from "./persona";
import { alert, heartbeat, sendDiscord } from "./alerts";
import { getPortfolios, getCongressLeaderboard, getFundsPilingIn, getInsiderTopBuys, getSmartMoneyForSymbol, smartMoneySummaryLine } from "../lib/smart-money/queries";
import { fmtUsd } from "../lib/smart-money/types";
import { commitsInWindow } from "../lib/github";
import { refreshOptions, optionsLine } from "../lib/options/store";
import { refreshSocialOne, socialLine } from "../lib/social/store";


type SessionOpts = {
  label: string;
  prompt: string;
  model: string;
  withTools: boolean;
  toolset?: "full" | "research"; // default full
  maxTurns: number;
  systemPrompt?: string; // defaults to PERSONA; overridden for non-trading utility calls (e.g. news triage)
};

export type { SessionOpts };

export async function runSession(opts: SessionOpts): Promise<string | null> {
  console.log(`[session] ${opts.label} starting (model=${opts.model})`);
  try {
    let result: string | null = null;
    let resultMsg: any = null;
    const q = query({
      prompt: opts.prompt,
      options: {
        model: opts.model,
        systemPrompt: opts.systemPrompt ?? PERSONA,
        maxTurns: opts.maxTurns,
        permissionMode: "bypassPermissions",
        settingSources: [],
        stderr: (data: string) => console.error(`[session:${opts.label}] ${data.slice(0, 400)}`),
        ...(opts.withTools
          ? {
              mcpServers: { grq: opts.toolset === "research" ? makeResearchServer() : grqServer },
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
  await checkTokenMilestones();
}

// Notify BOTH members when the day's cumulative agent token burn crosses 40M, then every 10M above
// (50M, 60M…) — a budget-watch alarm on the shared Claude Max quota (a normal day is ~30M). Fires
// once per (day, threshold) via a SYSTEM journal marker, so restarts/retries never re-alert. Discord
// always; iOS push to whoever has the "system" category on. Best-effort — never throws into a session.
const TOKEN_MILESTONE_STEP = 10_000_000; // every 10M
const TOKEN_MILESTONE_FLOOR = 40_000_000; // start at 40M/day
async function checkTokenMilestones(): Promise<void> {
  try {
    const dayStart = startOfEtDay(new Date());
    const agg = await prisma.agentUsage.aggregate({
      where: { at: { gte: dayStart } },
      _sum: { inputTokens: true, outputTokens: true, cacheCreationTokens: true, cacheReadTokens: true },
    });
    const total =
      (agg._sum.inputTokens ?? 0) + (agg._sum.outputTokens ?? 0) + (agg._sum.cacheCreationTokens ?? 0) + (agg._sum.cacheReadTokens ?? 0);
    if (total < TOKEN_MILESTONE_FLOOR) return;
    const M = (Math.floor(total / TOKEN_MILESTONE_STEP) * TOKEN_MILESTONE_STEP) / 1_000_000; // 47.3M → 40
    const day = etDateStr();
    const markerTitle = `Token milestone — ${M}M (${day})`;
    if ((await prisma.journalEntry.count({ where: { kind: "SYSTEM", title: markerTitle } })) > 0) return;
    await prisma.journalEntry.create({
      data: {
        kind: "SYSTEM",
        title: markerTitle,
        body: `The agent has used ${(total / 1e6).toFixed(1)}M tokens of the shared Claude Max quota today (${day}), crossing the ${M}M mark.`,
      },
    });
    await alert(
      "warning",
      `⚡ Token burn ${M}M today`,
      `The agent has used ${(total / 1e6).toFixed(1)}M tokens of Cam's shared Claude Max quota so far today — past the ${M}M mark. A normal day is ~30M. See /tokens.`,
      { category: "system" },
    );
  } catch (e) {
    console.error("[token-milestone] check failed:", e instanceof Error ? e.message : e);
  }
}

// ----- The Race (D68): shadow-run the challenger model(s) on the SAME frozen prompt -----

type ShadowKind = "morning" | "checkin" | "midday" | "eod" | "position";
// parseProposal + the shadow suffixes now live in ./race/shadow (shared with the Bull-Race engine).

type ChampionCall = {
  action: string; // BUY | SELL | NONE
  symbol: string | null;
  qty: number | null;
  confidence: number | null;
  thesis: string | null;
};

/** The champion's "call" for a decision session = its strongest TradeProposal logged during the
 *  session (highest tradeConfidence; latest as tiebreak), scored on the PROPOSAL (gate outcome
 *  ignored, same as a challenger). The entry PRICE is NOT taken here — runShadow resolves one shared
 *  mark per symbol so the champion and every challenger that names it are entered identically (fair
 *  Race terms). No proposal this session ⇒ a NONE/stand-down call. Best-effort; never throws. */
async function championCall(sessionAt: Date): Promise<ChampionCall | null> {
  const props = await prisma.tradeProposal
    .findMany({ where: { at: { gte: sessionAt } }, select: { symbol: true, side: true, qty: true, tradeConfidence: true, at: true } })
    .catch(() => [] as { symbol: string; side: string; qty: number; tradeConfidence: number | null; at: Date }[]);
  if (props.length === 0) return { action: "NONE", symbol: null, qty: null, confidence: null, thesis: null };
  props.sort((a, b) => (b.tradeConfidence ?? -1) - (a.tradeConfidence ?? -1) || b.at.getTime() - a.at.getTime());
  const pick = props[0];
  return {
    action: pick.side === "SELL" ? "SELL" : "BUY",
    symbol: pick.symbol,
    qty: pick.qty,
    confidence: pick.tradeConfidence ?? null,
    thesis: null, // the champion's reasoning is its full note (the row's text); no separate thesis line
  };
}

/** Run the configured challenger model(s) on the EXACT prompt the champion ran, one-shot and
 *  tool-less, and record both sides to ShadowRun for The Race. Never throws into the caller and
 *  never touches a broker/order path — a challenger can only ever produce text. No-op unless the
 *  Race is enabled and at least one challenger is configured. */
async function runShadow(opts: {
  kind: ShadowKind;
  decisionKind: "decision" | "narrative";
  label: string;
  reason: string;
  sessionAt: Date;
  prompt: string; // the frozen champion prompt — challengers get these exact bytes
  championText: string | null; // what the champion actually produced (its note / report body)
}): Promise<void> {
  if (!RACE.enabled || RACE.challengers.length === 0) return;

  // ONE entry mark per symbol for this whole shadow run (a single sessionAt): the champion and every
  // challenger that names a symbol are entered at the SAME price, so The Race scores them on identical
  // terms — no per-model getQuote drift (a quote refresh between rows used to spread the entry ~5bps).
  // Memoized; uses the agent's own quote path. A symbol with no live quote stays unpriced (null).
  // Memoize the PROMISE (stored synchronously, before the first await) so concurrent challengers
  // naming the same symbol share one fetch — otherwise two could both miss the cache and double-fetch,
  // and a quote refresh landing between them would reintroduce the very split this fixes.
  const entryMarks = new Map<string, Promise<{ priceCents: number; currency: string | null } | null>>();
  const resolveEntry = (symbol: string): Promise<{ priceCents: number; currency: string | null } | null> => {
    const key = symbol.toUpperCase();
    let pending = entryMarks.get(key);
    if (!pending) {
      pending = (async () => {
        try {
          const q = await getQuote(key);
          return q && q.midCents > 0 ? { priceCents: q.midCents, currency: await currencyForSymbol(key).catch(() => null) } : null;
        } catch {
          return null;
        }
      })();
      entryMarks.set(key, pending);
    }
    return pending;
  };

  try {
    // Champion row first — keep its written read AND, on decision sessions, its own "call" so it
    // races on the same hypothetical terms as the challengers. The champion has no JSON proposal
    // (it uses tools); its call is its strongest TradeProposal this session (D37). Its entry uses the
    // SAME shared mark as the challengers. Its REAL fund P&L stays separate (NAV).
    const call = opts.decisionKind === "decision" ? await championCall(opts.sessionAt) : null;
    const champEntry = call && (call.action === "BUY" || call.action === "SELL") && call.symbol ? await resolveEntry(call.symbol) : null;
    await prisma.shadowRun.create({
      data: {
        sessionAt: opts.sessionAt,
        sessionKind: opts.kind,
        label: opts.label,
        reason: opts.reason,
        model: MODELS.decision,
        role: "champion",
        text: opts.championText ?? "(champion produced no written output)",
        action: call?.action ?? null,
        symbol: call?.symbol ?? null,
        qty: call?.qty ?? null,
        confidence: call?.confidence ?? null,
        thesis: call?.thesis ?? null,
        entryPriceCents: champEntry?.priceCents ?? null,
        entryCurrency: champEntry?.currency ?? null,
        agentVersion: AGENT_VERSION,
      },
    });
  } catch (e) {
    console.error("[race] champion row failed", e instanceof Error ? e.message : e);
  }

  const suffix = opts.decisionKind === "decision" ? SHADOW_DECISION_SUFFIX : SHADOW_NARRATIVE_SUFFIX;
  const fullPrompt = opts.prompt + suffix;
  const isDecision = opts.decisionKind === "decision";

  // Split the slate: Claude challengers ride the Max-token SDK (free); the rest are metered
  // OpenRouter slugs. Guard the metered ones behind the daily $ cap + a present API key — the
  // champion and free challengers always run regardless.
  const claudeModels = RACE.challengers.filter((m) => !isOpenRouterModel(m));
  let meteredModels = RACE.challengers.filter((m) => isOpenRouterModel(m));
  if (meteredModels.length) {
    if (!process.env.OPENROUTER_API_KEY) {
      console.log(`[race] OPENROUTER_API_KEY unset — skipping metered ${meteredModels.join(", ")}`);
      meteredModels = [];
    } else {
      const spent = await meteredSpentTodayUsd();
      if (spent >= RACE.maxUsdPerDay) {
        console.log(`[race] metered cap hit ($${spent.toFixed(2)} ≥ $${RACE.maxUsdPerDay}) — skipping ${meteredModels.join(", ")} today`);
        meteredModels = [];
      }
    }
  }

  // Run every challenger concurrently — the champion already acted, so shadow latency only delays
  // the ShadowRun rows, never a trade. allSettled so one model's failure can't sink the others.
  const tasks: Promise<void>[] = [];
  for (const model of claudeModels) {
    tasks.push(
      (async () => {
        try {
          const text = await runSession({
            label: `race:${opts.label}`,
            prompt: fullPrompt,
            model,
            withTools: false, // shadow = frozen seed only; a tool call would diverge from what the champion saw
            maxTurns: 3,
          });
          if (text != null) await writeChallengerRow({ ...opts, model, text, isDecision, resolveEntry });
        } catch (e) {
          console.error(`[race] challenger ${model} failed`, e instanceof Error ? e.message : e);
        }
      })(),
    );
  }
  for (const model of meteredModels) {
    tasks.push(
      (async () => {
        try {
          const r = await chatComplete({ model, system: PERSONA, user: fullPrompt });
          if (r && r.text) {
            await writeChallengerRow({ ...opts, model, text: r.text, isDecision, resolveEntry });
            await recordOpenRouterUsage(`race:${opts.label}`, model, r);
          }
        } catch (e) {
          console.error(`[race] challenger ${model} failed`, e instanceof Error ? e.message : e);
        }
      })(),
    );
  }
  await Promise.allSettled(tasks);
}

/** Persist one challenger's ShadowRun row (champion's row is written separately by the caller). */
async function writeChallengerRow(opts: {
  model: string;
  text: string;
  isDecision: boolean;
  sessionAt: Date;
  kind: ShadowKind;
  label: string;
  reason: string;
  resolveEntry: (symbol: string) => Promise<{ priceCents: number; currency: string | null } | null>;
}): Promise<void> {
  const p = opts.isDecision ? parseProposal(opts.text) : null;

  // Entry price for a directional call comes from the run's SHARED per-symbol mark (resolveEntry) —
  // so every model that named this symbol at this session is entered at the identical price, and the
  // Race marks them to the live price on the same basis. Unpriceable symbol → null ("unpriced",
  // excluded from scoring).
  let entryPriceCents: number | null = null;
  let entryCurrency: string | null = null;
  if (p && (p.action === "BUY" || p.action === "SELL") && p.symbol) {
    const mark = await opts.resolveEntry(p.symbol);
    if (mark) {
      entryPriceCents = mark.priceCents;
      entryCurrency = mark.currency;
    } else {
      console.log(`[race] no quote to snapshot ${opts.model} ${p.action} ${p.symbol}`);
    }
  }

  await prisma.shadowRun.create({
    data: {
      sessionAt: opts.sessionAt,
      sessionKind: opts.kind,
      label: opts.label,
      reason: opts.reason,
      model: opts.model,
      role: "challenger",
      text: opts.text,
      action: p?.action ?? null,
      symbol: p?.symbol ?? null,
      qty: p?.qty ?? null,
      confidence: p?.confidence ?? null,
      thesis: p?.thesis ?? null,
      entryPriceCents,
      entryCurrency,
      agentVersion: AGENT_VERSION,
    },
  });
}

/** Today's (ET) metered shadow spend in USD — only OpenRouter rows (model contains "/"); Claude
 *  challengers are free on the Max token and excluded. Drives the daily cap. Best-effort → 0. */
async function meteredSpentTodayUsd(): Promise<number> {
  const since = startOfEtDay(new Date());
  const rows = await prisma.agentUsage
    .findMany({
      where: { at: { gte: since }, label: { startsWith: "race:" }, model: { contains: "/" } },
      select: { costMicroUsd: true },
    })
    .catch(() => [] as { costMicroUsd: number }[]);
  return rows.reduce((s, r) => s + (r.costMicroUsd || 0), 0) / 1e6;
}

/** Log a metered challenger's tokens + real $ to AgentUsage under a `race:` label — the same table
 *  runSession writes to, so The Race doubles as a cost-per-model board. Never throws into the run. */
async function recordOpenRouterUsage(label: string, model: string, r: ChatResult): Promise<void> {
  console.log(`[race] ${label} ${model} — in ${r.inTokens} out ${r.outTokens} · ~$${r.costUsd.toFixed(4)}`);
  try {
    await prisma.agentUsage.create({
      data: {
        label,
        model,
        status: "success",
        numTurns: 1,
        durationMs: 0,
        inputTokens: r.inTokens,
        outputTokens: r.outTokens,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        costMicroUsd: Math.round(r.costUsd * 1e6),
        agentVersion: AGENT_VERSION,
      },
    });
  } catch (e) {
    console.error(`[usage-log] openrouter ${label} failed:`, e instanceof Error ? e.message : e);
  }
}

/** Fetch the body of the champion's just-written note (e.g. "Game plan", "Intraday Check-in")
 *  so The Race can show its read beside the challengers'. Best-effort. */
async function latestNoteBody(titlePrefix: string, since: Date): Promise<string | null> {
  const n = await prisma.journalEntry
    .findFirst({ where: { title: { startsWith: titlePrefix }, at: { gte: since } }, orderBy: { at: "desc" } })
    .catch(() => null);
  return n?.body ?? null;
}

/** Pre-morning read (Cam 2026-06-25) — a 6:00 ET scan that runs hours before the
 *  day's heavy workload. Two jobs: (1) catch what moved overnight — post-market /
 *  pre-market earnings, news, gaps — and request_research a fresh dossier on the FEW
 *  names a real catalyst changes, so that research lands before the 9:00 game plan
 *  reads it; and (2) write ONE SHORT read for Cam & Graham. It is NOT the game plan —
 *  it's a quick "here's what's interesting and the high-level shape of the day." It
 *  owns the Portfolio briefing slot from 6:00 until the 9:00 Game plan (a newer
 *  brief) supersedes it. Discord-only (no 6am phone push); surfaces on Reports. */
export async function runPremorningRead(): Promise<void> {
  const ctx = await buildContext();
  // Yesterday's build diary (the latest CHANGE report) so the morning leads with "what changed yesterday".
  const diary = await prisma.report.findFirst({ where: { kind: "CHANGE" }, orderBy: { date: "desc" } });
  const diaryBlock = diary
    ? `Title: "${diary.title}" — LINK: /how-it-works?tab=daily-report&d=${etDateStr(diary.date)}\n${diary.body.slice(0, 1600)}`
    : "(no build diary for yesterday — a quiet build day.)";
  const prompt = `${ctx}

# TASK: Pre-morning read (6:00 ET, ${etDateStr()})

It's early — hours before the open and before your 9:00 game plan. Your write-up has TWO parts: first "what changed yesterday," then "the day ahead."

0. WHAT CHANGED YESTERDAY (the product). Below is yesterday's "build diary" — the plain-English changelog of what Cam shipped to GRQ. OPEN your read with a ONE–TWO sentence recap of it in your own words, and INCLUDE THE LINK so Cam & Graham can read the full thing. If there's no diary, just say it was a quiet build day.
--- yesterday's build diary ---
${diaryBlock}
--- end build diary ---

1. SCAN what changed overnight (the market). WebSearch (and WebFetch a promising article or two) for anything that moved while the market was closed and touches your holdings or focus names: post-market / pre-market EARNINGS, guidance, M&A, downgrades, a notable gap, or a macro print due at 8:30 ET. Be quick and selective — you're triaging, not writing theses.
2. REFRESH research only where something genuinely changed. For any name whose overnight news could change your call, request_research it so a fresh dossier lands before 9:00. Do NOT refresh the whole book — only names with a real overnight catalyst. If nothing changed, queue nothing.

Then write ONE SHORT RESEARCH journal entry (write_journal, kind RESEARCH, no symbol) titled "Pre-morning read — ${etDateStr()}". Structure it as **What changed yesterday** (your 1–2 sentence recap of the build diary + the LINK) then **The day ahead** (the overnight read + shape of the day). Keep it BRIEF — a few tight sentences or bullets per part. This is NOT the game plan (that's the 9:00 session and it does the deep work). It's a quick coffee read for Cam & Graham: what shipped yesterday (with the link), the one or two interesting things overnight, anything that moved in post-market (e.g. an earnings report on a holding), and the high-level shape of the day — risk-on / risk-off and what you'll be watching. Name any dossiers you kicked off to refresh. Plain, lightly funny, never funny about losses. Do NOT place orders — the market is closed.`;
  await runSession({ label: "premorning-read", prompt, model: MODELS.decision, withTools: true, maxTurns: 18 });
  const body = await latestNoteBody("Pre-morning read", new Date(Date.now() - 30 * 60_000));
  if (body) await sendDiscord("info", `Pre-morning read — ${etDateStr()}`, body.slice(0, 1500));
}

export async function runMorningResearch(): Promise<void> {
  const startedAt = new Date();
  const ctx = await buildContext();
  const prompt = `${ctx}

# TASK: Morning research (pre-market, ${etDateStr()})

1. Work through your seed sources and the macro sweep with WebSearch (and WebFetch for promising articles). You're looking for anything that affects current holdings, your focus list, or presents a swing opportunity.
2. Review every open position against its thesis — still valid?
3. Build a focus list of GENUINE, actionable setups (set_focus) — names with a live entry trigger you'd act on today. This list is your pipeline; an empty or stale focus list during market hours is a problem to fix now, not a state to accept.
3a. WIDEN IF THIN: if your current ACTIVE universe + watchlist doesn't give you enough high-conviction setups (and most days a handful of stale blue-chips won't), go HUNT. WebSearch the whole market — sectors with momentum, earnings beats, breakouts, the growth names on your watchlist — for stocks you'd genuinely back. Don't re-chew the same five rate-sensitive names and conclude "nothing's actionable"; that's under-deployment, which is the failure mode. Find better names.
3b. SELF-INVEST: when you find a name you'd back, research it (write a symbol-tagged RESEARCH/dossier entry with stance + confidence + sources), add_candidate it if untracked, and once your call is ≥ Buy with confidence ≥${SELF_INVEST.minConfidence} and it's liquid + CAD/USD-tradeable, promote_to_universe it so you can trade it — one-line reason (members get a Discord and can veto). Rules are enforced; rejections explain themselves. A promoted name still clears the order gate before any buy.
4. Write ONE RESEARCH journal entry (write_journal) titled "Game plan — ${etDateStr()}": today's read of the market, what you're watching, planned actions with conditions ("buy X if it holds above Y"), and cited sources. When a finding is specifically about one symbol, ALSO write a short symbol-tagged RESEARCH entry for it — the stock pages collect those.
5. Do NOT place orders now — the market is closed and entries are blocked in the first 15 minutes anyway. Trades happen via your plan when conditions trigger, or at the midday check-ins.

Be selective on sources (3 great beat 10 skimmed) but NOT timid on ideas: the goal of this session is to walk into the day with real setups to deploy into, not reasons to stay in cash. End with a one-paragraph summary of the plan.`;
  await runSession({ label: "morning-research", prompt, model: MODELS.decision, withTools: true, maxTurns: 40 });
  await runShadow({
    kind: "morning",
    decisionKind: "decision",
    label: `morning ${etDateStr()}`,
    reason: "Morning research / game plan",
    sessionAt: startedAt,
    prompt,
    championText: await latestNoteBody("Game plan", startedAt),
  });
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

The members RESET the universe — everything is a CANDIDATE now (tracked & researched, not tradeable). Your job: decide which of these you would genuinely invest in, and BUILD the tradeable universe yourself.

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
  // Market Base Layer retrieval (docs/MARKET-BASE-LAYER.md, Slice 3): names we've already
  // surfaced (anti-saturation) + a screen seed of INTERESTING leads to vet. Set "off" to disable.
  const mblOn = process.env.MARKET_BASE_RETRIEVAL !== "off";
  const mbl = mblOn ? await huntAvoidAndSeed().catch(() => ({ avoid: [] as string[], seed: [] as ScreenFind[] })) : { avoid: [] as string[], seed: [] as ScreenFind[] };
  const avoidLine = mbl.avoid.length ? `\nAlso SKIP names you've surfaced in recent hunts (find NEW ones, or only revisit one if its thesis genuinely changed): ${mbl.avoid.join(", ")}.` : "";
  const screenBlock = mbl.seed.length
    ? `\n## Screen shortlist — our market scan already flagged these INTERESTING (vet them and surface the genuine fits — but go BEYOND this list, don't just regurgitate it):\n${mbl.seed.map(findLine).join("\n")}\n`
    : "";
  const b = brief?.trim();
  const focus = b
    ? `\n## FOCUS — a member briefed this hunt\n«${b}»\n\nTreat this brief as the PRIMARY filter: theme, sector, catalyst, size, and timing all come from it. Everything below still holds (under-the-radar, leads-not-verdicts, North-American-tradeable preferred), but every name you surface must genuinely fit the brief. If it's narrow and you can only find 4–6 real fits, surface those — don't pad with off-brief names.\n`
    : "";
  const prompt = `# TASK: Discovery hunt — under-the-radar opportunities (${etDateStr()})
${focus}
You are hunting for stocks Cam & Graham have NOT heard of: under-covered, smaller names with asymmetric upside — explicitly NOT blue chips. The whole point is to surface names that aren't on the front page but could deliver high percentage growth.

REACH: the fund holds CAD + USD and trades both Canadian listings (TSX · TSX-V · CSE · NEO) and US listings (NYSE · Nasdaq) — so range across North America for the best fits. Prefer names the fund could eventually trade; you may surface up to ~2 listed elsewhere if they're clearly the best match, but flag those plainly as leads-only (not tradeable here).

We already track these — do NOT re-suggest them: ${have || "(none)"}.${avoidLine}
${screenBlock}
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

/** Chess Moves (docs/CHESS-MOVES.md) — a thematic / supply-chain reasoning pass. Maps a
 *  value chain, names the force in motion, and enumerates ripple-effect PLAYS (2nd/3rd-order
 *  winners & losers) as LEADS, then saves the board via save_chess_board. Research-only;
 *  never trades. brief present = a member's brief; null = Alfred self-picks a timely board
 *  (the weekly run). */
export async function runChessMoves(theme: { id: number; brief: string | null }): Promise<void> {
  const universe = await allUniverse();
  const have = universe.map((u) => u.symbol).join(", ");
  const b = theme.brief?.trim();
  const focus = b
    ? `\n## THE BRIEF — a member asked you to map this\n«${b}»\n\nThis is the board. Theme, sector, chain, catalyst, and timing all come from it.\n`
    : `\n## SELF-PICK — no brief; this is the weekly "board of the week"\nChoose ONE timely, high-interest industry or value chain to map — something with a force VISIBLY in motion right now (a demand shift, a capacity constraint, a new regulation, a big player's move). Prefer a chain where the 2nd/3rd-order names are still under-appreciated.\n`;
  const prompt = `# TASK: Chess Moves — map the board, predict the next move (${etDateStr()})
${focus}
You are doing what a sharp macro / supply-chain analyst does: pick the board (an industry or an interrelated chain of companies), GROK how the pieces depend on each other, name the FORCE already in motion, then trace the 2nd- and 3rd-order plays — the names that move BECAUSE of it, before the market fully reprices them. This is pattern-recognition and forecasting, NOT a stock screen.

Honesty bar (load-bearing): there is no supply-chain data feed — this is YOUR reasoning, web-researched. Treat every ripple as a PROBABILISTIC bet with explicit assumptions, never a fact. Each play is a LEAD (something worth researching), never a Buy/Hold/Sell verdict.

REACH: North America preferred (the fund holds CAD + USD; TSX · TSXV · CSE · NEO + NYSE · Nasdaq), but a board can include the best foreign names as leads-only. We already track these (fine to reference, but the value is in the names we DON'T cover): ${have || "(none)"}.

Use WebSearch (and WebFetch on the best leads) to:
1. MAP THE BOARD — lay the value chain out end to end: upstream (raw inputs / suppliers), midstream (the core operators), downstream (customers / OEMs), plus the adjacent picks-and-shovels and substitutes. Name the real companies in each stage — and for EVERY single public company give it its OWN board item WITH its ticker symbol (so it links + highlights on the stock page); only a genuine foreign/grouped basket you're not individually tracking may be a name without a ticker.
2. READ THE POSITION — name the single dominant force in motion and exactly how it ripples (the thesis), and what would change your mind (the levers).
3. CALL THE PLAYS — 8–12 ripple-effect names, each tagged BENEFICIARY / VICTIM / NEUTRAL and by effect order (1 = directly hit, 2/3 = downstream consequence). Favour under-the-radar names (higher obscurity) — the obvious mega-cap is the least interesting play.

Then call **save_chess_board** EXACTLY ONCE with themeId=${theme.id}: the title, anchor, thesis, bottomLine, the board (stages + directed links between the plays' TICKERS), the plays (each with its EXACT exchange — required to resolve the right company), and 2–4 falsifiable levers. The links connect tickers that move together (a supplier → its customer). Don't call any other write tool — the board is the deliverable.`;
  await runSession({ label: `chess:${theme.id}`, prompt, model: MODELS.decision, withTools: true, toolset: "research", maxTurns: 44 });

  // Quiet-fail guard (mirror the dossier queue): if the session didn't flip the theme to
  // READY, mark it FAILED so the page shows an honest state and the runner moves on.
  const after = await prisma.chessTheme.findUnique({ where: { id: theme.id }, select: { status: true } });
  if (after && after.status !== "READY") {
    await prisma.chessTheme.update({ where: { id: theme.id }, data: { status: "FAILED", completedAt: new Date() } });
    await alert("warning", `Chess Moves session produced no board (theme #${theme.id})`, "", { category: "system" });
  }
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
- If a follow-up can wait until your next scheduled check-in (now every 30 min — e.g. "trim if it clears \$98"), add_agenda it rather than re-checking now.
- If — and only if — this surfaced a genuinely DURABLE, reusable lesson (a pattern that should change how you trade in future, not a one-off), ALSO record it as a separate LESSON via write_journal(kind:"LESSON") — crisp title, the pattern + why. Lessons are re-read before every future decision; keep them rare and real.
Keep it tight: this is a position check, not a research project.`;
  await runSession({ label: `position:${sym ?? reason.slice(0, 30)}`, prompt, model: MODELS.decision, withTools: true, maxTurns: 24 });
  // A held-position trigger is always about ONE name → "holdingChecks", and the note
  // carries that holding (notifyCheckinDecision sets it if the agent left it off).
  await notifyCheckinDecision(startedAt, "holding", sym);
  await runShadow({
    kind: "position",
    decisionKind: "decision",
    label: `position:${sym ?? reason.slice(0, 30)}`,
    reason,
    sessionAt: startedAt,
    prompt,
    championText: await latestNoteBody("Position Note", startedAt),
  });
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
  // Screen funnel (Market Base Layer, docs/MARKET-BASE-LAYER.md) — hand the check-in a ranked
  // shortlist of fresh INTERESTING candidates so the wide research pass STARTS from the cheap
  // deterministic/Haiku screen instead of Opus re-WebSearching the whole market from scratch every
  // slot. This is the affordable way to "cast a wider net": retrieval feeds breadth; the model
  // spends its tokens vetting, not rediscovering. Set MARKET_BASE_RETRIEVAL=off to disable.
  const mblOn = process.env.MARKET_BASE_RETRIEVAL !== "off";
  const mbl = mblOn ? await huntAvoidAndSeed().catch(() => ({ avoid: [] as string[], seed: [] as ScreenFind[] })) : { avoid: [] as string[], seed: [] as ScreenFind[] };
  const screenBlock = mbl.seed.length
    ? `\n## Screen shortlist — our market scan flagged these INTERESTING (a ranked seed for your wide pass; vet the genuine fits, and go BEYOND this list too):\n${mbl.seed.map(findLine).join("\n")}\n`
    : "";
  const prompt = `${ctx}

# TASK: Trading check-in — ${reason} (${etDateStr()})

The market is open. This is your 30-MINUTE REBUILD — not a glance at the morning plan to check triggers, a full re-derivation of the plan for the rest of the day. Start from the prior plan + your agenda, then layer in EVERYTHING that's happened since the last check-in: fresh quotes, fills, news, macro, the tape's tone, your holdings' moves. Then write a NEW plan that supersedes the old one. The morning plan is a starting hypothesis with a short shelf life — mornings especially move fast, so the early check-ins are genuine re-evaluations, not trigger-checks. You have the context budget; actually re-think it rather than re-stating this morning's read.
1. Re-read today's plan (get_journal kind=RESEARCH limit=1 — the "Game plan"), your AGENDA (list_agenda — the follow-ups you parked for a check-in like this one), your focus list (get_focus), and fresh quotes (get_quotes) for holdings + focus names. If something is clearly moving (a breakout, a catalyst, a macro turn), a quick WebSearch to confirm is fair game.
2. WORK YOUR AGENDA: for each open item now actionable (its dossier landed, its price level hit, its catalyst passed), do it — propose_order if warranted — and resolve_agenda it with a one-line outcome. Carry an item that genuinely isn't ready yet; resolve_agenda(status:"DROPPED") anything now moot. This is where parked follow-ups get done — not in a separately-scheduled session.
3. REBUILD the plan from scratch given the prior plan + the last hour, and ACT on the fresh read:
   - For every standing condition now met — a live entry trigger, a stop/trim level, a broken thesis — propose_order it with a full thesis + sources.
   - Where new information has overtaken the old plan — a name broke out, a catalyst hit, the macro turned, a thesis is invalidated — change course: drop focus names that no longer fit (set_focus), enter/exit/rotate as the fresh read dictates, and say so. Do NOT anchor on the morning's read just because you wrote it — the best plan is the one that accounts for the most recent half-hour, and re-deriving it each check-in is the job, not a failure of consistency.
   Rejections are final: journal why and adapt. Don't force a junk trade — but if NONE of your ideas are live and the fund is sitting on cash, that is NOT an automatic "stand down": it means your pipeline is thin. Either act on a genuine setup you can defend right now, or state plainly that the next hunt has to go WIDER. Cash is a verdict you earn after looking, not a reflex. And the reverse: if a genuinely better setup appears but the fund is heavily deployed with little cash, don't just pass — rank your book by the weight + dossier call shown in Positions, and if the new idea clearly beats your weakest-conviction holding (net of taxes/fees, and it clears the 70% bar), ROTATE: propose the SELL to free the cash, then the BUY. Name the swap in your note.
   MANDATORY — every check-in MUST advance the pipeline, and you have ample token budget for real breadth, so use it. Work it in three stages — WIDEN cheaply, DEEPEN selectively, DEPLOY decisively:
   (a) WIDEN THE NET — vet 12–18 genuinely NEW names you don't already track, as LEADS. Start from the "Screen shortlist" section below (a ranked seed from our market scan), then go BEYOND it: sectors breaking out, fresh earnings beats, clustered insider buying, peers of names you like, US AND Canadian. A LEAD is cheap — a quick WebSearch and a one-line view — NOT a dossier. List the names you scanned + your one-liner in your check-in note. Casting this wide is cheap and is the job every time; "I looked at five and nothing qualified" is not credible when the investable market is thousands of names and your watchlist is a sliver of it.
   (b) DEEPEN THE PROMISING FEW — only the leads with a credible path to ≥Buy/70 earn the EXPENSIVE step: add_candidate (untracked) or request_research (already tracked), which QUEUES A FULL OPUS DOSSIER in the background. Expect ~2–4 of these per check-in, not all 12–18 — be deliberate, each one spends real research budget. Then schedule_checkin a return ~20–30 min out to decide on those once their dossiers land — do NOT wait for the next slot, and do NOT act on a half-formed inline note; wait for the real "Dossier —" pass.
   (c) PROMOTE + DEPLOY — promote_to_universe any researched candidate whose latest dossier now clears Buy/≥70. If your context flags a currency leg OVER its cash ceiling, deploying that leg this check-in is part of the mandate — a real stock if you have one (preferred), index-ETF ballast (XIC for CAD, a US index for USD) only if you genuinely don't; don't FX merely to PARK ballast, but a ≥Buy/70 name you can't fund in its own sleeve while the other sleeve is flush IS a first-class reason to request_fx (size it to the position you'd open; see the cash-by-currency note).
   This WIDENS the funnel — it does not force a trade: tracking or promoting a name does not buy it, and every buy still clears the §6 gate and the 70% bar. Name the new names you vetted/queued/promoted in your note. A check-in that bought nothing AND vetted no new names is a failed check-in.${screenBlock}
4. For things to revisit LATER, pick the right tool: (i) schedule_checkin a NEAR-TERM return (~20–30 min) for anything you want to act on once a QUEUED DOSSIER lands, or a timed event that hits before the next slot — this is the "come back when the research is ready" path, and you should USE it rather than passively waiting; (ii) add_agenda(item, symbol?) for lower-priority follow-ups the next scheduled check-in (now every 30 min) can pick up with no extra session or ping. Keep self-scheduled wakeups purposeful — you have a daily ad-hoc budget — and tidy stale ones with list_scheduled / cancel_checkin.
5. Write ONE short DECISION-grade RESEARCH note (write_journal) titled "Intraday Check-in — <a one-line summary of your read>" — what you did, or why you stood down. This is a FUND-LEVEL read, so do NOT set \`symbol\` on it (leave it blank) even if you focused on one holding — a symbol here hides it from the Portfolio home brief and the scheduled-check-in notifications. (If a single name earned its own write-up, file that as a SEPARATE symbol-tagged RESEARCH entry.) Lead with a clean at-a-glance read; "No trade" is a decision and gets receipts too.
6. If — and ONLY if — this check-in surfaced a genuinely DURABLE, reusable lesson (a pattern that should change how you trade in future, not a one-off observation about today), ALSO record it as a separate LESSON: write_journal(kind:"LESSON") with a crisp title and the pattern + why it matters. Lessons are re-read before every future decision, so keep them rare and real — most check-ins won't earn one; don't manufacture one.
Keep it tight.`;
  await runSession({ label: `checkin:${reason.slice(0, 40)}`, prompt, model: MODELS.decision, withTools: true, maxTurns: 45 });
  await notifyCheckinDecision(startedAt, "scheduled");
  await runShadow({
    kind: "checkin",
    decisionKind: "decision",
    label: `checkin:${reason.slice(0, 40)}`,
    reason,
    sessionAt: startedAt,
    prompt,
    championText: await latestNoteBody("Intraday Check-in", startedAt),
  });
}

/** Deep single-stock dossier (2.7) — research tools only, never trades.
 *  Returns the session result (null if the session errored), so the queue can
 *  tell a real failure from a success instead of marking everything DONE. */
export async function runStockDossier(symbol: string, requestedBy: string): Promise<string | null> {
  const sym = symbol.toUpperCase();
  const [entry, quote, sig, recent, sm, opt, soc] = await Promise.all([
    universeEntry(sym),
    getQuote(sym).catch(() => null),
    computeSignals(sym).catch(() => null),
    prisma.journalEntry.findMany({ where: { symbol: sym }, orderBy: { at: "desc" }, take: 5 }),
    getSmartMoneyForSymbol(sym).catch(() => null),
    refreshOptions(sym).catch(() => null),
    refreshSocialOne(sym).catch(() => null),
  ]);
  const smLine = sm ? smartMoneySummaryLine(sm) : "";
  const optLine = opt ? optionsLine(opt) : "";
  const socLine = soc ? socialLine(soc) : "";
  const prompt = `# STOCK DOSSIER ASSIGNMENT: ${sym}${entry ? ` — ${entry.name} (${entry.status}${entry.tier ? `, ${entry.tier}` : ""})` : ""}
Requested by: ${requestedBy} · Today: ${etDateStr()}
Quote: ${quote ? `$${(quote.midCents / 100).toFixed(2)} (${((quote.dayChangeBps ?? 0) / 100).toFixed(2)}% today)` : "n/a"}
Signals: ${sig ? signalsOneLine(sig) : "(no bar history yet)"}
Smart money (disclosed — weigh it, don't follow blindly): ${smLine || "(none tracked on this name)"}
Options positioning (a SIGNAL about the underlying — we NEVER trade options): ${optLine || "(no listed options for this name)"}
Social buzz (Reddit + Stocktwits — a CROWDING/RISK signal, ON PROBATION, noisy & gameable; weigh lightly, never decisive): ${socLine || "(no retail chatter — off the radar)"}
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
Also set **confidenceLevers** — the 2–4 SPECIFIC, FALSIFIABLE things that would most reframe this call (what is pinning your confidence below 100). Each: {gap (the unknown, concrete & checkable — "Q3 gross margin > 42%", "read the 10-Q on debt maturities", NOT "more macro clarity"), direction ("up" → toward buy / "down" → toward sell / "tighten" → two-sided, just narrows the read), magnitude ("small"/"moderate"/"large"), kind ("data-gap" = info that exists but you don't have → you could go get it; "catalyst" = an event on a known horizon — earnings, a ruling), trigger (how/when you'd learn it — a date, a filing, a price level), retrievable (true if researchable now, false if you must wait)}. Be honest: name the real unknowns behind your confidence number, not filler.
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
  const startedAt = new Date();
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

Write the EOD report body in markdown (no top-level title — the dashboard adds it): what happened, why (with the thesis behind each trade), guardrail events, where we stand — lead with the return RATE and the compounding arc (vs XIC is the floor, not the headline; don't dress small dollars up as a win) — and tomorrow's watch items. Honest, brief, lightly funny where the numbers allow it. Your ENTIRE final response must be just the report body.`;
  const body = await runSession({ label: "eod-report", prompt, model: MODELS.decision, withTools: false, maxTurns: 4 });
  if (!body) return;
  await prisma.report.upsert({
    where: { date_kind: { date: startOfEtDay(), kind: "EOD" } },
    create: { date: startOfEtDay(), kind: "EOD", title: `EOD — ${etDateStr()}`, body, statsJson: JSON.stringify(stats) },
    update: { body, statsJson: JSON.stringify(stats) },
  });
  await alert("info", `EOD report — ${etDateStr()}`, `Day P&L ${stats.day_pnl} · NAV ${stats.nav} · vs XIC ${stats.vs_xic} · ${stats.trades} trade(s)`, { category: "reports" });
  await runShadow({
    kind: "eod",
    decisionKind: "narrative",
    label: `eod ${etDateStr()}`,
    reason: "End-of-day report",
    sessionAt: startedAt,
    prompt,
    championText: body,
  });
}

// ----- Daily build diary (3am ET): plain-English "what changed in the app" for Graham -----

const BUILD_DIARY_PERSONA = `You are Alfred, writing GRQ's daily build diary. Each night you summarize the day's engineering work for Graham — one of the fund's two owners. Graham is finance-literate and sharp but NOT a programmer: he uses ChatGPT, gets bored by technical detail, and wants to know what changed in the product and WHY it matters, not how it was coded. Translate everything. NEVER mention file names, function names, commit hashes, branches, frameworks, or jargon ("refactor", "endpoint", "schema", "API", "component", "deploy"). Group related changes into a few themes. Lead with whatever matters most to the fund or to him. Be concrete about what he'd actually notice ("the watchlist now shows both your faces on a stock"), plain about fixes ("fixed a bug where…"), and don't oversell — no hype, no "we crushed it". Warm, clear, lightly dry. The point is that the two of you stay on the same page.`;

// Map a changed file path to a coarse, non-technical "area" — a grouping HINT for the
// writer (it's told never to name these literally). Keeps the prompt readable without
// leaking file paths into Graham's report.
function coarseAreas(files: string[]): string {
  const set = new Set<string>();
  for (const f of files) {
    if (f.startsWith("ios/")) set.add("iOS app");
    else if (f.startsWith("docs/") || f === "CLAUDE.md" || f === "PROJECT_PLAN.md") set.add("docs");
    else if (f.startsWith("shared/")) set.add("shared app contract");
    else if (f.startsWith("web/agent/")) set.add("trading agent");
    else if (f.startsWith("web/prisma/")) set.add("database");
    else if (f.startsWith("web/app/")) set.add("website pages");
    else if (f.startsWith("web/components/")) set.add("website UI");
    else if (f.startsWith("web/lib/")) set.add("website backend");
    else set.add("other");
  }
  return [...set].slice(0, 6).join(", ");
}

/** The day's plain-English change report for Graham. Covers commits in the 3am→3am ET
 *  window ending at ~now (so a late-night build session lands in ONE report), dated the
 *  day the work belongs to. No-ops if GITHUB_TOKEN isn't set; writes a one-line note on a
 *  quiet day. Stored as a CHANGE Report; rendered on /how-it-works → Daily report. */
export async function runDailyChangeReport(): Promise<void> {
  const now = new Date();
  const windowEnd = new Date(startOfEtDay(now).getTime() + 3 * 3_600_000); // 3:00 ET today
  const windowStart = new Date(windowEnd.getTime() - 24 * 3_600_000); // 3:00 ET yesterday
  const reportDate = startOfEtDay(windowStart); // yesterday 00:00 ET — the day-changer label
  const dateStr = etDateStr(windowStart);

  const res = await commitsInWindow(windowStart, windowEnd);
  if (!res.ok) {
    console.log(`[daily-change-report] ${dateStr}: skipped — ${res.reason}`);
    return; // no token / API hiccup — leave the day blank rather than write a stub
  }
  const commits = res.commits;
  let body: string;
  if (commits.length === 0) {
    body = "_Quiet day — no changes shipped to the app._";
  } else {
    const lines = commits
      .map((c) => {
        const b = c.body.replace(/\s+/g, " ").trim().slice(0, 400);
        const areas = coarseAreas(c.files);
        return `- ${c.subject}${b ? ` — ${b}` : ""}${areas ? ` [${areas}]` : ""}`;
      })
      .join("\n");
    const prompt = `# TASK: Daily build diary — ${dateStr}

Here is everything Cam changed in the GRQ app in the last day (${commits.length} change${commits.length === 1 ? "" : "s"}${res.truncated ? "+, list capped at 100" : ""}). The bracketed [areas] are grouping hints — never name them literally.

Changes:
${lines}

Write the report for Graham in markdown: a one-line **TL;DR** first, then 2–5 short \`##\` sections grouping related work (each a sentence or three, plain English — what changed and why it matters to the fund or the product). Fold pure behind-the-scenes plumbing into a single short "Under the hood" line at the end, or skip it. Your ENTIRE response is the report body in markdown (no title — the page adds one).`;
    const out = await runSession({
      label: "daily-change-report",
      prompt,
      model: MODELS.decision,
      withTools: false,
      maxTurns: 4,
      systemPrompt: BUILD_DIARY_PERSONA,
    });
    if (!out) return;
    body = out;
  }

  await prisma.report.upsert({
    where: { date_kind: { date: reportDate, kind: "CHANGE" } },
    create: { date: reportDate, kind: "CHANGE", title: `Build diary — ${dateStr}`, body, statsJson: JSON.stringify({ commits: commits.length }) },
    update: { body, statsJson: JSON.stringify({ commits: commits.length }) },
  });
  await alert("info", `Build diary — ${dateStr}`, `${commits.length} change${commits.length === 1 ? "" : "s"} summarized for Graham.`, { category: "reports" });
}

export async function runMiddayReport(): Promise<void> {
  const startedAt = new Date();
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
  await runShadow({
    kind: "midday",
    decisionKind: "narrative",
    label: `midday ${etDateStr()}`,
    reason: "Midday brief",
    sessionAt: startedAt,
    prompt,
    championText: body,
  });
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
