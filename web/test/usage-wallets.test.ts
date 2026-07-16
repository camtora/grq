import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isMeteredModel, splitByWallet } from "@/lib/usage";

// ONE TABLE, TWO WALLETS (D118d). AgentUsage holds both Claude-on-Max (tokens are the scarce thing;
// the $ is NOTIONAL — a flat subscription, no money moves) and OpenRouter challengers (real dollars
// from a prepaid balance). Summing them was wrong in both directions at once: the 40M/day burn alarm
// counted ~1M/day of metered tokens that never touched the quota, and /tokens reported notional Max
// cost as money spent.
//
// This is the class of bug the parity test CANNOT catch: the rule was wired everywhere and simply
// wrong. The defence is arithmetic, not wiring — so this file pins the arithmetic.

const row = (model: string, tokens: number, costMicroUsd = 0) => ({
  model,
  label: "x",
  at: new Date(0),
  inputTokens: tokens,
  outputTokens: 0,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
  costMicroUsd,
});

describe("isMeteredModel — which wallet does this model spend?", () => {
  it("bare claude-* ids are the Max subscription", () => {
    assert.equal(isMeteredModel("claude-opus-4-8"), false);
    assert.equal(isMeteredModel("claude-haiku-4-5-20251001"), false);
    assert.equal(isMeteredModel("claude-sonnet-4-6"), false);
  });
  it("vendor/model ids are metered OpenRouter", () => {
    assert.equal(isMeteredModel("z-ai/glm-4.6"), true);
    assert.equal(isMeteredModel("deepseek/deepseek-chat"), true);
    assert.equal(isMeteredModel("meta-llama/llama-4-maverick"), true);
    assert.equal(isMeteredModel("openai/gpt-5.1"), true);
  });
  it("Claude routed THROUGH OpenRouter is metered — the slash is what pays", () => {
    // Not hypothetical hair-splitting: this is the one case where the vendor name misleads. The
    // money leaves the prepaid balance no matter whose model is on the other end.
    assert.equal(isMeteredModel("anthropic/claude-opus-4.1"), true);
  });
});

describe("splitByWallet — the burn alarm must only see Max tokens", () => {
  it("keeps the two wallets apart instead of summing them", () => {
    const w = splitByWallet([
      row("claude-opus-4-8", 1_000_000, 4_000_000),
      row("claude-sonnet-4-6", 500_000, 1_000_000),
      row("deepseek/deepseek-chat", 200_000, 1_500),
      row("openai/gpt-5.1", 100_000, 300_000),
    ]);
    assert.equal(w.max.total, 1_500_000);
    assert.equal(w.max.calls, 2);
    assert.equal(w.metered.total, 300_000);
    assert.equal(w.metered.calls, 2);
  });

  it("metered tokens never inflate the Max burn — the exact 2026-07-16 alarm bug", () => {
    // 39M of real Max burn is UNDER the 40M floor. Adding ~1M of OpenRouter tokens — a different
    // wallet entirely — is what tipped it over and fired the alarm on quota that was never spent.
    const rows = [row("claude-opus-4-8", 39_000_000), row("google/gemini-3.1-pro-preview", 1_000_000)];
    const w = splitByWallet(rows);
    assert.equal(w.max.total, 39_000_000);
    assert.ok(w.max.total < 40_000_000, "the alarm must not fire on 39M of actual Max burn");
    // The old behaviour, for the record: the naive sum crosses the floor.
    const naive = rows.reduce((s, r) => s + r.inputTokens, 0);
    assert.ok(naive >= 40_000_000);
  });

  it("keeps notional Max cost out of real metered spend", () => {
    // $9.28 of Claude "cost" is what Max WOULD have cost metered — Cam pays a flat subscription and
    // that money never moves. Only the $1.19 is real. Reporting $10.47 as spend is a lie.
    const w = splitByWallet([row("claude-opus-4-8", 100, 9_280_000), row("x-ai/grok-4.3", 100, 1_190_000)]);
    assert.equal(w.metered.costMicroUsd, 1_190_000);
    assert.equal(w.max.costMicroUsd, 9_280_000);
    assert.notEqual(w.metered.costMicroUsd, 10_470_000);
  });

  it("an all-Max day reports no metered spend at all (challengers dark on credits)", () => {
    const w = splitByWallet([row("claude-opus-4-8", 1000, 5000)]);
    assert.equal(w.metered.calls, 0);
    assert.equal(w.metered.costMicroUsd, 0);
  });

  it("no rows is zero, not NaN", () => {
    const w = splitByWallet([]);
    assert.equal(w.max.total, 0);
    assert.equal(w.metered.costMicroUsd, 0);
  });
});
