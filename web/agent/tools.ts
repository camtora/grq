import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { prisma } from "../lib/db";
import { getQuotes } from "../lib/broker/quotes";
import { getPortfolio } from "../lib/portfolio";
import { universeEntry, activeSymbols } from "../lib/universe";
import { validateAndPlace } from "./validator";
import { agentSelfPromote, addCandidate } from "./promote";
import { computeSignals, overallSignal } from "./signals";
import { AGENT_VERSION, MAX_PENDING_WAKEUPS } from "./policy";
import { startOfEtDay, etParts } from "./calendar";
import type { JournalKind } from "@prisma/client";

const OPEN_MIN = 9 * 60 + 30;
const CLOSE_MIN = 16 * 60;
const pad2 = (n: number) => String(n).padStart(2, "0");

// Resolve an ET clock time ("HH:MM", 24h) or "+N" minutes-from-now to a UTC Date
// landing TODAY in ET. startOfEtDay gives midnight-ET as a UTC instant; add minutes.
function resolveEtToday(at: string): { date: Date; minutes: number } | { error: string } {
  const trimmed = at.trim();
  let minutes: number;
  if (/^\+\d{1,3}$/.test(trimmed)) {
    minutes = etParts().minutesSinceMidnight + Number(trimmed.slice(1));
  } else {
    const m = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
    if (!m) return { error: `bad time "${at}" — use "HH:MM" (ET, 24h) or "+N" minutes from now.` };
    minutes = Number(m[1]) * 60 + Number(m[2]);
  }
  return { date: new Date(startOfEtDay().getTime() + minutes * 60_000), minutes };
}

function text(s: string) {
  return { content: [{ type: "text" as const, text: s }] };
}

const getPortfolioTool = tool(
  "get_portfolio",
  "Current fund state: cash, positions with marks and unrealized P&L, NAV, contributions, fee budget, benchmark.",
  {},
  async () => {
    const pf = await getPortfolio();
    return text(JSON.stringify(pf, (_k, v) => (v instanceof Date ? v.toISOString() : v), 2));
  },
);

const getQuotesTool = tool(
  "get_quotes",
  "Delayed (~15 min) quotes for symbols in the universe. Returns bid/ask/mid in cents, day change in bps, and the quote timestamp.",
  { symbols: z.array(z.string()).min(1).max(40) },
  async (args) => {
    const m = await getQuotes(args.symbols);
    return text(
      JSON.stringify(
        [...m.values()].map((q) => ({ ...q, at: q.at.toISOString() })),
        null,
        2,
      ),
    );
  },
);

const getJournalTool = tool(
  "get_journal",
  "Read the fund journal. Kinds: SYSTEM, RESEARCH, DECISION, TRADE, RETRO, LESSON.",
  {
    kind: z.enum(["SYSTEM", "RESEARCH", "DECISION", "TRADE", "RETRO", "LESSON"]).optional(),
    symbol: z.string().optional(),
    limit: z.number().int().min(1).max(50).default(20),
  },
  async (args) => {
    const entries = await prisma.journalEntry.findMany({
      where: {
        ...(args.kind ? { kind: args.kind as JournalKind } : {}),
        ...(args.symbol ? { symbol: args.symbol.toUpperCase() } : {}),
      },
      orderBy: { at: "desc" },
      take: args.limit,
    });
    return text(
      entries
        .map((j) => `[${j.at.toISOString()}] ${j.kind}${j.symbol ? ` ${j.symbol}` : ""} — ${j.title}\n${j.body}`)
        .join("\n\n---\n\n") || "(no entries)",
    );
  },
);

const writeJournalTool = tool(
  "write_journal",
  "Write a journal entry. Use RESEARCH for findings/game plans, RETRO for post-mortems (grade your sources!), LESSON for durable patterns. Always include sources. For a stock DOSSIER, ALSO commit price targets: targetNearCents (a near-term/swing target, ~20–60 trading days out, with targetNearDays as the horizon) and targetFarCents (a 12-month target) — your honest expected price in cents. These become the fund's expected-return view that members see on 'On the Radar'. Only set targets you would defend; omit them if you genuinely have no view. ALSO set bottomLine: 3–5 short plain-English bullet points (markdown, '- ' each) a non-expert can read explaining why this stock is a buy/sell/hold for us right now — the REAL reasons (the business, whether it makes money, recent news/lawsuits/catalysts, the key risk), concrete and palatable (e.g. '- Spending more than it earns', '- Facing lawsuits over X', '- Growth is slowing'). This is the at-a-glance why on the stock page. ALSO set stance: YOUR OWN call on the name — one of Strong Buy, Buy, Weak Buy, Hold, Weak Sell, Sell, Strong Sell (the SAME 7-point scale as the technical signal, so the two read uniformly side by side). This is your judgment as the fund's manager and may differ from the deterministic technical signal consensus; when it does, make the bottomLine say why. It surfaces as 'GRQ's call' on the stock page, next to the signal read. For a DISCOVERY-HUNT find (a 'Hunt dossier' entry), ALSO set obscurity 1–5: how under-the-radar / under-covered the name is — 5 = a deep cut almost nobody covers (no analysts, tiny float, no front-page coverage), 1 = a widely-followed name. This drives the obscurity badge + sort on The Hunt; the whole point of the hunt is the obscure end, so be honest about it.",
  {
    kind: z.enum(["RESEARCH", "RETRO", "LESSON"]),
    symbol: z.string().optional(),
    title: z.string().min(3).max(200),
    body: z.string().min(10).max(8000),
    confidence: z.number().int().min(0).max(100).optional(),
    sources: z.array(z.string()).default([]),
    targetNearCents: z.number().int().positive().optional(),
    targetNearDays: z.number().int().min(5).max(120).optional(),
    targetFarCents: z.number().int().positive().optional(),
    bottomLine: z.string().max(2000).optional(),
    stance: z.enum(["Strong Buy", "Buy", "Weak Buy", "Hold", "Weak Sell", "Sell", "Strong Sell"]).optional(),
    obscurity: z.number().int().min(1).max(5).optional(),
  },
  async (args) => {
    const e = await prisma.journalEntry.create({
      data: {
        kind: args.kind as JournalKind,
        symbol: args.symbol?.toUpperCase(),
        title: args.title,
        body: args.body,
        confidence: args.confidence,
        sourcesJson: JSON.stringify(args.sources),
        targetNearCents: args.targetNearCents,
        targetNearDays: args.targetNearDays,
        targetFarCents: args.targetFarCents,
        bottomLine: args.bottomLine,
        stance: args.stance,
        obscurity: args.obscurity,
        agentVersion: AGENT_VERSION,
      },
    });
    return text(`Journaled #${e.id} (${args.kind})${args.targetFarCents || args.targetNearCents ? " with targets" : ""}.`);
  },
);

const getFocusTool = tool("get_focus", "Your focus list — the ACTIVE universe names you're monitoring for an entry (NOT the human watchlist of candidates).", {}, async () => {
  const w = await prisma.agentFocus.findMany({ orderBy: { addedAt: "desc" } });
  return text(w.map((x) => `${x.symbol}${x.note ? ` — ${x.note}` : ""}`).join("\n") || "(empty)");
});

const setFocusTool = tool(
  "set_focus",
  "Add or remove names on your focus list — ACTIVE universe members you're monitoring for an entry, each with a short trigger note. This is your private setups list, not the human watchlist of candidates.",
  {
    add: z.array(z.object({ symbol: z.string(), note: z.string().optional() })).default([]),
    remove: z.array(z.string()).default([]),
  },
  async (args) => {
    const results: string[] = [];
    for (const a of args.add) {
      const sym = a.symbol.toUpperCase();
      const entry = await universeEntry(sym);
      if (!entry || entry.status !== "ACTIVE") {
        results.push(`SKIP ${sym}: not in the ACTIVE universe (${(await activeSymbols()).length} tradeable symbols).`);
        continue;
      }
      await prisma.agentFocus.upsert({
        where: { symbol: sym },
        create: { symbol: sym, note: a.note },
        update: { note: a.note },
      });
      results.push(`ADDED ${sym}`);
    }
    for (const r of args.remove) {
      const sym = r.toUpperCase();
      const directive = await prisma.symbolDirective.findUnique({ where: { symbol: sym } });
      if (directive?.directive === "PINNED") {
        results.push(`SKIP remove ${sym}: pinned by ${directive.by} — members decide when it leaves.`);
        continue;
      }
      await prisma.agentFocus.deleteMany({ where: { symbol: sym } });
      results.push(`REMOVED ${sym}`);
    }
    return text(results.join("\n") || "no-op");
  },
);

const gradeSourcesTool = tool(
  "grade_sources",
  "Grade the sources a resolved thesis cited: +1 pointed the right way, -1 misleading, 0 neutral. Call this after writing each RETRO — signal families (signal:rsi) get graded like any outlet. The scoreboard decides who you trust.",
  {
    symbol: z.string().optional(),
    journalId: z.number().int().optional(),
    grades: z
      .array(
        z.object({
          source: z.string().min(2).max(120),
          grade: z.number().int().min(-1).max(1),
          note: z.string().max(300).optional(),
        }),
      )
      .min(1)
      .max(20),
  },
  async (args) => {
    await prisma.sourceGrade.createMany({
      data: args.grades.map((g) => ({
        source: g.source.trim().toLowerCase(),
        grade: g.grade,
        note: g.note,
        symbol: args.symbol?.toUpperCase(),
        journalId: args.journalId,
      })),
    });
    return text(
      `Recorded ${args.grades.length} grade(s): ${args.grades.map((g) => `${g.source} ${g.grade > 0 ? "+1" : g.grade < 0 ? "−1" : "0"}`).join(", ")}.`,
    );
  },
);

const getSignalsTool = tool(
  "get_signals",
  "Technical signals v1 from daily bars (SMA trend stack, RSI14, MACD, 20d realized vol) PLUS the `recommendation` shown on the /stocks page — use it so you can explain that number instead of guessing. Recommendation aggregates ONLY the 3 directional families (trend, rsi, macd; volatility is a non-directional regime gauge and is excluded): ratio = Σ(signed confidence: BUY=+conf, SELL=−conf, HOLD=0) ÷ Σ(confidence of the three); signal = BUY if ratio≥0.25, SELL if ≤−0.25, else HOLD; conviction % = round(|ratio|×100) — the share of directional confidence behind the verdict, so HOLD families dilute it toward 50 rather than voting against (e.g. trend BUY 56 with rsi/macd HOLD 14/44 → 56÷(56+14+44) = 49% BUY). Signals are inputs on scoreboard probation — cite them in sources[] as e.g. 'signal:rsi' so retros can grade them.",
  { symbol: z.string() },
  async (args) => {
    const s = await computeSignals(args.symbol);
    if (!s) return text(`No signal data for ${args.symbol.toUpperCase()} (insufficient bar history).`);
    return text(JSON.stringify({ ...s, recommendation: overallSignal(s) }, null, 2));
  },
);

const proposeOrderTool = tool(
  "propose_order",
  "Propose a trade. It passes through the deterministic guardrail gate — rejections are final and explain which rail fired. BUYs require a price target (cents) above the ask and at least one source.",
  {
    symbol: z.string(),
    side: z.enum(["BUY", "SELL"]),
    type: z.enum(["MARKET", "LIMIT"]),
    qty: z.number().int().min(1).max(10_000),
    limitPriceCents: z.number().int().positive().optional(),
    thesis: z.string().min(20).max(2000),
    targetCents: z.number().int().positive().optional(),
    stopCents: z.number().int().positive().optional(),
    horizonDays: z.number().int().min(1).max(365).optional(),
    invalidation: z.string().max(500).optional(),
    confidence: z.number().int().min(0).max(100).optional(),
    sources: z.array(z.string()).min(1),
  },
  async (args) => {
    const verdict = await validateAndPlace(
      {
        symbol: args.symbol,
        side: args.side,
        type: args.type,
        qty: args.qty,
        limitPriceCents: args.limitPriceCents,
      },
      {
        thesis: args.thesis,
        targetCents: args.targetCents,
        stopCents: args.stopCents,
        horizonDays: args.horizonDays,
        invalidation: args.invalidation,
        confidence: args.confidence,
        sources: args.sources,
      },
    );
    // Conviction tally: log EVERY proposal — incl. conviction-gate rejections,
    // which refuse() before the DECISION journal is written — with the per-trade
    // confidence beside the standing dossier confidence. Best-effort: a logging
    // failure must never block or alter a trade.
    try {
      const sym = args.symbol.toUpperCase();
      const [dossier, q] = await Promise.all([
        prisma.journalEntry.findFirst({
          where: { kind: "RESEARCH", symbol: sym, confidence: { not: null } },
          orderBy: { at: "desc" },
        }),
        getQuotes([sym]).then((m) => m.get(sym)).catch(() => null),
      ]);
      await prisma.tradeProposal.create({
        data: {
          symbol: sym,
          side: args.side,
          qty: args.qty,
          tradeConfidence: args.confidence ?? null,
          dossierConfidence: dossier?.confidence ?? null,
          dossierStance: dossier?.stance ?? null,
          accepted: verdict.ok,
          status: verdict.ok ? verdict.status ?? null : "REJECTED",
          rejectReason: verdict.ok ? null : verdict.rejectReason ?? null,
          priceCents: q ? (args.side === "BUY" ? q.askCents : q.bidCents) : null,
          targetCents: args.targetCents ?? null,
        },
      });
    } catch {
      /* tally is observability only — never let it interfere with the order path */
    }

    if (!verdict.ok) return text(`REJECTED: ${verdict.rejectReason}`);
    if (verdict.status === "PENDING") return text(`PENDING: resting limit order #${verdict.orderId}.`);
    return text(
      `FILLED: order #${verdict.orderId} @ $${((verdict.fillPriceCents ?? 0) / 100).toFixed(2)}, commission $${((verdict.commissionCents ?? 0) / 100).toFixed(2)}.`,
    );
  },
);

const addCandidateTool = tool(
  "add_candidate",
  "Track a name you've researched (e.g. a discovery-hunt find) as a CANDIDATE — researched, not yet tradeable. Resolves the listing, pulls a year of bars, and queues a dossier if none exists. This is the step BEFORE promote_to_universe: track it, make sure its dossier rates it ≥Buy with ≥75 confidence, then promote. Members get a Discord alert. Give a one-line reason.",
  { symbol: z.string(), name: z.string().optional(), reason: z.string().min(15).max(500) },
  async (args) => {
    const r = await addCandidate(args.symbol, args.reason, args.name);
    return text(r.ok ? `TRACKING ${r.symbol} as a candidate. Once your dossier rates it ≥Buy with ≥75% confidence, promote_to_universe it.` : `SKIP: ${r.reason}`);
  },
);

const promoteToUniverseTool = tool(
  "promote_to_universe",
  "Self-invest: promote a CANDIDATE you've RESEARCHED into the tradeable universe so you can buy it. Rules apply and rejections are final + explain which fired — it must be a researched candidate; your latest dossier call ≥ Buy with confidence ≥75; pass the liquidity screen (≥$2 · 20d ADV ≥100k · ≥30 bars); be CAD- or USD-tradeable (the fund holds both); not member-blocked; and within the weekly self-promotion cap. The human watchlist→universe path is separate and unchanged. Promoting only makes it ELIGIBLE — every buy still clears the deterministic order gate. Pass a short reason (it's journaled and Discord-alerted to the members).",
  {
    symbol: z.string(),
    tier: z.enum(["large", "mid"]).optional(),
    reason: z.string().min(20).max(1000),
  },
  async (args) => {
    const r = await agentSelfPromote(args.symbol, args.tier, args.reason);
    return text(
      r.ok
        ? `PROMOTED ${args.symbol.toUpperCase()} to the universe (${r.tier}). You may now propose_order it — within all guardrails. The members were alerted.`
        : `REJECTED: ${r.reason}`,
    );
  },
);

const scheduleCheckinTool = tool(
  "schedule_checkin",
  'Schedule your own future trading check-in LATER TODAY — e.g. "wake me at 14:05 for the Fed dot plot, then I deploy the XIC core". `at` is an ET clock time "HH:MM" (24h) or "+N" minutes from now; it must be in the future, same-day, and within market hours (9:30–16:00 ET). At that time you get a decision-capable session pre-loaded with your standing plan. Use this in your morning plan and revise it at midday. Capped at a few pending at once; these draw on your ad-hoc decision budget when they fire.',
  { at: z.string(), reason: z.string().min(5).max(300) },
  async (args) => {
    const r = resolveEtToday(args.at);
    if ("error" in r) return text(`SKIP: ${r.error}`);
    const nowMin = etParts().minutesSinceMidnight;
    if (r.minutes <= nowMin) return text(`SKIP: ${pad2(Math.floor(r.minutes / 60))}:${pad2(r.minutes % 60)} ET is not in the future (it's ${pad2(Math.floor(nowMin / 60))}:${pad2(nowMin % 60)} ET now). Same-day only for now.`);
    if (r.minutes < OPEN_MIN || r.minutes >= CLOSE_MIN) return text(`SKIP: ${pad2(Math.floor(r.minutes / 60))}:${pad2(r.minutes % 60)} ET is outside market hours (9:30–16:00).`);
    const pending = await prisma.agentWakeup.count({ where: { status: "PENDING" } });
    if (pending >= MAX_PENDING_WAKEUPS) return text(`SKIP: already ${pending} check-ins pending (cap ${MAX_PENDING_WAKEUPS}). Cancel one first (list_scheduled / cancel_checkin).`);
    const w = await prisma.agentWakeup.create({ data: { dueAt: r.date, reason: args.reason, createdBy: "session" } });
    return text(`SCHEDULED #${w.id}: check-in at ${pad2(Math.floor(r.minutes / 60))}:${pad2(r.minutes % 60)} ET — ${args.reason}`);
  },
);

const listScheduledTool = tool("list_scheduled", "Your PENDING self-scheduled check-ins for today (id, time, reason).", {}, async () => {
  const ws = await prisma.agentWakeup.findMany({ where: { status: "PENDING" }, orderBy: { dueAt: "asc" } });
  if (ws.length === 0) return text("(no pending check-ins)");
  return text(ws.map((w) => { const p = etParts(w.dueAt); return `#${w.id} at ${pad2(p.hour)}:${pad2(p.minute)} ET — ${w.reason}`; }).join("\n"));
});

const cancelCheckinTool = tool(
  "cancel_checkin",
  "Cancel a PENDING self-scheduled check-in by id (from list_scheduled). Fixed daily check-ins (the hourly intraday schedule) are not yours to cancel.",
  { id: z.number().int() },
  async (args) => {
    const w = await prisma.agentWakeup.findUnique({ where: { id: args.id } });
    if (!w || w.status !== "PENDING") return text(`SKIP: #${args.id} is not a pending check-in.`);
    await prisma.agentWakeup.update({ where: { id: args.id }, data: { status: "CANCELLED" } });
    return text(`CANCELLED #${args.id}.`);
  },
);

export const grqServer = createSdkMcpServer({
  name: "grq",
  version: "1.0.0",
  tools: [
    getPortfolioTool,
    getQuotesTool,
    getJournalTool,
    writeJournalTool,
    getFocusTool,
    setFocusTool,
    getSignalsTool,
    gradeSourcesTool,
    addCandidateTool,
    promoteToUniverseTool,
    proposeOrderTool,
    scheduleCheckinTool,
    listScheduledTool,
    cancelCheckinTool,
  ],
});

export const GRQ_TOOL_NAMES = [
  "mcp__grq__get_portfolio",
  "mcp__grq__get_quotes",
  "mcp__grq__get_journal",
  "mcp__grq__write_journal",
  "mcp__grq__get_focus",
  "mcp__grq__set_focus",
  "mcp__grq__get_signals",
  "mcp__grq__grade_sources",
  "mcp__grq__add_candidate",
  "mcp__grq__promote_to_universe",
  "mcp__grq__propose_order",
  "mcp__grq__schedule_checkin",
  "mcp__grq__list_scheduled",
  "mcp__grq__cancel_checkin",
];

// Read-only variant for the chat (2.5c): no propose_order, no writes —
// a persuasive chat can never become a trading backdoor.
export const grqReadOnlyServer = createSdkMcpServer({
  name: "grq",
  version: "1.0.0",
  tools: [getPortfolioTool, getQuotesTool, getJournalTool, getFocusTool, getSignalsTool],
});

export const GRQ_READONLY_TOOL_NAMES = [
  "mcp__grq__get_portfolio",
  "mcp__grq__get_quotes",
  "mcp__grq__get_journal",
  "mcp__grq__get_focus",
  "mcp__grq__get_signals",
];

// Research variant for dossier sessions (2.7): reads + write_journal only —
// dossiers document, they never trade or touch the focus list.
export const grqResearchServer = createSdkMcpServer({
  name: "grq",
  version: "1.0.0",
  tools: [getQuotesTool, getJournalTool, getSignalsTool, writeJournalTool],
});

export const GRQ_RESEARCH_TOOL_NAMES = [
  "mcp__grq__get_quotes",
  "mcp__grq__get_journal",
  "mcp__grq__get_signals",
  "mcp__grq__write_journal",
];
