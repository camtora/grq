import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// EVERY MODEL CALL IS ACCOUNTED FOR — the test that would have caught D118d, twice.
//
// The agent spends Cam's shared Claude Max quota. Two guards exist around that: the AgentUsage row
// behind /admin/usage, and the 40M/day burn alarm computed FROM those rows (a runaway agent has
// drained the day's quota by 11am before). Both are downstream of one thing — that whoever called the
// model wrote a row.
//
// runSession() does that for you. But it lives in sessions.ts, which imports tools.ts, which imports
// council.ts — so anything tools.ts can reach cannot import runSession without a cycle, and the
// workaround is always the same: hand-roll the ~20-line query() loop. That copy inherits the
// behaviour and none of the instrumentation, silently:
//
//   - council.ts oneShot()   — six OPUS passes per convene, ~414k tokens, invisible for weeks.
//   - chat-server.ts (x2)    — every Ask Alfred turn: Opus, maxTurns 12, WebFetch (which compounds).
//                              Invisible since the chat shipped.
//
// Both were found by hand, one after the other, on 2026-07-16. Nothing failed. So: if a file calls
// query(), it must also record usage. recordAgentUsage lives in agent/usage.ts precisely so there is
// no cycle excuse — it imports prisma/policy/calendar/alerts and nothing else.

const AGENT = join(import.meta.dirname, "..", "agent");

/** Strip comments — a file that only MENTIONS recordAgentUsage in prose has not called it. Every
 *  file below documents this rule in its own header, so without this the suite scores the docs. */
function code(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const files = readdirSync(AGENT, { recursive: true } as never)
  .filter((f): f is string => typeof f === "string" && f.endsWith(".ts"))
  .map((f) => ({ rel: `agent/${f}`, src: code(readFileSync(join(AGENT, f), "utf8")) }));

// Files that call the Agent SDK directly. `query(` immediately followed by `{` is the SDK call shape;
// this deliberately does NOT match prisma query helpers or anything named *Query.
const callsQuery = files.filter((f) => /\bquery\s*\(\s*\{/.test(f.src));

describe("agent instrumentation — every model call lands in AgentUsage", () => {
  it("sanity: the SDK call sites are actually being found", () => {
    assert.ok(
      callsQuery.length >= 3,
      `only found ${callsQuery.length} query() call site(s) — the matcher has drifted; it should see ` +
        `sessions.ts, council.ts and chat-server.ts at minimum`,
    );
  });

  for (const f of files) {
    if (!/\bquery\s*\(\s*\{/.test(f.src)) continue;
    it(`${f.rel} records usage for the model calls it makes`, () => {
      assert.ok(
        /\brecordAgentUsage\s*\(/.test(f.src),
        `${f.rel} calls the Agent SDK's query() but never calls recordAgentUsage(). Every model call ` +
          `spends Cam's shared Max quota, and an un-recorded one is invisible to /admin/usage AND to ` +
          `the 40M/day burn alarm — which is computed from AgentUsage rows, so a silent caller doesn't ` +
          `just go unreported, it makes the ALARM wrong. If you hand-rolled a query() loop to dodge the ` +
          `sessions.ts → tools.ts → council.ts cycle, import recordAgentUsage from ./usage: it has no ` +
          `tools dependency, which is the whole reason it exists. (D118d)`,
      );
    });
  }
});

// AgentUsage has TWO legitimate kinds of writer, because it tracks TWO WALLETS:
//   agent/usage.ts  — every Agent-SDK call, spending Cam's shared Claude Max quota.
//   the OpenRouter recorders — metered challengers (The Race, the Options Desk). Those never touch
//     the SDK (they go through chatComplete) and are billed in real dollars to a prepaid balance, not
//     to Max. They log to the same table so it doubles as a cost-per-model board.
// The invariant worth pinning is that no THIRD kind appears — i.e. nobody hand-rolls SDK accounting
// again, which is exactly what oneShot() and chat-server did by NOT writing at all (D118d).
const OPENROUTER_RECORDERS = ["agent/sessions.ts", "agent/options-desk/engine.ts"];

describe("agent instrumentation — the accounting has one home per wallet", () => {
  it("nothing writes AgentUsage except the recorder and the known metered recorders", () => {
    const writers = files.filter((f) => /prisma\.agentUsage\.create\s*\(/.test(f.src)).map((f) => f.rel).sort();
    const expected = ["agent/usage.ts", ...OPENROUTER_RECORDERS].sort();
    assert.deepEqual(
      writers,
      expected,
      `Unexpected AgentUsage writer. Agent-SDK calls must record through agent/usage.ts — a second ` +
        `hand-rolled accounting path is how the council and the chat went dark (D118d). If this is a ` +
        `new METERED (OpenRouter) recorder, add it to OPENROUTER_RECORDERS above and say why. ` +
        `Found: ${writers.join(", ")}`,
    );
  });

  it("the burn alarm is wired to the recorder, so no recorded call can skip it", () => {
    const usage = files.find((f) => f.rel === "agent/usage.ts");
    assert.ok(usage, "agent/usage.ts is missing");
    assert.ok(/checkTokenMilestones\s*\(/.test(usage!.src), "recordAgentUsage must call checkTokenMilestones()");
  });
});

describe("agent instrumentation — the check itself", () => {
  it("ignores a query( that is only mentioned in a comment", () => {
    assert.equal(/\bquery\s*\(\s*\{/.test(code("// const q = query({ prompt })")), false);
    assert.equal(/\bquery\s*\(\s*\{/.test(code("const q = query({ prompt })")), true);
  });
  it("does not fire on prisma or other query-ish helpers", () => {
    assert.equal(/\bquery\s*\(\s*\{/.test(code("await prisma.$queryRaw`select 1`;")), false);
    assert.equal(/\bquery\s*\(\s*\{/.test(code("buildQuery(x);")), false);
  });
});
