import { test } from "node:test";
import assert from "node:assert/strict";
import { modelLabel } from "../lib/race/models";

// D128: labels come from the id's own version — the champion moved 4.8 → 5.5 and old Race
// records must keep saying 4.8 while new ones say 5.5.
test("Claude labels read the version off the id", () => {
  assert.equal(modelLabel("claude-opus-4-8"), "Opus 4.8");
  assert.equal(modelLabel("claude-opus-5-5"), "Opus 5.5");
  assert.equal(modelLabel("claude-opus-5"), "Opus 5");
  assert.equal(modelLabel("claude-sonnet-4-6"), "Sonnet 4.6");
  assert.equal(modelLabel("claude-haiku-4-5-20251001"), "Haiku 4.5");
  assert.equal(modelLabel("anthropic/claude-fable-5"), "Fable 5");
  assert.equal(modelLabel("claude-fable-5-1"), "Fable 5.1");
});

test("non-Claude slugs are unchanged", () => {
  assert.equal(modelLabel("x-ai/grok-4.3"), "Grok 4.3");
  assert.equal(modelLabel("openai/gpt-5.1"), "GPT-5.1");
});
