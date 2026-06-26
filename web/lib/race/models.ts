// The Race — model id → display name. Shared by the overview tiles, the day matrix, and the
// agent-side records. Driven off the configured slate (GRQ_RACE_CHALLENGERS), so a newly-added
// model still renders a readable name via the vendor fallbacks below rather than a raw slug.

/** Pretty model name; falls back to a cleaned-up slug for anything unmapped. */
export function modelLabel(id: string): string {
  const s = id.toLowerCase();
  if (s.includes("opus")) return "Opus 4.8";
  if (s.includes("sonnet")) return "Sonnet 4.6";
  if (s.includes("haiku")) return "Haiku 4.5";
  if (s.includes("gpt-5.1")) return "GPT-5.1";
  if (s.includes("gpt-5")) return "GPT-5";
  if (s.includes("gpt")) return "GPT";
  if (s.includes("gemini-3.1")) return "Gemini 3.1 Pro";
  if (s.includes("gemini")) return "Gemini";
  if (s.includes("glm-4.6")) return "GLM-4.6";
  if (s.includes("glm")) return "GLM";
  if (s.includes("deepseek")) return "DeepSeek V3";
  if (s.includes("qwen")) return "Qwen";
  if (s.includes("grok-4.3")) return "Grok 4.3";
  if (s.includes("grok")) return "Grok";
  if (s.includes("llama-4")) return "Llama 4 Maverick";
  if (s.includes("llama")) return "Llama";
  if (s.includes("mistral")) return "Mistral";
  // Unknown slug like "vendor/model-name" → "Model Name".
  const tail = id.includes("/") ? id.slice(id.lastIndexOf("/") + 1) : id;
  return tail.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** A compact column label for the day matrix (tight headers). */
export function shortModelLabel(id: string): string {
  return modelLabel(id).replace(/\s+\d.*$/, "").trim() || modelLabel(id);
}

/** Map a model id → its glossary key (lib/glossary.ts) so a label can render as a tap-to-explain
 *  <Term> for Graham. Null when there's no entry (Term then falls back to the agent explainer). */
export function glossaryKeyForModel(id: string): string | null {
  const s = id.toLowerCase();
  if (s.includes("opus")) return "opus";
  if (s.includes("sonnet")) return "sonnet";
  if (s.includes("haiku")) return "haiku";
  if (s.includes("gpt")) return "gpt";
  if (s.includes("gemini")) return "gemini";
  if (s.includes("glm")) return "glm";
  if (s.includes("deepseek")) return "deepseek";
  if (s.includes("grok")) return "grok";
  if (s.includes("llama")) return "llama";
  return null;
}

/** A challenger ends its prose with a fenced ```json decision block — we already parse that into
 *  the action/P&L, so strip the trailing block from the text we display. Handles a closed fence
 *  and an unclosed trailing one; no-op when there's no such block (e.g. the champion's note). */
export function stripDecisionBlock(text: string): string {
  return text
    .replace(/\s*```(?:json)?\s*\{[\s\S]*?\}\s*```\s*$/i, "")
    .replace(/\s*```(?:json)?\s*\{[\s\S]*?\}\s*$/i, "")
    .trimEnd();
}
