// The Race — Phase 2 (D68): a tiny OpenRouter chat-completion client for SHADOW challengers only.
//
// Phase 1 already made the shadow path one-shot / no-tools, so a non-Claude challenger is a single
// chat *completion* — no MCP, no Agent SDK, no function-calling loop. This file is that one call.
// It NEVER imports a broker/order path: a challenger can only ever produce text (guardrail #1).
//
// Routing: Claude challengers (`claude-*`) stay on the Anthropic SDK + Cam's Max token (free);
// anything that looks like a `vendor/model` slug is metered $ and comes through here.

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export type ChatResult = { text: string; inTokens: number; outTokens: number; costUsd: number };

/** A challenger id routes to OpenRouter when it's a `vendor/model` slug (e.g. `deepseek/deepseek-chat`,
 *  `openai/gpt-5.1`). Claude ids (`claude-sonnet-4-6`) ride the Max-token SDK path instead. */
export function isOpenRouterModel(model: string): boolean {
  return model.includes("/") && !model.startsWith("claude-");
}

/** One-shot completion against OpenRouter. Returns null when unconfigured (no key) or on ANY
 *  failure — the caller logs + skips so a single provider's outage can't break the champion or the
 *  other challengers. `usage:{include:true}` makes OpenRouter return real per-call $ cost. */
export async function chatComplete(opts: {
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<ChatResult | null> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 120_000);
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        // OpenRouter attribution headers (optional, nice for the dashboard)
        "HTTP-Referer": "https://grq.camerontora.ca",
        "X-Title": "GRQ - The Race", // ASCII only: HTTP header values must be Latin-1 (no em-dash)
      },
      body: JSON.stringify({
        model: opts.model,
        usage: { include: true },
        // Generous ceiling: gemini/gpt are reasoning models — they spend tokens thinking BEFORE the
        // visible answer, so a tight cap can starve the closing JSON / report. Billed on actual use.
        max_tokens: opts.maxTokens ?? 8000,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${body.slice(0, 240)}`);
    }
    const d: any = await res.json();
    if (d?.error) throw new Error(typeof d.error === "string" ? d.error : JSON.stringify(d.error).slice(0, 240));
    const text = String(d?.choices?.[0]?.message?.content ?? "");
    const u = d?.usage ?? {};
    return {
      text,
      inTokens: Number(u.prompt_tokens) || 0,
      outTokens: Number(u.completion_tokens) || 0,
      costUsd: Number(u.cost) || 0,
    };
  } catch (e) {
    console.error(`[openrouter] ${opts.model} failed:`, e instanceof Error ? e.message : e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
