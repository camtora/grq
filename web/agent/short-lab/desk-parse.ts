// Decision parsing + prompt suffixes for the Short Lab agent A/B (docs/SHORT-LAB.md Phase 2). Kept
// separate from the Options Desk parser so the two grammars can't drift — this one adds SHORT / COVER
// instead of BUY_OPTION / SELL_OPTION. Pure, no I/O.

export type ShortDeskCall = {
  action: "BUY" | "SELL" | "SHORT" | "COVER" | "HOLD" | "NONE";
  symbol: string | null;
  qty: number | null; // whole shares
  confidence: number | null;
  thesis: string | null;
};

const ACTIONS = new Set(["BUY", "SELL", "SHORT", "COVER", "HOLD", "NONE"]);

/** Pull the LAST fenced JSON decision out of a reply. Tolerant — returns null if nothing parseable. */
export function parseShortDeskCall(text: string): ShortDeskCall | null {
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
        action: action as ShortDeskCall["action"],
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

// CONTROL arm — long-only, exactly what the live fund does.
export const SHORTDESK_CONTROL_SUFFIX = `

---
You MANAGE this paper account — LONG ONLY (buy and sell stocks, exactly what the live fund does; no shorting). Decide your single best action RIGHT NOW given the book and market above, then END your reply with one fenced JSON block and nothing after it:
\`\`\`json
{"action":"BUY|SELL|HOLD|NONE","symbol":"TICKER or null","qty":<whole shares or null>,"confidence":<0-100 or null>,"thesis":"one or two sentences"}
\`\`\`
BUY = open/add (must fit cash + your dial's position cap) · SELL = trim/exit a name you HOLD · HOLD = unchanged · NONE = stay in cash. One action per session, your strongest, sized for conviction.`;

// TREATMENT arm — long PLUS the power to SHORT (bet against a name). Unbounded loss, margin, borrow cost.
export const SHORTDESK_TREATMENT_SUFFIX = `

---
You MANAGE this paper account and, unlike the live fund, you ALSO have one extra power: you may SHORT stocks — borrow and sell a name you expect to FALL, then COVER (buy back) later. This is how you bet AGAINST a stock, which the long-only fund cannot. But shorting is dangerous: the loss is UNBOUNDED (a stock can rise without limit), you post margin (a big move against you triggers a forced cover — a margin call), and you pay a modeled borrow fee to hold it. Short only with real conviction it will fall.

Decide your single best action RIGHT NOW, then END your reply with one fenced JSON block and nothing after it:
\`\`\`json
{"action":"BUY|SELL|SHORT|COVER|HOLD|NONE","symbol":"TICKER or null","qty":<whole shares or null>,"confidence":<0-100>,"thesis":"..."}
\`\`\`
BUY = open/add a long · SELL = trim/exit a long you HOLD · SHORT = open a new short (bet it falls; sized within the short cap; margin-checked) · COVER = buy back a short you HOLD · HOLD = unchanged · NONE = stay in cash. One action per session, your strongest, sized for conviction.`;
