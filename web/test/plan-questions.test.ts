import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PLAN_QUESTIONS, PLAN_ROUND, planOptionLabel } from "../lib/plan-questions";
import { proposalsSection, reviewMemoryBlock } from "../agent/review-memory";
import { GLOSSARY } from "../lib/glossary";

// D139: the plan's questions are answered on the site and read back into the Saturday review.
describe("plan questions", () => {
  it("have unique keys and at least two distinct options each, with a round", () => {
    assert.match(PLAN_ROUND.key, /^\d{4}-\d{2}-\d{2}$/);
    const keys = PLAN_QUESTIONS.map((q) => q.key);
    assert.equal(new Set(keys).size, keys.length);
    for (const q of PLAN_QUESTIONS) {
      assert.ok(q.options.length >= 2, q.key);
      assert.equal(new Set(q.options.map((o) => o.key)).size, q.options.length, q.key);
      assert.ok(q.title.trim() && q.means.trim() && q.asks.trim(), q.key);
    }
  });
  // Written for Graham (2026-10-20): he could not answer the first draft. Two rules the text must
  // keep. A percentage never stands alone — he reads dollars, so any paragraph that says "%" also
  // says "$". And a [[slug|label]] tap-to-explain must point at a word the glossary actually has,
  // or the tap asks the agent to improvise a definition of a term we chose.
  it("say dollars wherever they say a percentage, and only link glossary words that exist", () => {
    for (const q of PLAN_QUESTIONS) {
      for (const text of [q.means, q.asks]) {
        for (const para of text.split(/\n\s*\n/)) {
          if (para.includes("%")) assert.ok(para.includes("$"), `${q.key}: a percentage with no dollars beside it: "${para.slice(0, 80)}"`);
        }
        for (const m of text.matchAll(/\[\[([^\][|]+)\|[^\][]+\]\]/g)) {
          assert.ok(GLOSSARY[m[1].trim().toLowerCase()], `${q.key}: [[${m[1]}|…]] is not in the glossary`);
        }
        assert.doesNotMatch(text, /\[\[[^\][|]+\]\]/, `${q.key}: a [[term]] without a |label`);
      }
    }
  });
  it("labels a recorded choice, and falls back to the raw key for a retired one", () => {
    const q = PLAN_QUESTIONS[0];
    assert.equal(planOptionLabel(q.key, q.options[0].key), q.options[0].label);
    assert.equal(planOptionLabel(q.key, "gone"), "gone");
  });
});

describe("the weekly review's memory block", () => {
  const weekly = `## 5. Grades\n\nfine\n\n## 6. Proposed strategy adjustments — **need sign-off**\n\n1. **Cap it.** Please.\n2. No other change.\n\n## 7. Sources\n\nok`;
  it("lifts the proposals section of a weekly report without its heading", () => {
    assert.equal(proposalsSection(weekly), "1. **Cap it.** Please.\n2. No other change.");
    assert.equal(proposalsSection("## 1. Nothing here"), null);
  });
  it("carries the diary, last week's proposals and the members' answers, and says when each is empty", () => {
    const full = reviewMemoryBlock({
      diary: [{ date: "2026-10-17", title: "A cancel tool", body: "GRQ can   cancel\nan order now." }],
      lastProposals: "1. A cancel tool.",
      lastProposalsDate: "2026-10-10",
      answers: [{ question: "Cap one name?", name: "Graham", choice: "No cap", note: "incentives", date: "2026-10-18" }],
    });
    assert.match(full, /2026-10-17 — A cancel tool: GRQ can cancel an order now\./);
    assert.match(full, /Your proposals last week \(2026-10-10\):\n1\. A cancel tool\./);
    assert.match(full, /Cap one name\? — Graham: No cap \(incentives\) · 2026-10-18/);
    const empty = reviewMemoryBlock({ diary: [], lastProposals: null, lastProposalsDate: null, answers: [] });
    assert.match(empty, /nothing shipped this week/);
    assert.match(empty, /no proposals last week/);
    assert.match(empty, /no answers recorded yet/);
  });
});
