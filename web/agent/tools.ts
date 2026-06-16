import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { prisma } from "../lib/db";
import { getQuotes } from "../lib/broker/quotes";
import { getPortfolio } from "../lib/portfolio";
import { universeEntry, activeSymbols } from "../lib/universe";
import { validateAndPlace } from "./validator";
import { computeSignals, overallSignal } from "./signals";
import { AGENT_VERSION } from "./policy";
import type { JournalKind } from "@prisma/client";

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
  "Write a journal entry. Use RESEARCH for findings/game plans, RETRO for post-mortems (grade your sources!), LESSON for durable patterns. Always include sources. For a stock DOSSIER, ALSO commit price targets: targetNearCents (a near-term/swing target, ~20–60 trading days out, with targetNearDays as the horizon) and targetFarCents (a 12-month target) — your honest expected price in cents. These become the fund's expected-return view that members see on 'On the Radar'. Only set targets you would defend; omit them if you genuinely have no view. ALSO set bottomLine: 3–5 short plain-English bullet points (markdown, '- ' each) a non-expert can read explaining why this stock is a buy/sell/hold for us right now — the REAL reasons (the business, whether it makes money, recent news/lawsuits/catalysts, the key risk), concrete and palatable (e.g. '- Spending more than it earns', '- Facing lawsuits over X', '- Growth is slowing'). This is the at-a-glance why on the stock page. ALSO set stance: YOUR OWN call on the name — one of BUY, ACCUMULATE, HOLD, WATCH, TRIM, AVOID, SELL. This is your judgment as the fund's manager and may differ from the deterministic technical signal consensus; when it does, make the bottomLine say why. It surfaces as 'GRQ's call' on the stock page, next to the signal read.",
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
    stance: z.enum(["BUY", "ACCUMULATE", "HOLD", "WATCH", "TRIM", "AVOID", "SELL"]).optional(),
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
    if (!verdict.ok) return text(`REJECTED: ${verdict.rejectReason}`);
    if (verdict.status === "PENDING") return text(`PENDING: resting limit order #${verdict.orderId}.`);
    return text(
      `FILLED: order #${verdict.orderId} @ $${((verdict.fillPriceCents ?? 0) / 100).toFixed(2)}, commission $${((verdict.commissionCents ?? 0) / 100).toFixed(2)}.`,
    );
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
    proposeOrderTool,
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
  "mcp__grq__propose_order",
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
