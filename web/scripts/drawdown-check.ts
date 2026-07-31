// What the §6 drawdown guardrail sees right now: the settled high-water mark, today's NAV, and
// whether that combination would engage the kill switch. Added with D120 — after a phantom mark
// halted the fund twice, "what does the gate actually think?" should be one command, not a hand-
// written query against a table whose rows are not all marks.
//   cd web && npx tsx scripts/drawdown-check.ts
import { highWaterMarkCents } from "../lib/nav-history";
import { getPortfolio } from "../lib/portfolio";
import { HARD } from "../agent/policy";

async function main() {
  const hwm = await highWaterMarkCents();
  const pf = await getPortfolio();
  const bps = hwm > 0 ? Math.round(((pf.navCents - hwm) / hwm) * 10_000) : 0;
  const money = (c: number) => "$" + (c / 100).toFixed(2);
  console.log(`high-water mark (settled) : ${money(hwm)}`);
  console.log(`NAV now                   : ${money(pf.navCents)}`);
  console.log(`drawdown                  : ${(bps / 100).toFixed(2)}%   (kill at ${(HARD.drawdownKillBps / 100).toFixed(0)}%)`);
  console.log(`would engage kill switch  : ${bps <= HARD.drawdownKillBps}`);
  console.log(`kill switch now           : ${pf.killSwitch}${pf.killSwitchBy ? ` (by ${pf.killSwitchBy})` : ""}`);
}
main().then(() => process.exit(0));
