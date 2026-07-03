// One-shot APNs delivery test (docs/PUSH-NOTIFICATIONS.md troubleshooting).
// No DB — pass the device row's fields as args so this can't spam anyone:
//   set -a && source ../.env && set +a && npx tsx scripts/test-push.ts <token> <apnsEnv> <bundleId>
import { sendApns } from "../lib/push/apns";

async function main() {
  const [token, apnsEnv = "production", bundleId = "ca.camerontora.grq"] = process.argv.slice(2);
  if (!token) {
    console.error("usage: test-push.ts <deviceToken> [apnsEnv] [bundleId]");
    process.exit(1);
  }
  const results = await sendApns([{ token, apnsEnv, bundleId }], {
    title: "GRQ Go push test",
    body: "If you can read this, push is wired end-to-end. Tap me → TSM. 🎉",
    data: { symbol: "TSM", category: "system" },
  });
  console.log(JSON.stringify(results, null, 2));
  process.exit(results[0]?.ok ? 0 : 2);
}

main();
