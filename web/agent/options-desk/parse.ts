// Decision parsing + prompt suffixes for the Options Desk (docs/THE-OPTIONS-DESK.md). Kept separate
// from the Race parser (agent/race/shadow.ts) so the two can't drift — the desk grammar is a
// superset that adds BUY_OPTION / SELL_OPTION. Pure, no I/O.

export type DeskCall = {
  action: "BUY" | "SELL" | "HOLD" | "NONE" | "BUY_OPTION" | "SELL_OPTION";
  symbol: string | null; // stock symbol OR option underlying
  qty: number | null; // whole shares (stock) or whole contracts (option)
  right: "CALL" | "PUT" | null; // option calls only
  bias: "ATM" | "SLIGHTLY_OTM" | null; // option calls only — coarse aggressiveness, NOT a raw strike
  confidence: number | null;
  thesis: string | null;
};

const STOCK = new Set(["BUY", "SELL", "HOLD", "NONE"]);
const OPTION = new Set(["BUY_OPTION", "SELL_OPTION"]);

/** Pull the LAST fenced JSON decision out of a reply. Tolerant — returns null if nothing parseable. */
export function parseDeskCall(text: string): DeskCall | null {
  if (!text) return null;
  const fences = [...text.matchAll(/```json\s*([\s\S]*?)```/gi)].map((m) => m[1]);
  const candidates = fences.length ? [fences[fences.length - 1]] : [];
  const lastBrace = text.lastIndexOf("{");
  if (!candidates.length && lastBrace >= 0) candidates.push(text.slice(lastBrace, text.lastIndexOf("}") + 1));
  for (const c of candidates) {
    try {
      const o = JSON.parse(c.trim());
      const action = String(o.action ?? "").toUpperCase();
      if (!STOCK.has(action) && !OPTION.has(action)) continue;
      const qty = Number.isFinite(Number(o.qty)) ? Math.trunc(Number(o.qty)) : null;
      const confidence = Number.isFinite(Number(o.confidence)) ? Math.trunc(Number(o.confidence)) : null;
      const rightRaw = String(o.right ?? "").toUpperCase();
      const biasRaw = String(o.bias ?? "").toUpperCase().replace(/[\s-]/g, "_");
      return {
        action: action as DeskCall["action"],
        symbol: (o.symbol ?? o.underlying) ? String(o.symbol ?? o.underlying).toUpperCase().replace(/[^A-Z0-9.\-]/g, "") || null : null,
        qty: qty && qty > 0 ? qty : null,
        right: rightRaw === "CALL" || rightRaw === "PUT" ? rightRaw : null,
        bias: biasRaw === "ATM" || biasRaw === "SLIGHTLY_OTM" ? biasRaw : null,
        confidence: confidence != null ? Math.max(0, Math.min(100, confidence)) : null,
        thesis: o.thesis ? String(o.thesis).slice(0, 800) : null,
      };
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

// CONTROL arm — stock-only, identical discipline to a Bull. (Mirrors BULL_DECISION_SUFFIX.)
export const DESK_CONTROL_SUFFIX = `

---
You MANAGE this paper account (stocks only — exactly what the live fund does). Decide your single best action RIGHT NOW given the book and market above, then END your reply with one fenced JSON block and nothing after it:
\`\`\`json
{"action":"BUY|SELL|HOLD|NONE","symbol":"TICKER or null","qty":<whole shares or null>,"confidence":<0-100 or null>,"thesis":"one or two sentences"}
\`\`\`
BUY = open/add (must fit cash + your dial's position cap) · SELL = trim/exit a name you HOLD · HOLD = unchanged · NONE = stay in cash. One action per session, your strongest. This trade is REAL in your account — size it for conviction.`;

// TREATMENT arm — the superset: stocks PLUS buy-to-open calls/puts (defined risk).
export const DESK_TREATMENT_SUFFIX = `

---
You MANAGE this paper account, and unlike the live fund you ALSO have one extra power: you may BUY (open) call or put OPTIONS on US-listed names — never sell/write them, never spreads. A call profits if the stock RISES; a put profits if it FALLS (this is how you express a bearish view — the stock fund cannot). Buying an option is DEFINED RISK: the most you can lose is the premium you pay. Options expire and decay, so only buy when you expect a real MOVE within ~1-2 months.

Decide your single best action RIGHT NOW, then END your reply with one fenced JSON block and nothing after it. Use ONE of these shapes:
- Stock:  {"action":"BUY|SELL|HOLD|NONE","symbol":"TICKER or null","qty":<whole shares or null>,"confidence":<0-100>,"thesis":"..."}
- Option: {"action":"BUY_OPTION","symbol":"US_UNDERLYING","right":"CALL|PUT","bias":"ATM|SLIGHTLY_OTM","qty":<whole contracts>,"confidence":<0-100>,"thesis":"..."}
- Close:  {"action":"SELL_OPTION","symbol":"US_UNDERLYING","right":"CALL|PUT","qty":<contracts or null=all>,"confidence":<0-100>,"thesis":"..."}
\`\`\`json
{"action":"...","symbol":"...","right":null,"bias":null,"qty":null,"confidence":0,"thesis":"..."}
\`\`\`
You pick the underlying + direction (right) + a COARSE bias (ATM = at-the-money, SLIGHTLY_OTM = cheaper/more leveraged) — the desk resolves the exact strike/expiry (next ~30-60-day expiry) deterministically. One contract = 100 shares of exposure. Options are US-only (CA names have none). One action per session, your strongest, sized for conviction.`;
