// NB: no `import "server-only"` — pulled in (via lib/external/store) by the agent runner's
// nightly accounts sync, where `server-only` isn't resolvable (it crash-loops the agent).
// Server-side only by use; the SnapTrade keys are read from process.env, never client-bundled.
import { Snaptrade } from "snaptrade-typescript-sdk";

// ───────────────────────────────────────────────────────────────────────────
// SnapTrade — READ-ONLY by construction.
//
// This module is the ONLY door between GRQ and SnapTrade. It instantiates the
// official SDK but deliberately touches ONLY its read namespaces
// (apiStatus / authentication / accountInformation / connections). The
// `snaptrade.trading.*` API is never imported or called anywhere in the app, and
// every connection we create passes `connectionType: "read"` so SnapTrade itself
// rejects any trade placed on it. Together with the fact that this data never
// reaches web/lib/broker or the agent, the members' personal TFSA accounts are
// VISIBILITY ONLY — nothing here can move their money. (grq-external-accounts.)
//
// MULTI-PARTNER: each member resolves to a SnapTrade *partner* account (clientId +
// consumerKey) — Cam and Graham use SEPARATE partner accounts (separate free-tier /
// billing). Every call therefore takes the partner to use; the caller (store.ts)
// resolves it from the member's email. Clients are cached per clientId.
// ───────────────────────────────────────────────────────────────────────────

export type SnaptradePartner = { clientId: string; consumerKey: string };

const clients = new Map<string, Snaptrade>();

function clientFor(p: SnaptradePartner): Snaptrade {
  let c = clients.get(p.clientId);
  if (!c) {
    c = new Snaptrade({ clientId: p.clientId, consumerKey: p.consumerKey });
    clients.set(p.clientId, c);
  }
  return c;
}

/** Liveness/credential check for a partner — calls the API status endpoint. */
export async function snaptradeStatus(p: SnaptradePartner): Promise<unknown> {
  const r = await clientFor(p).apiStatus.check();
  return r.data;
}

/** The userIds registered under this partner key. For a Personal key this returns
 *  the single auto-provisioned user (whose id is the SnapTrade login email); we
 *  use it to discover the userId without a register step (which Personal keys
 *  forbid — error 1012). */
export async function listSnaptradeUsers(p: SnaptradePartner): Promise<string[]> {
  const r = await clientFor(p).authentication.listSnapTradeUsers();
  return (Array.isArray(r.data) ? r.data : []) as string[];
}

/** Generate the Connection Portal URL for a member to connect a brokerage.
 *  ALWAYS read-only: connectionType "read" is the provider-enforced lock — the
 *  connection it produces can fetch data but can never place a trade. */
export async function readOnlyConnectUrl(
  p: SnaptradePartner,
  args: {
    userId: string;
    userSecret: string;
    customRedirect?: string;
    broker?: string;
    darkMode?: boolean;
  },
): Promise<string> {
  const r = await clientFor(p).authentication.loginSnapTradeUser({
    userId: args.userId,
    userSecret: args.userSecret,
    connectionType: "read", // ← the read-only lock. Do not change.
    customRedirect: args.customRedirect,
    broker: args.broker,
    darkMode: args.darkMode,
    connectionPortalVersion: "v4",
  });
  const data = r.data as unknown;
  const url =
    typeof data === "string"
      ? data
      : (data as { redirectURI?: string } | null)?.redirectURI;
  if (!url) throw new Error("SnapTrade did not return a redirect URI");
  return url;
}

/** All brokerage accounts SnapTrade knows for this member (across connections). */
export async function listSnaptradeAccounts(
  p: SnaptradePartner,
  args: { userId: string; userSecret: string },
): Promise<unknown[]> {
  const r = await clientFor(p).accountInformation.listUserAccounts({
    userId: args.userId,
    userSecret: args.userSecret,
  });
  return (r.data ?? []) as unknown[];
}

/** Stock/ETF/fund positions in one account (read). */
export async function listSnaptradePositions(
  p: SnaptradePartner,
  args: { userId: string; userSecret: string; accountId: string },
): Promise<unknown[]> {
  const r = await clientFor(p).accountInformation.getUserAccountPositions({
    userId: args.userId,
    userSecret: args.userSecret,
    accountId: args.accountId,
  });
  return (r.data ?? []) as unknown[];
}

/** Best-effort: delete the member's SnapTrade user (and all their connections)
 *  when they disconnect. Read-only throughout. */
export async function deleteSnaptradeUser(p: SnaptradePartner, userId: string): Promise<void> {
  await clientFor(p).authentication.deleteSnapTradeUser({ userId });
}
