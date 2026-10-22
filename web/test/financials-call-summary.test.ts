// D140 F8 — earnings-call summaries: quotes must be real, and the summarizer must never see the book
// (that is the condition on which the open user tier may read them — Cam, 2026-10-22).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { verifiedQuotes, parseCallSummary, CALL_SUMMARY_SYSTEM } from "../lib/financials/call-summary";

const T = `Operator: Good afternoon.\nJensen Huang: Demand for Blackwell is incredible, and we expect\nrevenue of $54 billion next quarter.\nAnalyst: What about China?\nJensen Huang: We’re not assuming any China revenue in the outlook.`;

describe("quotes are verbatim or gone", () => {
  it("keeps exact text across line breaks, case and curly apostrophes", () => {
    const q = verifiedQuotes(
      [{ speaker: "Jensen Huang", text: "we expect revenue of $54 billion next quarter" }, { speaker: "Jensen Huang", text: "We're not assuming any China revenue" }],
      T,
    );
    assert.equal(q.length, 2);
  });
  it("drops a paraphrase dressed as a quote", () => {
    assert.equal(verifiedQuotes([{ speaker: "Jensen Huang", text: "Blackwell demand is off the charts this year" }], T).length, 0);
  });
  it("drops fragments too short to mean anything", () => assert.equal(verifiedQuotes([{ speaker: "x", text: "Good" }], T).length, 0));
});

describe("the parsed summary", () => {
  const ok = { headline: "h", guidance: { direction: "raised", detail: "d" }, tone: "confident", toneWhy: "w", highlights: ["a", "b", "c", "d", "e", "f"], risks: [], dodged: [], quotes: [{ speaker: "Jensen Huang", text: "invented words that were never said" }] };
  it("validates the enums and caps the lists", () => {
    const s = parseCallSummary(JSON.stringify(ok), T)!;
    assert.equal(s.highlights.length, 5);
    assert.equal(s.quotes.length, 0);
  });
  it("rejects a bad shape", () => {
    assert.equal(parseCallSummary(JSON.stringify({ ...ok, tone: "euphoric" }), T), null);
    assert.equal(parseCallSummary("not json", T), null);
    assert.equal(parseCallSummary(null, T), null);
  });
});

describe("the summarizer never sees the fund's book (users may read its output)", () => {
  const src = readFileSync(new URL("../agent/earnings-call.ts", import.meta.url), "utf8");
  it("has its own system prompt, no tools, no persona", () => {
    assert.match(src, /systemPrompt: CALL_SUMMARY_SYSTEM/);
    assert.match(src, /withTools: false/);
    assert.doesNotMatch(src, /PERSONA/);
  });
  it("reads nothing about positions, the journal, NAV or Alfred's calls", () => {
    assert.doesNotMatch(src, /buildContext|prisma\.(position|journalEntry|navSnapshot|trade|fill)\b|from "\.\/context"|from "\.\/tools"/);
  });
  it("the prompt asks for no opinion on the stock", () => assert.match(CALL_SUMMARY_SYSTEM, /no buy or sell view/));
});
