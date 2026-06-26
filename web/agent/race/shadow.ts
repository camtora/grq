// Shared decision-parsing for The Race — used by BOTH the always-on shadow path (sessions.ts)
// and the Bull-Race engine (engine.ts). A challenger/bull ends its reply with a fenced ```json
// block; we pull the structured call out of it. Pure, no I/O. (Extracted from sessions.ts so the
// two consumers can't drift.)

export type Proposal = {
  action: string; // BUY | SELL | HOLD | NONE
  symbol: string | null;
  qty: number | null;
  confidence: number | null;
  thesis: string | null;
};

export const ACTIONS = new Set(["BUY", "SELL", "HOLD", "NONE"]);

/** Pull the structured decision out of a reply — the LAST JSON object in the text. Tolerant:
 *  returns null if nothing parseable. */
export function parseProposal(text: string): Proposal | null {
  if (!text) return null;
  const fences = [...text.matchAll(/```json\s*([\s\S]*?)```/gi)].map((m) => m[1]);
  const candidates = fences.length ? [fences[fences.length - 1]] : [];
  const lastBrace = text.lastIndexOf("{");
  if (!candidates.length && lastBrace >= 0) candidates.push(text.slice(lastBrace, text.lastIndexOf("}") + 1));
  for (const c of candidates) {
    try {
      const o = JSON.parse(c.trim());
      const action = String(o.action ?? "").toUpperCase();
      if (!ACTIONS.has(action)) continue;
      const qty = Number.isFinite(Number(o.qty)) ? Math.trunc(Number(o.qty)) : null;
      const confidence = Number.isFinite(Number(o.confidence)) ? Math.trunc(Number(o.confidence)) : null;
      return {
        action,
        symbol: o.symbol ? String(o.symbol).toUpperCase().replace(/[^A-Z0-9.\-]/g, "") || null : null,
        qty: qty && qty > 0 ? qty : null,
        confidence: confidence != null ? Math.max(0, Math.min(100, confidence)) : null,
        thesis: o.thesis ? String(o.thesis).slice(0, 800) : null,
      };
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

// The shadow-mode suffixes (the existing always-on Race) — a challenger only states what it WOULD
// do; the champion is the one that acts.
export const SHADOW_DECISION_SUFFIX = `

---
SHADOW MODE — you are a CHALLENGER in GRQ's model bake-off ("The Race"). You have NO tools and you place NO orders; the live agent (the champion) acts, you only state what YOU would do given the EXACT same information above. Do your normal reasoning briefly, then END your reply with a single fenced JSON block and nothing after it:
\`\`\`json
{"action":"BUY|SELL|HOLD|NONE","symbol":"TICKER or null","qty":<whole shares or null>,"confidence":<0-100 or null>,"thesis":"one or two sentences on why"}
\`\`\`
If you'd place several orders, put your single highest-conviction one in the JSON and describe the rest in your reasoning. action: BUY/SELL = a trade you'd place now · HOLD = stay in current positions, no change · NONE = nothing actionable / stay in cash. Use the SAME ≥75% conviction discipline the champion is held to.`;

export const SHADOW_NARRATIVE_SUFFIX = `

---
SHADOW MODE — you are a CHALLENGER in GRQ's model bake-off ("The Race"). Write the SAME piece the task asks for, based ONLY on the information given above (you have no tools). Your ENTIRE response is that piece — no preamble about being a challenger.`;

// Bull-Race suffix — UNLIKE the shadow mode, a bull's call ACTUALLY executes in its own paper
// account. Same JSON shape (so parseProposal reads it), bull-appropriate framing.
export const BULL_DECISION_SUFFIX = `

---
You MANAGE this paper account. Decide your single best action RIGHT NOW given the book and the market above, then END your reply with one fenced JSON block and nothing after it:
\`\`\`json
{"action":"BUY|SELL|HOLD|NONE","symbol":"TICKER or null","qty":<whole shares or null>,"confidence":<0-100 or null>,"thesis":"one or two sentences on why"}
\`\`\`
action: BUY = open/add (must fit your cash + your dial's position cap) · SELL = trim/exit a name you HOLD · HOLD = keep the book unchanged · NONE = stay in cash. Pick symbols from the tradeable universe (or a name you already hold). One action per session — your strongest. This trade is REAL in your account, so size it for conviction.`;
