// Day 1 of a paper-account reset (D138, Mon 2026-10-26): clear what belongs to the old book and
// verify the new one, in the runbook's order. Dry by default; --apply writes.
//
//   cd web && npx tsx scripts/reset-day1.ts                 # report + what would change
//   cd web && npx tsx scripts/reset-day1.ts --apply         # do it
//
// Clears: OPEN agenda items (→ DROPPED, outcome says why), the agent's focus list, the ±4%
// trigger anchors, PENDING self-scheduled wakeups. Writes: today's boot-scan skip marker (so the
// next agent boot does not run the ~3.8M-token library scan) and a "Run 3 — day 1" SYSTEM row.
// Verifies: no positions, cash at the launch size, contributions = NAV (run rebaseline-reset.ts
// first), the high-water mark since inception, no PENDING orders, the pause state.
// Leaves alone: the journal, dossiers, lessons, retros, directives, universe, watches, the race
// books (their own experiment — reset them only if the members ask), every fill.
import { prisma } from "../lib/db";
import { etDateStr } from "../agent/calendar";
import { AGENT_VERSION } from "../agent/policy";
import { PAPER_INCEPTION } from "../lib/portfolio";
import { highWaterMarkCents, latestSettledSnapshot } from "../lib/nav-history";

const APPLY = process.argv.includes("--apply");
const day = etDateStr();

async function main() {
  const [positions, pending, agenda, focus, wakeups, state, settings, contributions, hwmAll, hwmSince, latest, account] = await Promise.all([
    prisma.position.count({ where: { qty: { not: 0 } } }),
    prisma.order.count({ where: { status: "PENDING" } }),
    prisma.agentAgendaItem.findMany({ where: { status: "OPEN" }, select: { id: true, body: true, symbol: true } }),
    prisma.agentFocus.findMany({ select: { symbol: true } }),
    prisma.agentWakeup.count({ where: { status: "PENDING" } }),
    prisma.agentState.findUnique({ where: { id: 1 }, select: { triggerAnchorsJson: true, limitQuietUntil: true, limitQuietReason: true } }),
    prisma.settings.findUnique({ where: { id: 1 }, select: { killSwitch: true, killSwitchBy: true } }),
    prisma.contribution.aggregate({ _sum: { amountCents: true } }),
    highWaterMarkCents(),
    highWaterMarkCents(PAPER_INCEPTION),
    latestSettledSnapshot(),
    prisma.account.findUnique({ where: { id: 1 } }),
  ]);
  const marker = `Startup universe review — skipped (${AGENT_VERSION} reset day 1: D138)`;
  const markerExists = (await prisma.journalEntry.count({ where: { kind: "SYSTEM", title: { startsWith: "Startup universe review" }, at: { gte: new Date(`${day}T04:00:00Z`) } } })) > 0;

  console.log(`${APPLY ? "APPLYING" : "DRY RUN"} — reset day 1 (${day}), PAPER_INCEPTION=${PAPER_INCEPTION.toISOString()}`);
  console.log(`  positions held: ${positions}${positions ? "  ⚠ the book is not flat" : ""}`);
  console.log(`  PENDING orders: ${pending}${pending ? "  ⚠ cancel or finalize them first" : ""}`);
  console.log(`  cash: US$${((account?.usdCashCents ?? 0) / 100).toFixed(2)} + C$${((account?.cashCents ?? 0) / 100).toFixed(2)}`);
  console.log(`  contributions: C$${((contributions._sum.amountCents ?? 0) / 100).toFixed(2)} · latest settled NAV: ${latest ? `C$${(latest.navCents / 100).toFixed(2)} at ${latest.at.toISOString()}` : "none"}`);
  console.log(`  high-water mark: all-time C$${(hwmAll / 100).toFixed(2)} · since inception C$${(hwmSince / 100).toFixed(2)}  (checkDrawdown reads all-time until the agent build passes PAPER_INCEPTION)`);
  console.log(`  kill switch: ${settings?.killSwitch ? `ON (${settings.killSwitchBy})` : "off"} · pause: ${state?.limitQuietUntil && state.limitQuietUntil > new Date() ? `until ${state.limitQuietUntil.toISOString()} (${state.limitQuietReason})` : "none"}`);
  console.log(`  to clear: ${agenda.length} OPEN agenda item(s), ${focus.length} focus name(s), ${wakeups} PENDING wakeup(s), trigger anchors ${state?.triggerAnchorsJson ? "set" : "empty"}`);
  for (const a of agenda) console.log(`    agenda #${a.id}${a.symbol ? ` [${a.symbol}]` : ""}: ${a.body.slice(0, 100)}`);
  if (focus.length) console.log(`    focus: ${focus.map((f) => f.symbol).join(", ")}`);
  console.log(`  boot-scan marker for ${day}: ${markerExists ? "present" : "MISSING (would write)"}`);
  if (!APPLY) {
    console.log("  (dry run — add --apply to write)");
    return;
  }
  const why = `D138 reset day 1 (${day}): the old book was sold flat; this belonged to it.`;
  await prisma.$transaction([
    prisma.agentAgendaItem.updateMany({ where: { status: "OPEN" }, data: { status: "DROPPED", outcome: why, resolvedAt: new Date() } }),
    prisma.agentFocus.deleteMany({}),
    prisma.agentWakeup.updateMany({ where: { status: "PENDING" }, data: { status: "CANCELLED" } }),
    prisma.agentState.update({ where: { id: 1 }, data: { triggerAnchorsJson: null } }),
    ...(markerExists
      ? []
      : [prisma.journalEntry.create({ data: { kind: "SYSTEM", title: marker, body: `Boot-scan marker pre-written for the reset day: the universe persists; no library scan on this boot (D138). Agent ${AGENT_VERSION}.`, agentVersion: AGENT_VERSION } })]),
    prisma.journalEntry.create({
      data: {
        kind: "SYSTEM",
        title: `Run 3 — day 1 (${day}): the launch rehearsal starts from US$${((account?.usdCashCents ?? 0) / 100).toFixed(0)} cash`,
        body: `The paper account was reset over the weekend (D138). Book flat, cash US$${((account?.usdCashCents ?? 0) / 100).toFixed(2)} + C$${((account?.cashCents ?? 0) / 100).toFixed(2)}, contributions re-baselined to C$${((contributions._sum.amountCents ?? 0) / 100).toFixed(2)}. ${agenda.length} stale agenda item(s) dropped, ${focus.length} focus name(s) cleared, trigger anchors reset. Pass marks: ≥US$25,000 invested by Oct 30 (day 5), ≥US$35,000 by Nov 6 (day 10), ≥US$42,500 by Nov 20 (day 20); no round trip inside 30 days; every buy ≥70 with thesis + invalidation + stop; no sell citing a score. Every fill from the old book is kept, the reset sells tagged.`,
        agentVersion: AGENT_VERSION,
      },
    }),
  ]);
  console.log("  done.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
