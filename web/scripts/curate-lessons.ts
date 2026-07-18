/**
 * A one-off FABLE session that curates the agent's banked LESSONs into the permanent tier (D119).
 *
 * Fable's Max-token access is broken (D17), so this reaches Fable 5 via OpenRouter
 * (`anthropic/claude-fable-5`, metered — pennies for this). The agent curates its own
 * constitution going forward; this seeds it from the lessons banked before the tier existed.
 *
 *   OPENROUTER_API_KEY=… npx tsx scripts/curate-lessons.ts           # dry-run: print Fable's plan
 *   OPENROUTER_API_KEY=… npx tsx scripts/curate-lessons.ts --apply   # write the pins + log it
 */
import { prisma } from "../lib/db";
import { chatComplete } from "../agent/openrouter";

const APPLY = process.argv.includes("--apply");
const MODEL = "anthropic/claude-fable-5";

async function main() {
  const lessons = await prisma.journalEntry.findMany({ where: { kind: "LESSON" }, orderBy: { at: "asc" } });
  if (!lessons.length) { console.log("No LESSONs to curate."); return; }

  const block = lessons.map((l) => `### id ${l.id} — ${l.title}\n${l.body.slice(0, 900)}`).join("\n\n");

  const system = `You are Alfred, the manager of the GRQ fund, curating your OWN lesson bank.
Some lessons are DURABLE, foundational rules you should ALWAYS re-read before EVERY decision
("permanent" — your constitution). Others are situational one-offs best left to a rolling recent
window. The permanent set must stay SMALL and load-bearing — a constitution, not a notebook.
A lesson qualifies as permanent only if it (a) applies across many names/situations, (b) guards
against a repeatable, costly mistake, and (c) you'd want in front of you on every single decision.
Tactical, single-name, or already-superseded notes do NOT qualify. Be strict; when in doubt, leave
it in the rolling window (pin=false).`;

  const user = `Here are your ${lessons.length} banked LESSONs. For EACH, decide pin=true (permanent)
or pin=false (rolling window). Return ONLY a JSON array — no prose, no code fence:
[{"id": <number>, "pin": <boolean>, "reason": "<one short clause>"}]

${block}`;

  console.log(`[curate] asking ${MODEL} to curate ${lessons.length} lessons…`);
  const res = await chatComplete({ model: MODEL, system, user, maxTokens: 4000 });
  if (!res) { console.error("[curate] model call returned null — missing OPENROUTER_API_KEY or provider error."); process.exit(1); }
  console.log(`[curate] Fable replied — ${res.outTokens} out tok · $${res.costUsd.toFixed(4)}`);

  const m = res.text.match(/\[[\s\S]*\]/);
  if (!m) { console.error("[curate] no JSON array in reply:\n", res.text.slice(0, 1000)); process.exit(1); }
  let decisions: { id: number; pin: boolean; reason: string }[];
  try { decisions = JSON.parse(m[0]); }
  catch (e) { console.error("[curate] JSON parse failed:", e, "\n", m[0].slice(0, 1000)); process.exit(1); }

  const byId = new Map(lessons.map((l) => [l.id, l]));
  const toPin = decisions.filter((d) => d.pin && byId.has(d.id));

  console.log(`\n=== Fable's curation: ${toPin.length}/${lessons.length} → PERMANENT ===\n`);
  for (const d of decisions) {
    const l = byId.get(d.id);
    if (!l) continue;
    console.log(`${d.pin ? "📌 PIN  " : "   ·    "} #${d.id}  ${l.title.slice(0, 60)}`);
    console.log(`            ↳ ${d.reason}`);
  }

  if (!APPLY) { console.log("\n[dry-run] re-run with --apply to write these pins."); return; }

  const ids = toPin.map((d) => d.id);
  await prisma.journalEntry.updateMany({ where: { id: { in: ids } }, data: { permanent: true } });
  await prisma.journalEntry.create({
    data: {
      kind: "SYSTEM",
      title: `Permanent-lesson curation (Fable session) — pinned ${ids.length}/${lessons.length}`,
      body:
        `A ${MODEL} session (via OpenRouter — Max-token Fable access is broken, D17) reviewed the ` +
        `lesson bank and pinned the foundational rules as permanent (D119). Pinned:\n\n` +
        toPin.map((d) => `- #${d.id} — ${byId.get(d.id)!.title}\n  ${d.reason}`).join("\n"),
      agentVersion: "v2.74-phase4",
    },
  });
  console.log(`\n[applied] ${ids.length} lessons pinned permanent + curation logged.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
