import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PLAN_QUESTIONS } from "../lib/plan-questions";
import { PLAN_PREP, PRIORITY, discussionRows, discussionStatus, discussionSummary, orderOfBusiness } from "../lib/plan-discussion";
import { standingRows, WITHDRAWN } from "../lib/plan-answers";

// The discussion panel (D139, 2026-10-22): one row per question, status computed from the two
// standing answers, disagreements first, a prep note for every question.

const a = (questionKey: string, memberKey: "cam" | "graham", choice: string, note: string | null = null) => ({
  questionKey,
  memberKey,
  choice,
  choiceLabel: choice,
  note,
  at: "2026-10-21T00:00:00.000Z",
});

describe("discussion status", () => {
  const ans = (c: string) => ({ choice: c, choiceLabel: c, note: null, at: "" });
  it("names who is still to answer", () => {
    assert.equal(discussionStatus(null, null), "awaiting-both");
    assert.equal(discussionStatus(ans("cap"), null), "awaiting-graham");
    assert.equal(discussionStatus(null, ans("no-cap")), "awaiting-cam");
  });
  it("tells agreement from difference, and Not sure from both", () => {
    assert.equal(discussionStatus(ans("voo"), ans("voo")), "agreed");
    assert.equal(discussionStatus(ans("cap"), ans("no-cap")), "differs");
    assert.equal(discussionStatus(ans("unsure"), ans("unsure")), "both-unsure");
    assert.equal(discussionStatus(ans("unsure"), ans("no-target")), "one-unsure");
  });
});

describe("discussion rows", () => {
  it("carry every question in order, with a prep note each", () => {
    const rows = discussionRows(PLAN_QUESTIONS, []);
    assert.equal(rows.length, PLAN_QUESTIONS.length);
    rows.forEach((r, i) => {
      assert.equal(r.n, i + 1);
      assert.ok(r.prep, `${r.key} has no prep note`);
      for (const f of ["stake", "where", "suggest"] as const) assert.ok((r.prep?.[f] ?? "").length > 40, `${r.key}.${f} is thin`);
    });
  });
  it("prep notes name only real questions", () => {
    const keys = new Set(PLAN_QUESTIONS.map((q) => q.key));
    for (const k of Object.keys(PLAN_PREP)) assert.ok(keys.has(k), `${k} is not a question`);
  });
  it("put the disagreements first and decided questions last", () => {
    const [q1, q2, q3] = PLAN_QUESTIONS.map((q) => q.key);
    const rows = discussionRows(
      PLAN_QUESTIONS,
      [a(q1, "cam", "accept"), a(q1, "graham", "accept"), a(q2, "cam", "code"), a(q2, "graham", "lesson"), a(q3, "cam", "cap")],
      [{ questionKey: q2, choice: "code", choiceLabel: "code", note: null, decidedBy: "cam@x", at: "" }],
    );
    const ordered = orderOfBusiness(rows).map((r) => r.key);
    assert.equal(ordered[ordered.length - 1], q2, "a decided question sinks to the bottom");
    assert.ok(ordered.indexOf(q3) < ordered.indexOf(q1), "an open question comes before an agreed one");
    const s = discussionSummary(rows);
    assert.deepEqual(s, { agreed: 1, differ: 1, open: PLAN_QUESTIONS.length - 2, decided: 1, total: PLAN_QUESTIONS.length });
  });
});


describe("the suggested landings + Cam's short list (2026-10-23)", () => {
  it("every suggested landing records one of its own question's options", () => {
    for (const q of PLAN_QUESTIONS) {
      const prep = PLAN_PREP[q.key];
      if (!prep) continue;
      assert.ok(q.options.some((o) => o.key === prep.suggestChoice), `${q.key}: ${prep.suggestChoice} is not an option`);
    }
  });
  it("the priorities lead the page, in Cam's order (3, 6, 7), even once decided", () => {
    const rows = discussionRows(PLAN_QUESTIONS, [], [
      { questionKey: "single-name-cap", choice: "cap", choiceLabel: "", note: null, decidedBy: "Cam", at: "2026-10-23T17:00:00Z" },
    ]);
    assert.deepEqual(orderOfBusiness(rows).slice(0, 3).map((r) => r.n), [3, 6, 7]);
    assert.equal(PRIORITY.length, 3);
  });
  it("undo: a withdrawal as the newest row leaves the question undecided; the history stays", () => {
    const rows = [
      { questionKey: "pass-marks", choice: WITHDRAWN },
      { questionKey: "pass-marks", choice: "change" },
      { questionKey: "usd-ballast", choice: "voo" },
    ];
    assert.deepEqual(standingRows(rows).map((r) => r.questionKey), ["usd-ballast"]);
    assert.deepEqual(standingRows([{ questionKey: "pass-marks", choice: "accept" }, ...rows]).map((r) => r.choice), ["accept", "voo"]);
  });
});
