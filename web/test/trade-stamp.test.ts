import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// D77: every trade carries the version of the agent that made it. JournalEntry.agentVersion has a schema
// default that is a dead literal, so a TRADE writer that forgets the field stamps a version from months
// ago — every IBKR-paper fill did until 2026-10-16. Two rules, held at build time:
//   1. no application source spells a version literal (agent/policy.ts owns AGENT_VERSION; one-off
//      scripts/ may pin a historical one on purpose);
//   2. every journal write of kind TRADE sets agentVersion — from AGENT_VERSION, the caller, or
//      liveAgentVersion() (lib/broker/sim.ts), which is what the running agent wrote on Settings at boot.

function tsFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) tsFiles(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const root = process.cwd();
const appSources = ["lib", "agent", "app"].flatMap((r) => tsFiles(join(root, r)));
const allSources = [...appSources, ...tsFiles(join(root, "scripts"))];
const VERSION_LITERAL = /["'`]v\d+\.\d+-phase\d+["'`]/;

describe("trade version stamp (D77)", () => {
  it("no application source hard-codes a version literal", () => {
    const offenders = appSources
      .filter((f) => relative(root, f) !== join("agent", "policy.ts"))
      .filter((f) => VERSION_LITERAL.test(readFileSync(f, "utf8")))
      .map((f) => relative(root, f));
    assert.deepEqual(offenders, [], `version literals belong in agent/policy.ts only: ${offenders.join(", ")}`);
  });

  it("every TRADE journal write sets agentVersion", () => {
    const misses: string[] = [];
    for (const f of allSources) {
      const src = readFileSync(f, "utf8");
      const re = /journalEntry\.create\(\s*\{/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        const next = src.indexOf("journalEntry.create(", m.index + 10);
        const end = Math.min(m.index + 1500, next < 0 ? Infinity : next);
        const window = src.slice(m.index, end);
        if (/kind:\s*"TRADE"/.test(window) && !/agentVersion/.test(window)) {
          misses.push(`${relative(root, f)}:${src.slice(0, m.index).split("\n").length}`);
        }
      }
    }
    assert.deepEqual(misses, [], `TRADE writers without a version stamp: ${misses.join(", ")}`);
  });
});
