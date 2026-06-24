import { prisma } from "../db";
import { memberEmails } from "../users";
import { apnsConfigured, sendApns } from "./apns";

// The push fan-out. Sits beside the Discord chokepoint (web/agent/alerts.ts): the
// same events go to each member's registered iOS devices, gated by their per-user
// NotificationPreference. Configured-or-no-op; failures never take the caller down.
//
// "Always-on" (Cam, 2026-06-22): the `trades` and `risk` categories are forced on
// (non-toggleable), AND any critical-severity alert (agent crash, drawdown halt)
// pushes regardless of toggles — that's the "system outages" guarantee. Everything
// else is per-user, default ON.

export type NotifCategory =
  | "trades" // order fills, stops, take-profits — FORCED ON
  | "risk" // kill switch, drawdown halt, daily-loss pause — FORCED ON
  | "fx" // an FX (CAD→USD) conversion needs a member's approval — FORCED ON (actionable, D62)
  | "dossiers" // a requested research dossier is ready
  | "hunt" // new hunt names / directed-hunt / smart-money scan
  | "agentMoves" // the agent self-tracks or self-promotes a name
  | "reports" // morning plan / midday / EOD / weekly review
  | "members" // the OTHER member's universe/directive/kill actions
  | "messages" // the OTHER member messaged you or shared a stock (D61)
  | "system" // agent restarts, data-feed/broker hiccups (non-critical)
  | "priceTargets"; // a price alert the member set has crossed (Phase 2 — The Wire)

type Severity = "info" | "warning" | "critical";

const FORCED: ReadonlySet<NotifCategory> = new Set(["trades", "risk", "fx"]);

// Map a category → the NotificationPreference column that gates it. trades/risk
// are absent on purpose (forced on); the rest line up with the schema booleans.
const PREF_FIELD: Partial<Record<NotifCategory, keyof PrefRow>> = {
  dossiers: "dossiers",
  hunt: "hunt",
  agentMoves: "agentMoves",
  reports: "reports",
  members: "members",
  messages: "messages",
  system: "system",
  priceTargets: "priceTargets",
};

type PrefRow = {
  email: string;
  dossiers: boolean;
  hunt: boolean;
  agentMoves: boolean;
  reports: boolean;
  members: boolean;
  messages: boolean;
  system: boolean;
  priceTargets: boolean;
};

// APNs reasons (or a 410) that mean the token is dead and should be pruned.
const DEAD_REASONS = new Set(["Unregistered", "BadDeviceToken", "DeviceTokenNotForTopic", "ExpiredToken"]);

export type PushOpts = {
  category: NotifCategory;
  severity: Severity;
  title: string;
  body?: string;
  /** Skip this member (e.g. don't ping the member who took the action). */
  actorEmail?: string;
  /** Restrict the fan-out to a single member (e.g. a personal price alert). */
  onlyEmail?: string;
  /** Symbol for lock-screen grouping + a deep link in the app. */
  symbol?: string;
  /** Panel key (e.g. "analyst") — deep-links to that section of the dossier (D61). */
  panel?: string;
};

/** Which members should receive this alert — resolved from the member list (NOT
 *  device tokens), so the web feed reaches a phone-less member. Applies the same
 *  actor/onlyEmail/forced/per-preference gating the push fan-out used to do. */
async function eligibleRecipients(opts: PushOpts): Promise<string[]> {
  const actor = opts.actorEmail?.trim().toLowerCase() ?? null;
  const only = opts.onlyEmail?.trim().toLowerCase() ?? null;
  const forced = FORCED.has(opts.category) || opts.severity === "critical";
  const field = PREF_FIELD[opts.category];

  let candidates = memberEmails();
  if (only) candidates = candidates.filter((e) => e === only); // personal alert → owner only
  if (actor) candidates = candidates.filter((e) => e !== actor); // don't notify the actor
  if (forced || !field) return candidates; // forced / unknown category → everyone left

  const prefRows = (await prisma.notificationPreference.findMany({
    where: { email: { in: candidates } },
  })) as PrefRow[];
  const prefBy = new Map(prefRows.map((p) => [p.email, p]));
  return candidates.filter((email) => {
    const pref = prefBy.get(email);
    return pref ? pref[field] !== false : true; // no row → all-on default
  });
}

/** Store the alert in the web notification center (the header bell) — one row per
 *  recipient. The `messages` category is excluded: the envelope/unread badge
 *  (DirectMessage) owns member conversations. Best-effort; never throws upward. */
async function persistNotifications(opts: PushOpts, recipients: string[]): Promise<void> {
  if (opts.category === "messages" || recipients.length === 0) return;
  try {
    await prisma.notification.createMany({
      data: recipients.map((email) => ({
        email,
        category: opts.category,
        severity: opts.severity,
        title: opts.title.slice(0, 300),
        body: (opts.body ?? "").slice(0, 1000),
        symbol: opts.symbol ?? null,
        panel: opts.panel ?? null,
      })),
    });
  } catch (e) {
    console.error("persistNotifications failed", e);
  }
}

/** Fan an alert out: persist it to each eligible member's bell feed, then push to
 *  their iOS devices. Best-effort — the feed write happens even with APNs unset. */
export async function pushNotify(opts: PushOpts): Promise<void> {
  const recipients = await eligibleRecipients(opts);

  // 1) The web notification center — independent of APNs config / device tokens.
  await persistNotifications(opts, recipients);

  // 2) The iOS push fan-out — no-op if APNs isn't configured or no one's on a phone.
  if (!apnsConfigured() || recipients.length === 0) return;
  try {
    const recipientSet = new Set(recipients);
    const devices = await prisma.deviceToken.findMany();
    const targets = devices.filter((d) => recipientSet.has(d.email));
    if (targets.length === 0) return;

    const envBy = new Map(targets.map((d) => [d.token, d.apnsEnv]));
    const results = await sendApns(
      targets.map((d) => ({ token: d.token, apnsEnv: d.apnsEnv })),
      {
        title: opts.title,
        body: (opts.body || opts.title).slice(0, 300),
        threadId: opts.symbol ?? opts.category,
        data: {
          category: opts.category,
          ...(opts.symbol ? { symbol: opts.symbol } : {}),
          ...(opts.panel ? { panel: opts.panel } : {}),
        },
      },
    );

    // Self-heal: persist the gateway that actually delivered when it differs from what
    // we had stored (a dev-signed Release build mis-reports its env). Next send goes
    // straight to the right gateway.
    for (const r of results) {
      if (r.ok && r.deliveredEnv && envBy.get(r.token) !== r.deliveredEnv) {
        await prisma.deviceToken.updateMany({ where: { token: r.token }, data: { apnsEnv: r.deliveredEnv } }).catch(() => {});
      }
    }

    const dead = results.filter((r) => !r.ok && (r.status === 410 || (r.reason && DEAD_REASONS.has(r.reason)))).map((r) => r.token);
    if (dead.length) {
      await prisma.deviceToken.deleteMany({ where: { token: { in: dead } } }).catch(() => {});
    }
  } catch (e) {
    console.error("pushNotify failed", e);
  }
}

/** Tell a member's iOS devices to clear their delivered notifications + zero the
 *  app badge (D64). A SILENT (background) push carrying `{ clear: "all" }` — the app
 *  handles it by calling removeAllDeliveredNotifications(). Fired when the member
 *  opens the web notification bell, so the lock-screen pile clears once they've
 *  triaged on the desktop. No preference gating (housekeeping). Best-effort: iOS
 *  throttles background pushes and won't deliver to a force-quit app — the app's
 *  foreground reconcile is the catch-up net. Configured-or-no-op. */
export async function pushClear(email: string): Promise<void> {
  if (!apnsConfigured()) return;
  try {
    const devices = await prisma.deviceToken.findMany({ where: { email: email.trim().toLowerCase() } });
    if (devices.length === 0) return;

    const results = await sendApns(
      devices.map((d) => ({ token: d.token, apnsEnv: d.apnsEnv })),
      { silent: true, badge: 0, title: "", body: "", data: { clear: "all" } },
    );

    const dead = results.filter((r) => !r.ok && (r.status === 410 || (r.reason && DEAD_REASONS.has(r.reason)))).map((r) => r.token);
    if (dead.length) {
      await prisma.deviceToken.deleteMany({ where: { token: { in: dead } } }).catch(() => {});
    }
  } catch (e) {
    console.error("pushClear failed", e);
  }
}
