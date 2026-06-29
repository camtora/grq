// Manually fire a scheduled intraday check-in (the same session the runner fires at each
// CHECKIN_TIMES_ET slot) — for when a slot was missed (e.g. an agent restart killed the
// in-flight session). Goes through the EXACT scheduled-check-in path: it proposes, it never
// bypasses the §6 order gate. Usage (inside the agent container, where the token is set):
//   docker exec grq-agent npx tsx scripts/run-checkin.ts "manual — missed 10:00 ET"
import { runScheduledCheckin } from "../agent/sessions";

async function main() {
  const reason = process.argv.slice(2).join(" ").trim() || "manual check-in";
  console.log(`[run-checkin] firing scheduled check-in: ${reason}`);
  await runScheduledCheckin(reason);
  console.log("[run-checkin] done");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[run-checkin] failed:", e);
    process.exit(1);
  });
