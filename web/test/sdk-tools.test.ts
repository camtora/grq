import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Opus 5.5 prompt audit, C1 (2026-09-23). The SDK's `allowedTools` only AUTO-APPROVES tools; the
// AVAILABLE built-ins are `tools`, and it defaults to Claude Code's whole catalogue (Agent, Bash,
// Write, Skill…). No call site set it, so every session — even a tool-less Haiku classifier — carried
// ~14k tokens of schemas it could never use, and the trading agent could spawn subagents and run
// shell. Fixing the four call sites fixes the instances; this fixes the class: any new query() that
// forgets `tools` fails the build.

const ROOTS = ["agent", "lib"];

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return tsFiles(p);
    return p.endsWith(".ts") && !p.endsWith(".d.ts") ? [p] : [];
  });
}

/** The argument text of each `query({ … })` call, by brace matching from the opening `{`. */
function queryCalls(src: string): string[] {
  const out: string[] = [];
  const re = /\bquery\(\{/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    let depth = 0;
    let i = m.index + m[0].length - 1;
    const start = i;
    for (; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}" && --depth === 0) break;
    }
    out.push(src.slice(start, i + 1));
  }
  return out;
}

test("every Agent SDK query() sets `tools` explicitly", () => {
  const offenders: string[] = [];
  let seen = 0;
  for (const file of ROOTS.flatMap((r) => tsFiles(join(__dirname, "..", r)))) {
    const src = readFileSync(file, "utf8");
    if (!src.includes("@anthropic-ai/claude-agent-sdk")) continue;
    for (const call of queryCalls(src)) {
      seen++;
      if (!/\btools:\s/.test(call)) offenders.push(`${file}: ${call.slice(0, 80).replace(/\s+/g, " ")}…`);
    }
  }
  assert.ok(seen >= 4, `expected to find the SDK query() call sites, found ${seen}`);
  assert.deepEqual(offenders, [], "query() without `tools` ships Claude Code's full built-in catalogue");
});
