// Manually (re)generate the daily "build diary" change report for Graham. The runner
// fires this at 3am ET on its own; run it by hand to seed the first one or to re-summarize
// after a fix. Upserts the CHANGE Report for the just-closed 3am→3am window (dated
// yesterday). Must run where both CLAUDE_CODE_OAUTH_TOKEN and GITHUB_TOKEN are set — i.e.
// inside the agent container:  docker exec grq-agent npx tsx scripts/gen-change-report.ts
import { runDailyChangeReport } from "../agent/sessions";

runDailyChangeReport()
  .then(() => {
    console.log("[gen-change-report] done");
    process.exit(0);
  })
  .catch((e) => {
    console.error("[gen-change-report] failed:", e);
    process.exit(1);
  });
