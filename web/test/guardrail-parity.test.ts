import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// GUARDRAIL PARITY — the test that would have caught 2026-07-16 (D118/D118b).
//
// On that day the fund opened a 96-share short, and the reason was not the stop-loss bug that
// triggered it. It was that the §6 no-shorting rule lived ONLY in sim.ts and had never been ported to
// ibkr.ts — so from the move to BROKER=ibkr-paper onward, a money rule was enforced by assumption on
// the path the fund actually traded. Auditing the rest turned up two more in the same state: the fee
// budget, and funding/no-margin. Every one was found by a human grepping, and the grepping only
// happened because the first one blew up.
//
// That is the real defect: parity was a habit. Habits are not enforcement — they hold until the day
// someone is in a hurry, which is the day it matters. So this file asserts the SEAM ITSELF.
//
// What it actually protects: the completeness check below. Anyone adding a guardrail to guardrails.ts
// must classify it, and a `seam` rule that reaches only one adapter fails the build. You cannot
// half-wire a money rule and have it look finished — which is precisely what the codebase looked like
// for the weeks before D118.
//
// This is deliberately a SOURCE-level check, not a behavioural one. The suite is pure (no DB, no
// network), and a behavioural test of placeOrder would need the whole Prisma + IBKR world mocked —
// which buys realism at the cost of a fixture that rots. Reading the source answers the exact
// question that went unasked for weeks: is this rule referenced on both paths?

const WEB = join(import.meta.dirname, "..");
const src = (p: string) => readFileSync(join(WEB, p), "utf8");

const GUARDRAILS = src("lib/broker/guardrails.ts");
const ADAPTERS = { "lib/broker/sim.ts": src("lib/broker/sim.ts"), "lib/broker/ibkr.ts": src("lib/broker/ibkr.ts") };
const VALIDATOR = src("agent/validator.ts");

/** Strip comments so a rule NAMED in prose can't be mistaken for a rule CALLED in code. Without this
 *  the whole file scores itself on its own documentation — every D118 comment mentions the guardrails
 *  it describes, so the test would pass on an adapter that merely talks about enforcing them. */
function code(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}
const calls = (s: string, fn: string) => new RegExp(`\\b${fn}\\s*\\(`).test(code(s));

// Every exported guardrail, and WHERE it must be enforced. Adding a guardrail without adding it here
// fails the completeness test below — that is the point: the classification is forced, not remembered.
//
//   seam      — a money rule that binds EVERY order. Must be called by BOTH broker adapters, because
//               both are real order paths: the agent trades through ibkr.ts, and a member's manual
//               order (/api/sim/order) goes through getBroker() to whichever is live.
//   validator — gates the AGENT's proposals only (agent/validator.ts). A member's manual order is
//               deliberately NOT bound by these: a human is the authority (rule #1). That is a real
//               decision, not an oversight — it went undocumented until D118b, so it is stated here.
//   helper    — pure arithmetic with no enforcement site of its own; used to build the above.
const RULES: Record<string, "seam" | "validator" | "helper"> = {
  isValidQty: "seam", // #4 whole positive shares
  shortingShortfallQty: "seam", // #3 no shorting — the D118 bug
  fundingShortfallCents: "seam", // #3 no margin borrowing — also validator-side for the agent
  breachesFeeBudget: "seam", // §6 monthly fee budget — the D118b bug
  meetsConviction: "validator", // conviction is a property of a model proposal; a human has no score
  breachesPositionCap: "validator",
  breachesCashFloor: "validator",
  breachesFeeEdge: "validator",
  breachesOptionPremiumCap: "validator",
  optionPremiumCents: "helper",
};

const exported = [...GUARDRAILS.matchAll(/^export function (\w+)/gm)].map((m) => m[1]);

describe("guardrail parity — every §6 rule is classified", () => {
  it("classifies every exported guardrail (add one → classify it, or this fails)", () => {
    const unclassified = exported.filter((fn) => !(fn in RULES));
    assert.deepEqual(
      unclassified,
      [],
      `guardrails.ts exports ${unclassified.join(", ")} with no entry in RULES. Decide where it is ` +
        `enforced — "seam" (both adapters), "validator" (agent proposals only), or "helper" — and say so. ` +
        `A money rule nobody classified is how D118 happened.`,
    );
  });

  it("has no stale classifications pointing at deleted guardrails", () => {
    const ghosts = Object.keys(RULES).filter((fn) => !exported.includes(fn));
    assert.deepEqual(ghosts, [], `RULES lists ${ghosts.join(", ")}, which guardrails.ts no longer exports.`);
  });

  it("sanity: the exports were actually parsed", () => {
    assert.ok(exported.length >= 8, `only parsed ${exported.length} exports — the regex has drifted from the file's style`);
  });
});

describe("guardrail parity — seam rules reach BOTH broker adapters", () => {
  for (const [fn, tier] of Object.entries(RULES)) {
    if (tier !== "seam") continue;
    for (const [path, source] of Object.entries(ADAPTERS)) {
      it(`${fn} is enforced in ${path}`, () => {
        assert.ok(
          calls(source, fn),
          `${fn} is a SEAM rule but ${path} never calls it. Both adapters are live order paths — a rule ` +
            `in only one is enforced by assumption on the other, which is exactly the D118 failure ` +
            `(no-shorting lived in sim.ts while the fund traded through ibkr.ts).`,
        );
      });
    }
  }
});

describe("guardrail parity — validator rules reach the agent's gate", () => {
  for (const [fn, tier] of Object.entries(RULES)) {
    if (tier !== "validator") continue;
    it(`${fn} is enforced in agent/validator.ts`, () => {
      assert.ok(calls(VALIDATOR, fn), `${fn} is classified validator-only but agent/validator.ts never calls it.`);
    });
  }
});

// The two rules that are not guardrails.ts functions but are still absolute at the seam. The kill
// switch is rule #2 ("sacred", checked before every order) and options are rule #3; both are Settings
// flags rather than pure math, so the manifest above cannot cover them.
describe("guardrail parity — the kill switch and options flag bind both adapters", () => {
  for (const [path, source] of Object.entries(ADAPTERS)) {
    it(`${path} checks the kill switch before placing`, () => {
      assert.ok(/killSwitch/.test(code(source)), `${path} never reads killSwitch — rule #2 is checked before EVERY order.`);
    });
    it(`${path} refuses options unless a member enabled them`, () => {
      assert.ok(/allowOptions/.test(code(source)), `${path} never reads allowOptions — options are off by default (#3).`);
    });
  }
});

// A guard on the guard: if code() ever stops stripping comments, every test above silently starts
// scoring the files on their own prose, and this suite becomes decorative.
describe("guardrail parity — the check itself", () => {
  it("ignores rules that are merely mentioned in comments", () => {
    assert.equal(calls("// we should call breachesFeeBudget(spent, c, b) one day", "breachesFeeBudget"), false);
    assert.equal(calls("/* breachesFeeBudget(a,b,c) */", "breachesFeeBudget"), false);
    assert.equal(calls("if (breachesFeeBudget(spent, c, b)) reject();", "breachesFeeBudget"), true);
  });
  it("does not mistake a URL's slashes for a comment", () => {
    assert.equal(calls("const u = 'https://x.y'; isValidQty(q);", "isValidQty"), true);
  });
});
