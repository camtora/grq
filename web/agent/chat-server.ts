/**
 * GRQ chat server — the members' window for talking to the agent.
 * READ-ONLY by construction: the tool server wired here has no propose_order
 * and no writes. A persuasive chat can never become a trading backdoor.
 *
 * Runs as its own container (same image as the agent), internal port only;
 * the web app proxies /api/chat to it and streams SSE through.
 */
import http from "node:http";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { prisma } from "../lib/db";
import { buildContext } from "./context";
import { computeSignals, signalsOneLine } from "./signals";
import { makeReadOnlyServer, GRQ_READONLY_TOOL_NAMES } from "./tools";
import { MODELS, HARD, COUNCIL } from "./policy";
import { routeChatToCouncil, conveneCouncil, councilMarkdown, councilEnabled } from "./council";

const PORT = Number(process.env.CHAT_PORT ?? 3014);

const CHAT_PERSONA = `You are Alfred — the fund's trading agent — in chat mode, talking with Cam or Graham, the fund's two members. (GRQ is the fund/app; you are Alfred, its manager. Always refer to yourself as Alfred.) You have READ-ONLY tools: inspect the portfolio, quotes, journal, watchlist, signals, and search the web. You CANNOT trade, journal, or change anything from chat — if asked to, say so plainly and point at the morning session / tune-up as the path. Be direct, honest, lightly funny (never about losses); cite sources and signals when you lean on them; "I don't know" beats confident nonsense. GRQ now SELF-INVESTS: in its decision and startup-review sessions it promotes names it has RESEARCHED (its dossier rating ≥ Buy with ≥${HARD.minBuyConfidence}% conviction, liquid, CAD/USD-tradeable) into its OWN tradeable universe, and on a boot review it rebuilds the universe from the watchlist — all bounded by code rules (the liquidity screen, a weekly self-promotion cap, a universe-size cap) and the members' block / demote / kill; every actual order still clears the §6 order gate, which nothing can bypass. Humans promote the same way — single-actor since D78 (any member, gated only by the liquidity screen). You (in chat) stay READ-ONLY — you can't promote or trade — but you can explain what GRQ promoted, why, and how the rules work. You are Alfred, thinking out loud with the fund's humans — not a licensed advisor, and you say so if it matters. A UNIVERSE ROSTER of every name the fund tracks (ACTIVE, CANDIDATE, or demoted) is included in your context — when a member asks about a specific name, FIND IT THERE and call get_journal with its EXACT ticker to read the latest dossier BEFORE answering. NEVER say a name "hasn't been researched" without first checking the journal by its ticker; a roster name has almost certainly been dossiered even if it isn't a current holding. Many names trade on TWO listings — a US ticker and a Canadian ".TO" (e.g. BlackBerry: BB on the US side, BB.TO in Canada) — so if the member's name maps to more than one listing in the roster and they didn't say which, ASK which listing they mean before answering.

OPTIONS EDUCATION: GRQ has an options learning portal at /options (a Learn tab, an interactive payoff calculator, and the Options Desk experiment). The live fund still NEVER trades options (a hard guardrail, unchanged) — but you can and should help Cam & Graham LEARN options. You may: explain how calls/puts, strikes, premiums, the Greeks, and the four starter strategies (long call, long put, covered call, cash-secured put) work in plain English; walk through the Options Desk experiment's ACTUAL fake positions (call get_options_desk to see the treatment Opus's open + resolved contracts, with break-evens and decay); and SUGGEST hypothetical contracts to learn from — always framed as education, never advice, and never executable. When you suggest or describe a contract, point them at the calculator (e.g. /options?tab=calculator&sym=NVDA&strat=long-call) so they can see its payoff and watch it decay. Be clear that modeled option prices are educational, US-listed names only, and that none of this is a recommendation to trade.

THE LEARN PORTAL (D110 + the D111 framework): GRQ also has a market-education portal at /learn — eight plain-English courses on how the market ITSELF works (not stock picks), plus /learn/glossary (every term the app can explain, searchable). Each course page is a SYLLABUS; every lesson has its own page (/learn/<course>/<lesson>) with diagrams, real-data charts, curated videos, inline self-checks, and live "receipts" — the fund's OWN current numbers (real fills, its actual drawdown, the vs-XIC gap, the live dials) — so when you cite a lesson you're pointing at real data, not a textbook. Every course ends in a GRADED EXAM (members only; pass ≥80%, unlimited retakes, best score stands with the attempt count shown) and the hub publishes the class standings — if a member asks how they're doing, that's /learn. When a member asks a how-does-this-work question, ANSWER it plainly first, then deep-link the course that goes deeper. The map (course titles renamed in D111; slugs unchanged): /learn/the-machine ("Market structure": what a stock is, exchanges, tickers & CDR look-alikes, market hours & overnight gaps, indices) · /learn/how-a-price-happens ("How prices work": bid/ask & the spread, order types + an interactive toy order book, market makers & liquidity, what moves prices, why quotes disagree) · /learn/owning-a-piece ("Owning stocks": dividends, splits & buybacks, ACB & paper gains, stocks vs ETFs, CAD/USD currency risk) · /learn/reading-the-game ("Reading the data": earnings & guidance, analyst ratings, 13F/insider/congress trails, technicals honestly framed, news & the crowd) · /learn/risk ("Risk": volatility, drawdown arithmetic, sizing & diversification, leverage & margin calls, why shorting and day trading are banned) · /options (Course 6 — the options portal above; its exam lives at /learn/options/exam) · /learn/the-long-game ("Long-term investing": compounding + an interactive compounding machine, the XIC benchmark, fee gravity & TFSA/RRSP tax drag, behavioural traps, when to sell) · /learn/how-grq-works ("How GRQ works": how YOU work, explained for a learner: the agent proposes / the gate disposes, the guardrails as risk management, the scoreboard & the operating-cost hurdle, receipts-before-trades, the soak). This is the literacy pillar: every number explainable, honest about what beats what, never advice.`;

type ChatBody = { owner?: string; email?: string; message?: string; symbol?: string };

function sse(res: http.ServerResponse, event: object) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function authorName(email: string): string {
  if (email.startsWith("cameron")) return "Cam";
  if (email.startsWith("g.j.appleby")) return "Graham";
  return email;
}

async function symbolFocus(symbol: string): Promise<string> {
  const sym = symbol.toUpperCase();
  const [sig, entries] = await Promise.all([
    computeSignals(sym).catch(() => null),
    prisma.journalEntry.findMany({ where: { symbol: sym }, orderBy: { at: "desc" }, take: 5 }),
  ]);
  return `\n# FOCUS SYMBOL: ${sym}
Signals: ${sig ? signalsOneLine(sig) : "(no bar history)"}
Recent journal on ${sym}:
${entries.map((j) => `- [${j.kind}] ${j.title}: ${j.body.slice(0, 200).replace(/\n/g, " ")}`).join("\n") || "(nothing yet)"}\n`;
}

// The FULL tracked roster (ACTIVE + CANDIDATE + DEMOTED — never RETIRED), grouped by company so
// the chat knows EVERYTHING researched (not just the held/focus names buildContext carries) and
// can spot a name that trades on two listings (US + Canadian ".TO") to ask which one is meant.
async function universeRoster(): Promise<string> {
  const members = await prisma.universeMember.findMany({
    where: { status: { not: "RETIRED" } },
    select: { symbol: true, name: true, currency: true, status: true },
    orderBy: { name: "asc" },
  });
  if (members.length === 0) return "";
  const byCompany = new Map<string, { name: string; listings: string[]; multi: boolean }>();
  for (const m of members) {
    const key = (m.name || m.symbol).trim().toLowerCase();
    const tag = `${m.symbol} (${m.currency}${m.status === "ACTIVE" ? "" : `, ${m.status.toLowerCase()}`})`;
    const cur = byCompany.get(key);
    if (cur) {
      cur.listings.push(tag);
      cur.multi = true;
    } else {
      byCompany.set(key, { name: (m.name || m.symbol).trim(), listings: [tag], multi: false });
    }
  }
  const lines = [...byCompany.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => `- ${c.name}: ${c.listings.join(" · ")}${c.multi ? "  ⚠ multiple listings — ASK which unless the member specified" : ""}`);
  return `\n# UNIVERSE ROSTER — every name the fund tracks. Each has (almost certainly) been researched; read its latest dossier with get_journal{symbol} before answering about it.\n${lines.join("\n")}\n`;
}

// The chat HARD GATE (D115): a stock-judgment question is answered by the LLM Council — five Opus
// lenses + a chairman verdict — instead of a single Alfred pass. Builds the council's context from
// the fund state, the roster, and the named symbols' dossiers/signals, streams status as each seat
// lands, and returns the verdict markdown (persisted by the caller) — or null if the council
// collapses, so the caller can fall back to normal Alfred.
async function runChatCouncil(
  res: http.ServerResponse,
  opts: { message: string; ctx: string; roster: string; symbols: string[]; focusSymbol?: string },
): Promise<string | null> {
  const syms = [
    ...new Set([...opts.symbols, ...(opts.focusSymbol ? [opts.focusSymbol] : [])].map((s) => s.toUpperCase())),
  ].slice(0, COUNCIL.maxSymbols);
  const focusBlocks = syms.length
    ? (await Promise.all(syms.map((s) => symbolFocus(s).catch(() => "")))).join("")
    : "";
  const context = `${opts.ctx}${opts.roster}${focusBlocks}`;
  sse(res, { type: "status", text: "Convening the council — five lenses…" });
  const result = await conveneCouncil({
    question: opts.message,
    context,
    onSeat: (label, landed, total) => sse(res, { type: "status", text: `${label} weighed in (${landed}/${total})…` }),
  });
  if (!result) return null;
  const md = councilMarkdown(result);
  sse(res, { type: "text", text: md });
  return md;
}

async function handleChat(res: http.ServerResponse, body: ChatBody) {
  const email = body.email?.trim().toLowerCase();
  const message = body.message?.trim();
  if (!email || !message || message.length > 4000) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "bad request" }));
    return;
  }
  // The thread belongs to `owner`; `email` is the author. Each member's thread is
  // its own conversation, so the agent only sees this owner's history.
  const owner = body.owner?.trim().toLowerCase() || email;

  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });

  await prisma.chatMessage.create({ data: { owner, email, role: "user", content: message } });

  const [ctx, history, roster] = await Promise.all([
    buildContext(),
    prisma.chatMessage.findMany({ where: { owner }, orderBy: { at: "desc" }, take: 20 }),
    universeRoster(),
  ]);
  history.reverse();
  const focus = body.symbol ? await symbolFocus(body.symbol) : "";

  // HARD GATE (D115): route stock-judgment questions through the LLM Council. A cheap Haiku router
  // decides; on any router/council failure we fall through to normal Alfred so a member never gets
  // a blocked chat.
  if (councilEnabled()) {
    try {
      const route = await routeChatToCouncil(message, body.symbol);
      if (route.council) {
        const md = await runChatCouncil(res, {
          message,
          ctx,
          roster,
          symbols: route.symbols,
          focusSymbol: body.symbol,
        });
        if (md) {
          await prisma.chatMessage.create({ data: { owner, email: "agent", role: "assistant", content: md } });
          sse(res, { type: "done" });
          res.end();
          return;
        }
      }
    } catch (e) {
      console.error("[chat] council gate error, falling back to Alfred:", e instanceof Error ? e.message : e);
    }
  }

  const convo = history
    .map((m) => `${m.role === "user" ? authorName(m.email) : "Alfred"}: ${m.content}`)
    .join("\n\n");

  const prompt = `${ctx}${roster}${focus}
# CONVERSATION (most recent last — reply to the final message)
${convo}`;

  let finalText = "";
  try {
    const q = query({
      prompt,
      options: {
        model: MODELS.decision,
        systemPrompt: CHAT_PERSONA,
        maxTurns: 12,
        permissionMode: "bypassPermissions",
        settingSources: [],
        mcpServers: { grq: makeReadOnlyServer() },
        allowedTools: ["WebSearch", "WebFetch", ...GRQ_READONLY_TOOL_NAMES],
        stderr: (d: string) => console.error(`[chat] ${d.slice(0, 300)}`),
      },
    });
    for await (const m of q) {
      if (m.type === "assistant") {
        for (const block of m.message.content) {
          if (block.type === "text" && block.text) {
            finalText += (finalText ? "\n\n" : "") + block.text;
            sse(res, { type: "text", text: block.text });
          } else if (block.type === "tool_use") {
            sse(res, {
              type: "status",
              text: `${String(block.name).replace("mcp__grq__", "").replace(/_/g, " ")}…`,
            });
          }
        }
      }
      if (m.type === "result" && m.subtype !== "success") {
        sse(res, { type: "error", text: `session ended: ${m.subtype}` });
      }
    }
  } catch (e) {
    sse(res, { type: "error", text: e instanceof Error ? e.message : String(e) });
  }

  if (finalText) {
    await prisma.chatMessage.create({ data: { owner, email: "agent", role: "assistant", content: finalText } });
  }
  sse(res, { type: "done" });
  res.end();
}

// Plain-English explainer (the literacy pillar). A cheap one-shot, no tools —
// the web layer caches the result so each concept is explained once.
async function handleExplain(res: http.ServerResponse, body: { term?: string }) {
  const term = body.term?.trim();
  if (!term || term.length > 120) {
    res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: "bad term" }));
    return;
  }
  let text = "";
  try {
    const q = query({
      prompt: `Explain this to a smart non-expert investor in 2–3 plain, concrete sentences: "${term}". If it's a tactic (e.g. a shell company), say plainly why someone would use one. No fluff, no boilerplate disclaimers. If it isn't really a finance/investing concept, say so in one line.`,
      options: {
        model: MODELS.triage,
        systemPrompt:
          "You are GRQ's plain-English explainer. You make finance and investing concepts legible to a smart non-expert: 2–3 short sentences, concrete, honest, never jargon-to-explain-jargon. The financial-literacy pillar in action.",
        maxTurns: 1,
        permissionMode: "bypassPermissions",
        settingSources: [],
        allowedTools: [],
        stderr: () => {},
      },
    });
    for await (const m of q) {
      if (m.type === "result" && m.subtype === "success") text = m.result;
    }
  } catch {
    res.writeHead(502, { "content-type": "application/json" }).end(JSON.stringify({ error: "explain failed" }));
    return;
  }
  res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ body: text || "No explanation available." }));
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200).end("ok");
    return;
  }
  if (req.method === "POST" && req.url === "/explain") {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      let body: { term?: string } = {};
      try {
        body = JSON.parse(data);
      } catch {
        res.writeHead(400).end();
        return;
      }
      handleExplain(res, body).catch(() => {
        try {
          res.writeHead(502).end();
        } catch {
          /* already closed */
        }
      });
    });
    return;
  }
  if (req.method === "POST" && req.url === "/chat") {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      let body: ChatBody = {};
      try {
        body = JSON.parse(data);
      } catch {
        res.writeHead(400).end();
        return;
      }
      handleChat(res, body).catch((e) => {
        console.error("[chat] fatal", e);
        try {
          res.end();
        } catch {
          /* already closed */
        }
      });
    });
    return;
  }
  res.writeHead(404).end();
});

server.listen(PORT, () => console.log(`[grq-chat] listening on :${PORT}`));
