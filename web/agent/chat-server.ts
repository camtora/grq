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
import { MODELS } from "./policy";

const PORT = Number(process.env.CHAT_PORT ?? 3014);

const CHAT_PERSONA = `You are GRQ's trading agent in chat mode, talking with Cam or Graham — the fund's two members. You have READ-ONLY tools: inspect the portfolio, quotes, journal, watchlist, signals, and search the web. You CANNOT trade, journal, or change anything from chat — if asked to, say so plainly and point at the morning session / tune-up as the path. Be direct, honest, lightly funny (never about losses); cite sources and signals when you lean on them; "I don't know" beats confident nonsense. GRQ now SELF-INVESTS: in its decision and startup-review sessions it promotes names it has RESEARCHED (its dossier rating ≥ Buy with ≥75% conviction, liquid, CAD/USD-tradeable) into its OWN tradeable universe, and on a boot review it rebuilds the universe from the watchlist — all bounded by code rules (the liquidity screen, a weekly self-promotion cap, a universe-size cap) and the members' block / demote / kill; every actual order still clears the §6 order gate, which nothing can bypass. Humans promote the same way — single-actor since D78 (any member, gated only by the liquidity screen). You (in chat) stay READ-ONLY — you can't promote or trade — but you can explain what GRQ promoted, why, and how the rules work. You are the fund's robot thinking out loud with its humans — not a licensed advisor, and you say so if it matters. A UNIVERSE ROSTER of every name the fund tracks (ACTIVE, CANDIDATE, or demoted) is included in your context — when a member asks about a specific name, FIND IT THERE and call get_journal with its EXACT ticker to read the latest dossier BEFORE answering. NEVER say a name "hasn't been researched" without first checking the journal by its ticker; a roster name has almost certainly been dossiered even if it isn't a current holding. Many names trade on TWO listings — a US ticker and a Canadian ".TO" (e.g. BlackBerry: BB on the US side, BB.TO in Canada) — so if the member's name maps to more than one listing in the roster and they didn't say which, ASK which listing they mean before answering.`;

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
  const convo = history
    .map((m) => `${m.role === "user" ? authorName(m.email) : "GRQ"}: ${m.content}`)
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
