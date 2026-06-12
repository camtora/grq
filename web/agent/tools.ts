import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { prisma } from "../lib/db";
import { getQuotes } from "../lib/broker/quotes";
import { getPortfolio } from "../lib/portfolio";
import { inUniverse, universeSymbols } from "../lib/universe";
import { validateAndPlace } from "./validator";
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
  "Write a journal entry. Use RESEARCH for findings/game plans, RETRO for post-mortems (grade your sources!), LESSON for durable patterns. Always include sources.",
  {
    kind: z.enum(["RESEARCH", "RETRO", "LESSON"]),
    symbol: z.string().optional(),
    title: z.string().min(3).max(200),
    body: z.string().min(10).max(8000),
    confidence: z.number().int().min(0).max(100).optional(),
    sources: z.array(z.string()).default([]),
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
        agentVersion: AGENT_VERSION,
      },
    });
    return text(`Journaled #${e.id} (${args.kind}).`);
  },
);

const getWatchlistTool = tool("get_watchlist", "Current watchlist.", {}, async () => {
  const w = await prisma.watchlist.findMany({ orderBy: { addedAt: "desc" } });
  return text(w.map((x) => `${x.symbol}${x.note ? ` — ${x.note}` : ""}`).join("\n") || "(empty)");
});

const setWatchlistTool = tool(
  "set_watchlist",
  "Add or remove watchlist symbols (universe members only).",
  {
    add: z.array(z.object({ symbol: z.string(), note: z.string().optional() })).default([]),
    remove: z.array(z.string()).default([]),
  },
  async (args) => {
    const results: string[] = [];
    for (const a of args.add) {
      const sym = a.symbol.toUpperCase();
      if (!inUniverse(sym)) {
        results.push(`SKIP ${sym}: not in universe (${universeSymbols().length} symbols available).`);
        continue;
      }
      await prisma.watchlist.upsert({
        where: { symbol: sym },
        create: { symbol: sym, note: a.note },
        update: { note: a.note },
      });
      results.push(`ADDED ${sym}`);
    }
    for (const r of args.remove) {
      await prisma.watchlist.deleteMany({ where: { symbol: r.toUpperCase() } });
      results.push(`REMOVED ${r.toUpperCase()}`);
    }
    return text(results.join("\n") || "no-op");
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
    getWatchlistTool,
    setWatchlistTool,
    proposeOrderTool,
  ],
});

export const GRQ_TOOL_NAMES = [
  "mcp__grq__get_portfolio",
  "mcp__grq__get_quotes",
  "mcp__grq__get_journal",
  "mcp__grq__write_journal",
  "mcp__grq__get_watchlist",
  "mcp__grq__set_watchlist",
  "mcp__grq__propose_order",
];
