// Manually fire the 9:00 morning research (the "Game plan" brief shown on the Portfolio
// page) — for when the scheduled 9:00–9:30 run was missed (e.g. an agent rebuild killed the
// in-flight session, or the boot startup-scan held the lane past the window). Goes through the
// EXACT scheduled path: it proposes, it never bypasses the §6 order gate. To avoid a double-run,
// only fire this once the 9:30 auto-window has closed (the runner won't also fire it then), or
// after confirming no "Game plan" journal entry exists for today. Usage (inside the agent
// container, where the token is set):
//   docker exec grq-agent npx tsx scripts/run-morning.ts
import { runMorningResearch } from "../agent/sessions";

async function main() {
  console.log("[run-morning] firing morning research (Game plan)…");
  await runMorningResearch();
  console.log("[run-morning] done");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[run-morning] failed:", e);
    process.exit(1);
  });
