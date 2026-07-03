// Manually fire a daily market brief (the "The Market Today" paragraph on Today, under Headlines).
// Same path the runner fires at ~7:30 AM (AM) and ~6:00 PM (PM) ET. Usage (inside the agent container):
//   docker exec grq-agent npx tsx scripts/run-market-brief.ts [AM|PM]
import { runMarketBrief } from "../agent/sessions";

async function main() {
  const arg = (process.argv[2] || "").toUpperCase();
  const edition: "AM" | "PM" = arg === "AM" ? "AM" : "PM";
  console.log(`[run-market-brief] firing ${edition} edition…`);
  await runMarketBrief(edition);
  console.log("[run-market-brief] done");
}
main().then(() => process.exit(0)).catch((e) => { console.error("[run-market-brief] failed:", e); process.exit(1); });
