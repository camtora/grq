import { prisma } from "../db";
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
  | "dossiers" // a requested research dossier is ready
  | "hunt" // new hunt names / directed-hunt / smart-money scan
  | "agentMoves" // the agent self-tracks or self-promotes a name
  | "reports" // morning plan / midday / EOD / weekly review
  | "members" // the OTHER member's universe/directive/kill actions
  | "system" // agent restarts, data-feed/broker hiccups (non-critical)
  | "priceTargets"; // a price alert the member set has crossed (Phase 2 — The Wire)

type Severity = "info" | "warning" | "critical";

const FORCED: ReadonlySet<NotifCategory> = new Set(["trades", "risk"]);

// Map a category → the NotificationPreference column that gates it. trades/risk
// are absent on purpose (forced on); the rest line up with the schema booleans.
const PREF_FIELD: Partial<Record<NotifCategory, keyof PrefRow>> = {
  dossiers: "dossiers",
  hunt: "hunt",
  agentMoves: "agentMoves",
  reports: "reports",
  members: "members",
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
};

/** Fan an alert out to every eligible member's devices. Best-effort. */
export async function pushNotify(opts: PushOpts): Promise<void> {
  if (!apnsConfigured()) return;
  try {
    const devices = await prisma.deviceToken.findMany();
    if (devices.length === 0) return;

    const actor = opts.actorEmail?.trim().toLowerCase() ?? null;
    const only = opts.onlyEmail?.trim().toLowerCase() ?? null;
    const emails = [...new Set(devices.map((d) => d.email))];
    const prefRows = (await prisma.notificationPreference.findMany({
      where: { email: { in: emails } },
    })) as PrefRow[];
    const prefBy = new Map(prefRows.map((p) => [p.email, p]));

    const forced = FORCED.has(opts.category) || opts.severity === "critical";

    const eligible = new Set(
      emails.filter((email) => {
        if (only && email !== only) return false; // personal alert → owner only
        if (actor && email === actor) return false; // don't notify the actor
        if (forced) return true;
        const field = PREF_FIELD[opts.category];
        if (!field) return true; // unknown category → fail open (still informs)
        const pref = prefBy.get(email);
        return pref ? pref[field] !== false : true; // no row → all-on default
      }),
    );

    const targets = devices.filter((d) => eligible.has(d.email));
    if (targets.length === 0) return;

    const envBy = new Map(targets.map((d) => [d.token, d.apnsEnv]));
    const results = await sendApns(
      targets.map((d) => ({ token: d.token, apnsEnv: d.apnsEnv })),
      {
        title: opts.title,
        body: (opts.body || opts.title).slice(0, 300),
        threadId: opts.symbol ?? opts.category,
        data: { category: opts.category, ...(opts.symbol ? { symbol: opts.symbol } : {}) },
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
