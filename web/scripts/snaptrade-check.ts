/**
 * SnapTrade credential check — confirm the partner keys authenticate before
 * trusting the live Accounts flow. Run host-side from web/ (reads web/.env):
 *
 *   npx tsx scripts/snaptrade-check.ts
 *
 * apiStatus is unauthenticated (connectivity only); listSnapTradeUsers is signed,
 * so a green there proves the clientId + consumerKey + signature are all valid.
 * Cam and Graham use SEPARATE partner accounts — both are checked (Graham's is
 * skipped until his keys are set). Read-only throughout.
 */
import "dotenv/config";
import { Snaptrade } from "snaptrade-typescript-sdk";

async function check(label: string, clientId?: string, consumerKey?: string): Promise<void> {
  if (!clientId || !consumerKey) {
    console.log(`• ${label}: not configured (skipped)`);
    return;
  }
  const snaptrade = new Snaptrade({ clientId, consumerKey });
  try {
    const status = await snaptrade.apiStatus.check();
    const online = (status.data as { online?: boolean } | undefined)?.online;
    const users = await snaptrade.authentication.listSnapTradeUsers();
    const n = Array.isArray(users.data) ? users.data.length : "?";
    console.log(`✓ ${label}: OK (api online=${online}, ${n} registered user(s))`);
  } catch (e) {
    const err = e as { status?: number; responseBody?: unknown; message?: string };
    console.error(`✗ ${label}: FAILED`, err.status ?? "", err.responseBody ?? err.message ?? e);
    process.exitCode = 1;
  }
}

(async () => {
  console.log("SnapTrade credential check\n");
  await check("Cam / default partner", process.env.SNAPTRADE_CLIENT_ID, process.env.SNAPTRADE_CONSUMER_KEY);
  await check("Graham partner", process.env.SNAPTRADE_CLIENT_ID_GRAHAM, process.env.SNAPTRADE_CONSUMER_KEY_GRAHAM);
})();
