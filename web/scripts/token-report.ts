/**
 * Token inventory for the autonomous agent's Claude sessions (AgentUsage rows).
 *
 *   npx tsx scripts/token-report.ts            # since ET midnight today
 *   npx tsx scripts/token-report.ts 24h        # last 24 hours
 *   npx tsx scripts/token-report.ts 7d         # last 7 days
 *
 * The agent runs on Cam's shared Claude Max token, so this shows how much of that quota the
 * agent ate, broken down by session type. Run it the morning after a heavy day to see what burned.
 */
import { getUsageWindow, splitByWallet, etDayStart, fmtTokens, fmtUsd } from "../lib/usage";
import { prisma } from "../lib/db";

function parseSince(arg: string | undefined): { since: Date; label: string } {
  if (!arg) return { since: etDayStart(), label: "today (since ET midnight)" };
  const m = arg.match(/^(\d+)\s*([hd])$/i);
  if (m) {
    const n = Number(m[1]);
    const ms = (m[2].toLowerCase() === "h" ? 3600 : 86400) * 1000 * n;
    return { since: new Date(Date.now() - ms), label: `last ${n}${m[2].toLowerCase()}` };
  }
  // Treat as YYYY-MM-DD start (UTC-ish); fall back to today.
  const d = new Date(arg);
  if (!isNaN(d.getTime())) return { since: d, label: `since ${arg}` };
  return { since: etDayStart(), label: "today (since ET midnight)" };
}

async function main() {
  const { since, label } = parseSince(process.argv[2]);
  const { totals, byGroup, rows } = await getUsageWindow(since);
  const wallet = splitByWallet(rows);

  const pad = (s: string, n: number) => s.padEnd(n);
  const rpad = (s: string, n: number) => s.padStart(n);

  console.log(`\n  GRQ agent token usage — ${label}`);
  console.log(`  (${rows.length} calls across TWO wallets: Cam's shared Claude Max quota, and metered OpenRouter challengers)\n`);

  if (rows.length === 0) {
    console.log("  No sessions logged in this window yet.\n");
    await prisma.$disconnect();
    return;
  }

  console.log("  " + pad("SESSION TYPE", 22) + rpad("RUNS", 6) + rpad("TOKENS", 12) + rpad("AVG/RUN", 12) + rpad("SHARE", 8));
  console.log("  " + "-".repeat(60));
  for (const g of byGroup) {
    const pct = Math.round((g.total / Math.max(1, totals.total)) * 100);
    console.log(
      "  " +
        pad(g.group, 22) +
        rpad(String(g.calls), 6) +
        rpad(fmtTokens(g.total), 12) +
        rpad(fmtTokens(Math.round(g.total / Math.max(1, g.calls))), 12) +
        rpad(pct + "%", 8),
    );
  }
  console.log("  " + "-".repeat(60));
  console.log(
    "  " + pad("TOTAL", 22) + rpad(String(totals.calls), 6) + rpad(fmtTokens(totals.total), 12) + rpad("", 12) + rpad("100%", 8),
  );

  console.log("\n  Breakdown:");
  console.log(`    fresh input : ${fmtTokens(totals.input)}`);
  console.log(`    output      : ${fmtTokens(totals.output)}`);
  console.log(`    cache write : ${fmtTokens(totals.cacheWrite)}`);
  console.log(`    cache read  : ${fmtTokens(totals.cacheRead)}  (cheap, but counts toward volume)`);
  // Two wallets, never summed (D118d). The Max plan bills a flat subscription — its `costMicroUsd` is
  // what the calls WOULD have cost metered, not money spent — while the OpenRouter challengers spend
  // real dollars. This line used to add them up and call the result "est. cost".
  console.log(`    max quota   : ${fmtTokens(wallet.max.total)} over ${wallet.max.calls} Claude session(s)`);
  console.log(`    notional $  : ${wallet.max.costMicroUsd > 0 ? fmtUsd(wallet.max.costMicroUsd) : "—"}  (what Max would cost metered — NOT money spent)`);
  console.log(
    `    metered $   : ${wallet.metered.calls > 0 ? fmtUsd(wallet.metered.costMicroUsd) : "—"}  (REAL spend — ${wallet.metered.calls} OpenRouter challenger call(s), ${fmtTokens(wallet.metered.total)})`,
  );
  console.log("");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
