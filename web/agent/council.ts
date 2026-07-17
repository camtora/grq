/**
 * The LLM Council (D115) — a five-lens advisory panel for high-stakes JUDGMENT.
 *
 * One Opus model argues a question from five deliberately-conflicting lenses (Contrarian,
 * First-Principles, Expansionist, Outsider, Executor), then a sixth Opus pass — the Chairman —
 * synthesizes them into ONE honest verdict. It exists to beat single-answer sycophancy: surface the
 * disagreement BEFORE a human (or the agent) trusts a call. Adapted from Karpathy's LLM Council, with
 * personas instead of different vendors.
 *
 * ADVISORY ONLY. Like the Race/Desk challengers, the council can only ever produce TEXT — it imports
 * no broker/order path and never touches the §6 gate (guardrail #1). It runs in two places:
 *   1. chat  — a Haiku router HARD-GATES stock-judgment questions into `conveneCouncil` (chat-server).
 *   2. agent — a `convene_council` tool the decision session is PROMPTED to call before a BUY.
 *
 * Runs on the Agent SDK / Cam's Max token (six Opus passes per convene), so it lives ONLY in the
 * agent+chat images (this file imports the SDK; the alpine web image must never import it — same rule
 * as sessions.ts/persona.ts). Kill without a deploy: GRQ_COUNCIL_ENABLED=false (see policy.ts COUNCIL).
 */
import { query } from "@anthropic-ai/claude-agent-sdk";
import { MODELS, COUNCIL } from "./policy";
import { alert } from "./alerts";
import { recordAgentUsage } from "./usage";

export type CouncilSeat = { key: string; label: string; emoji: string; brief: string };

// The five lenses. Each is prompted to stay STRICTLY in its lane — the value is the conflict, not a
// balanced take from every seat (that's the chairman's job).
export const SEATS: CouncilSeat[] = [
  {
    key: "contrarian",
    label: "The Contrarian",
    emoji: "⚖️",
    brief:
      "You are THE CONTRARIAN on an investment council. Pressure-test the idea. Name exactly what could go wrong and why: the strongest bear case, the disconfirming evidence, the way this thesis actually loses money, what the bulls are ignoring. Do NOT hedge into balance — your job is the downside. If the idea is genuinely sound, say precisely what would have to be true for it to fail anyway, and how you'd know early.",
  },
  {
    key: "first-principles",
    label: "The First-Principles Thinker",
    emoji: "🔬",
    brief:
      "You are THE FIRST-PRINCIPLES THINKER. Strip the question to its core. Are we even solving the right problem? What does this business fundamentally DO, and how does it actually make money? Rebuild the case from base rates, unit economics, and cash flows — not narrative or what's popular. Call out where the thesis is reasoning from vibes or consensus rather than from the ground up.",
  },
  {
    key: "expansionist",
    label: "The Expansionist",
    emoji: "🚀",
    brief:
      "You are THE EXPANSIONIST. Find the hidden upside and the bigger version of the idea. What asymmetric outcome are we under-weighting? The optionality, the second-order winner, the way this is bigger or more durable than it looks. Be the bull — but an HONEST one, not a hype man: anchor the upside to something real (a market, a moat, a catalyst), and size it.",
  },
  {
    key: "outsider",
    label: "The Outsider",
    emoji: "🌍",
    brief:
      "You are THE OUTSIDER — you bring a perspective from a totally different domain or worldview. What does someone OUTSIDE finance or this sector see that the insiders miss? Draw an analogy from another industry, ask the sharp naive question a first-time investor would, or name the cross-domain pattern (a platform shift, a commoditization, a regulatory tide) the specialists are too close to notice. Reframe the whole question.",
  },
  {
    key: "executor",
    label: "The Executor",
    emoji: "🔧",
    brief:
      "You are THE EXECUTOR. Ignore theory — say what to actually DO. If we act, what's the concrete move: direction, rough size, entry, a stop/invalidation, and a horizon? What's the Monday-morning first step? If the honest answer is 'do nothing / wait for X', say that plainly and name the trigger that would change it. Practical, decisive, no philosophizing.",
  },
];

const SEAT_SYSTEM = (s: CouncilSeat) =>
  `${s.brief}

You are one of five advisors to Alfred, an autonomous swing-trading fund (GRQ) run for two members, Cam & Graham. House rules bind the fund: it never shorts, never uses margin, never trades options; a §6 code gate and a conviction bar dispose of every order regardless of what you say. Stay STRICTLY in YOUR lens — do not write a balanced summary, the chairman does that. Reason ONLY from the CONTEXT provided (dossier, signals, quotes, portfolio); if the context doesn't support a claim, say so rather than inventing a number. Be concrete and specific to THIS name and THIS fund — no generic investing platitudes. 150–220 words. No preamble, no sign-off, no restating the question.`;

const CHAIR_SYSTEM = `You are THE CHAIRMAN of Alfred's investment council. Five advisors — a Contrarian, a First-Principles Thinker, an Expansionist, an Outsider, and an Executor — have just debated a question, and you have their takes. Synthesize them into ONE clear, honest verdict for Cam & Graham, the fund's two members.

- Weigh the lenses; where they conflict (downside vs upside, rethink-everything vs just-act), RESOLVE the tension and say why one wins here. Don't average — decide.
- Ground the verdict in the takes and the context. Note genuine disagreement rather than papering over it.
- Honour GRQ's rules: receipts over hype (no dressing up small edges), you are Alfred thinking out loud and not a licensed advisor, and the §6 gate + conviction bar + no-short/no-options/no-margin still bind — the council is advice, not an order.
- Keep it tight (a few short paragraphs). End with exactly these three lines:
**The one thing:** <the single most important takeaway / the call>
**Biggest risk:** <what to watch that would break it>
**First step:** <the concrete next action — or "nothing yet; revisit when <trigger>">`;

export type CouncilAdvisor = { key: string; label: string; emoji: string; take: string };
// `seated` is the honesty field: how many of the five lenses actually spoke. Without it a verdict
// synthesized from three seats is indistinguishable from one synthesized from five (D118d).
export type CouncilResult = { question: string; advisors: CouncilAdvisor[]; verdict: string; seated: { landed: number; total: number } };

// One-shot completion on Cam's Max token via the Agent SDK (no tools, context pre-injected).
// Returns the trimmed text, or null on any failure — a single seat dying can't sink the council.
//
// It cannot import runSession (sessions.ts → tools.ts → council.ts would cycle), so this is a
// deliberate copy of that loop — but it now records usage and alerts like runSession does. Until
// 2026-07-16 it did neither: a seat that ended non-success (error_max_turns) fell through the
// success-only branch below, returned null, and got filtered out of the panel without a word. Six
// Opus passes per convene wrote no AgentUsage row either, so the council was invisible to
// /admin/usage and to the 40M/day burn alarm. `label` is what makes a seat legible in both.
async function oneShot(label: string, model: string, system: string, user: string, noThinking = false): Promise<string | null> {
  console.log(`[session] ${label} starting (model=${model})`);
  try {
    const q = query({
      prompt: user,
      options: {
        model,
        systemPrompt: system,
        // 4, not 1. Every one of 345 successful one-shot passes on record used exactly ONE turn, so
        // the extra turns here are provably free — they are only ever consumed by the transient mode
        // that still tripped news-triage's cap of 3 on 2026-07-16. At maxTurns 1 a seat had zero
        // headroom for that, and a seat that trips it is a wasted Opus pass AND a quieter room.
        maxTurns: 4,
        // Per-call, NOT blanket: the SEATS and the chairman are Opus arguing a position — thinking is
        // the product there and disabling it would gut the council. Only the ROUTER (Haiku deciding
        // council-or-not) is classify-shaped. See SessionOpts.noThinking.
        ...(noThinking ? { thinking: { type: "disabled" as const } } : {}),
        permissionMode: "bypassPermissions",
        settingSources: [],
        allowedTools: [],
        stderr: (data: string) => console.error(`[session:${label}] ${data.slice(0, 400)}`),
      },
    });
    let out = "";
    let resultMsg: any = null;
    for await (const m of q) {
      if (m.type === "result") {
        resultMsg = m;
        if (m.subtype === "success") out = m.result;
        // A non-success seat used to vanish here. It is a wasted Opus pass AND a quieter room —
        // say so, the same way runSession does.
        else await alert("warning", `Council seat "${label}" ended: ${m.subtype}`, "", { category: "system" });
      }
    }
    await recordAgentUsage(label, model, resultMsg, out || null);
    return out.trim() || null;
  } catch (e) {
    await alert("warning", `Council seat "${label}" failed`, e instanceof Error ? e.message : String(e), { category: "system" });
    console.error("[council] oneShot failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

export function councilEnabled(): boolean {
  return COUNCIL.enabled;
}

/**
 * Convene the council on `question` with a pre-built `context` string (the fund + the name's dossier/
 * signals). Runs all five seats in PARALLEL (independent Opus one-shots), then the chairman
 * synthesizes. `onSeat` fires as each seat lands, for chat status streaming. Returns null when the
 * council is disabled or collapses (fewer than two seats, or the chairman fails) so callers can
 * fall back gracefully.
 */
export async function conveneCouncil(opts: {
  question: string;
  context: string;
  onSeat?: (label: string, landed: number, total: number) => void;
}): Promise<CouncilResult | null> {
  if (!COUNCIL.enabled) return null;
  const { question, context } = opts;

  const userFor = (s: CouncilSeat) =>
    `# QUESTION FOR THE COUNCIL\n${question}\n\n# CONTEXT — the fund and the name(s) in question. Reason ONLY from this.\n${context}\n\nGive your take as ${s.label}.`;

  let landed = 0;
  const takes = await Promise.all(
    SEATS.map(async (s) => {
      const take = await oneShot(`council:${s.key}`, MODELS.decision, SEAT_SYSTEM(s), userFor(s));
      landed += 1;
      try {
        opts.onSeat?.(s.label, landed, SEATS.length);
      } catch {
        /* status callback is best-effort */
      }
      return take ? { key: s.key, label: s.label, emoji: s.emoji, take } : null;
    }),
  );
  const advisors = takes.filter((t): t is CouncilAdvisor => t !== null);

  // A short room is a QUIETER room, not an obviously broken one: the chairman still writes a
  // confident verdict off whoever showed up, and a four-lens panel reads exactly like a five-lens
  // one. The whole point of five lenses is that they disagree — losing the Contrarian silently is
  // the failure that looks most like success. Surface it; `seated` lets callers say "4 of 5".
  const missing = SEATS.filter((s) => !advisors.some((a) => a.key === s.key));
  if (missing.length) {
    await alert(
      "warning",
      `Council convened short — ${advisors.length}/${SEATS.length} seats`,
      `Missing: ${missing.map((m) => m.label).join(", ")}. The verdict below was synthesized from the seats that landed.`,
      { category: "system" },
    );
  }
  if (advisors.length < 2) {
    await alert("warning", "Council collapsed — no verdict", `Only ${advisors.length}/${SEATS.length} seat(s) landed; falling back.`, { category: "system" });
    return null; // not enough of a room to be worth a verdict
  }

  const room = advisors.map((a) => `## ${a.label}\n${a.take}`).join("\n\n");
  const verdict = await oneShot(
    "council:chair",
    MODELS.decision,
    CHAIR_SYSTEM,
    `# QUESTION\n${question}\n\n# THE COUNCIL'S TAKES\n${room}\n\n# CONTEXT\n${context}\n\nDeliver the chairman's verdict.`,
  );
  if (!verdict) {
    await alert("warning", "Council chairman failed — no verdict", "The seats landed but the synthesis did not; falling back.", { category: "system" });
    return null;
  }
  return { question, advisors, verdict, seated: { landed: advisors.length, total: SEATS.length } };
}

/** How many lenses actually spoke — the header used to hardcode "five lenses" and say it whether five
 *  landed or three did, which is the same silence as the filtered nulls, just out loud (D118d). */
function seatedLine(r: CouncilResult): string {
  const { landed, total } = r.seated;
  if (landed === total) return `${total} lenses, one verdict`;
  const missing = SEATS.filter((s) => !r.advisors.some((a) => a.key === s.key)).map((s) => s.label);
  return `${landed} of ${total} lenses spoke (no ${missing.join(", no ")}), one verdict`;
}

/** Render a verdict as chat markdown: the verdict FIRST (answer up top), then the full room below. */
export function councilMarkdown(r: CouncilResult): string {
  const room = r.advisors.map((a) => `**${a.emoji} ${a.label}**\n\n${a.take}`).join("\n\n");
  return `🏛️ **The council convened** — ${seatedLine(r)}.\n\n${r.verdict}\n\n---\n\n### The room\n\n${room}`;
}

/** Compact text form for the AGENT's convene_council tool result (verdict first, then the room). */
export function councilToolText(r: CouncilResult): string {
  const room = r.advisors.map((a) => `— ${a.label} —\n${a.take}`).join("\n\n");
  // Tell the agent when the room was thin. A verdict from three lenses deserves less weight than one
  // from five, and it cannot know that from the text alone — the chairman writes with the same
  // confidence either way.
  const short =
    r.seated.landed < r.seated.total
      ? `\n\nNOTE: only ${r.seated.landed} of ${r.seated.total} lenses landed — this is a THINNER room than usual; weigh the verdict accordingly.`
      : "";
  return `THE COUNCIL DELIBERATED. Weigh this in your decision; it is advice, not an order — the §6 gate and your conviction bar still bind.${short}\n\nCHAIRMAN'S VERDICT:\n${r.verdict}\n\nTHE ROOM (for your reasoning; do not just repeat it):\n${room}`;
}

export type ChatRoute = { council: boolean; symbols: string[] };

/**
 * The chat HARD GATE (Haiku router). Decide whether a member's message is asking for JUDGMENT on a
 * specific stock or the portfolio — those go to the council; everything else (greetings, how-does-X
 * / learn questions, factual lookups, jokes) stays with normal Alfred. Fails OPEN to Alfred (council
 * false) on any parse/model error, so the chat is never blocked by a router hiccup.
 */
export async function routeChatToCouncil(message: string, focusSymbol?: string): Promise<ChatRoute> {
  if (!COUNCIL.enabled) return { council: false, symbols: [] };
  const focusHint = focusSymbol
    ? `\n\nContext: the member is currently viewing the stock page for ${focusSymbol.toUpperCase()}, so an ambiguous "it/this/here" most likely refers to ${focusSymbol.toUpperCase()}.`
    : "";
  const system = `You are the router for GRQ's investing chat. Decide if the member's message is asking for a JUDGMENT / OPINION / DECISION on a specific stock, ticker, holding, or the whole portfolio — e.g. "is NVDA a buy?", "should we trim XIC?", "what do you think of TD here?", "defend this position", "is this overvalued?", "should we take profits?". Those go to the COUNCIL.

Everything else does NOT: greetings and chit-chat; "how does X work" / teach-me / definition questions; factual lookups ("what's our cash?", "what do we hold?", "what happened today?"); options-education questions; anything not asking for a call on a name.

Respond with ONLY a compact JSON object, no prose, no code fence:
{"council": <true|false>, "symbols": ["TICKER", ...]}
symbols = the tickers or company names the judgment is about (UPPERCASE tickers when obvious; use the company name if you don't know the ticker; [] when it's portfolio-wide or none). When council is false, symbols must be [].`;

  const raw = await oneShot("council:router", MODELS.triage, system, `MESSAGE:\n${message}${focusHint}`, true);
  if (!raw) return { council: false, symbols: [] };
  return parseRouteJson(raw, COUNCIL.maxSymbols);
}

/**
 * Parse the router model's reply into a ChatRoute. Tolerant of the ways a model wraps JSON — a
 * ```json fence, leading prose, trailing commentary — by slicing to the outermost braces. Fails
 * CLOSED to Alfred (council:false) on anything it can't read, and never returns symbols when the
 * route isn't the council. Pure + exported so it's unit-testable without a live model. */
export function parseRouteJson(raw: string, maxSymbols: number): ChatRoute {
  const open = raw.indexOf("{");
  const close = raw.lastIndexOf("}");
  if (open < 0 || close <= open) return { council: false, symbols: [] };
  try {
    const parsed = JSON.parse(raw.slice(open, close + 1)) as { council?: unknown; symbols?: unknown };
    const council = parsed.council === true;
    if (!council) return { council: false, symbols: [] };
    const symbols = Array.isArray(parsed.symbols)
      ? parsed.symbols
          .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
          .map((s) => s.trim())
          .slice(0, Math.max(0, maxSymbols))
      : [];
    return { council: true, symbols };
  } catch {
    return { council: false, symbols: [] };
  }
}
