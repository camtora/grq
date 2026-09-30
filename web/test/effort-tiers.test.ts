import { test } from "node:test";
import assert from "node:assert/strict";
import { EFFORT, MODELS, effortFor } from "../agent/policy";

// Stage 2 of the Opus 5.5 prompt audit (C2, 2026-09-30): effort is per route. Only the sessions that
// can move money stay high; research and writing run at medium. These pin the defaults and the one
// rule that must never break: effort goes ONLY to the decision model.
test("effort tiers default to high for decisions, medium for everything that places nothing", () => {
  if (process.env.GRQ_EFFORT_DECISION || process.env.GRQ_EFFORT_RESEARCH || process.env.GRQ_EFFORT_REPORT) return; // env overrides in play
  assert.equal(EFFORT.decision, "high");
  assert.equal(EFFORT.research, "medium");
  assert.equal(EFFORT.report, "medium");
  assert.equal(EFFORT.chat, "medium");
  assert.equal(EFFORT.sandbox, "medium");
});

test("effortFor sends effort only to the decision model", () => {
  assert.deepEqual(effortFor(MODELS.decision), { effort: EFFORT.decision });
  assert.deepEqual(effortFor(MODELS.decision, EFFORT.research), { effort: EFFORT.research });
  assert.deepEqual(effortFor(MODELS.triage, EFFORT.research), {}); // Haiku takes no effort
  assert.deepEqual(effortFor("claude-sonnet-4-6"), {}); // Race challengers keep their own default
  assert.deepEqual(effortFor("claude-opus-4-8", EFFORT.sandbox), {}); // a sandbox pinned to an older model
});
