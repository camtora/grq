/**
 * SnapTrade connection-health probe — answers two questions the Accounts sync
 * currently can't (grq-external-accounts):
 *
 *   1. What does the AUTHORIZATION-level `disabled` flag say for each member's
 *      TD connection? (A disabled connection silently serves cached holdings —
 *      listUserAccounts/getUserAccountPositions never throw, so store.ts can't
 *      see the break today.)
 *   2. Can a Personal key mint a RECONNECT Connection Portal URL
 *      (loginSnapTradeUser + reconnect=<authorizationId>)? If yes, an in-app
 *      one-tap "Reconnect" button is possible.
 *
 * Read-only throughout: listBrokerageAuthorizations is a read; loginSnapTradeUser
 * only mints a short-lived portal link (nothing changes until a human completes
 * the flow in the portal). Run host-side from web/ (reads web/.env):
 *
 *   npx tsx scripts/snaptrade-connections-probe.ts
 */
import "dotenv/config";
import { Snaptrade } from "snaptrade-typescript-sdk";

type AuthRow = {
  id?: string;
  name?: string;
  disabled?: boolean;
  disabled_date?: string | null;
  created_date?: string;
  updated_date?: string;
  type?: string;
  brokerage?: { name?: string; slug?: string };
  meta?: Record<string, unknown>;
};

async function probe(label: string, suffix: "" | "_GRAHAM"): Promise<void> {
  const clientId = process.env[`SNAPTRADE_CLIENT_ID${suffix}`];
  const consumerKey = process.env[`SNAPTRADE_CONSUMER_KEY${suffix}`];
  if (!clientId || !consumerKey) {
    console.log(`• ${label}: not configured (skipped)\n`);
    return;
  }
  const snaptrade = new Snaptrade({ clientId, consumerKey });
  try {
    const users = await snaptrade.authentication.listSnapTradeUsers();
    const userId =
      process.env[`SNAPTRADE_USER_ID${suffix}`] ||
      (Array.isArray(users.data) ? (users.data[0] as string) : undefined);
    const userSecret = process.env[`SNAPTRADE_USER_SECRET${suffix}`] || consumerKey;
    if (!userId) throw new Error("no SnapTrade user provisioned for these keys");

    const r = await snaptrade.connections.listBrokerageAuthorizations({ userId, userSecret });
    const auths = (Array.isArray(r.data) ? r.data : []) as AuthRow[];
    console.log(`✓ ${label}: ${auths.length} connection(s)`);
    for (const a of auths) {
      const broker = a.brokerage?.name ?? a.name ?? "?";
      console.log(
        `    ${broker} · ${a.type ?? "?"} · disabled=${a.disabled === true}` +
          (a.disabled_date ? ` (since ${a.disabled_date})` : "") +
          ` · updated ${a.updated_date ?? "?"} · auth ${a.id ?? "?"}`,
      );
    }

    // Reconnect-URL mint test: prefer a disabled connection, else the first one.
    const target = auths.find((a) => a.disabled) ?? auths[0];
    if (target?.id) {
      const login = await snaptrade.authentication.loginSnapTradeUser({
        userId,
        userSecret,
        connectionType: "read",
        connectionPortalVersion: "v4",
        reconnect: target.id,
      });
      const data = login.data as unknown;
      const url =
        typeof data === "string"
          ? data
          : ((data as { redirectURI?: string } | null)?.redirectURI ?? "");
      console.log(
        url
          ? `    reconnect-URL mint: OK (${new URL(url).host}, ${url.length} chars) for auth ${target.id}`
          : `    reconnect-URL mint: NO URL returned — ${JSON.stringify(data).slice(0, 200)}`,
      );
    } else {
      console.log("    reconnect-URL mint: skipped (no connections)");
    }
  } catch (e) {
    const err = e as { status?: number; responseBody?: unknown; message?: string };
    const body = err.responseBody ? JSON.stringify(err.responseBody).slice(0, 300) : "";
    console.error(`✗ ${label}: FAILED`, err.status ?? "", body || (err.message ?? "").split("\n")[0]);
    process.exitCode = 1;
  }
  console.log("");
}

(async () => {
  console.log("SnapTrade connection-health probe\n");
  await probe("Cam / default partner", "");
  await probe("Graham partner", "_GRAHAM");
})();
