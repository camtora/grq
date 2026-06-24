// The push-notification catalog — the single source of truth for which categories
// exist, what they mean, and which are user-toggleable. The web Settings UI renders
// from this; the iOS settings screen mirrors the same copy (docs/PUSH-NOTIFICATIONS.md).
//
// "Always-on" (Cam, 2026-06-22): Trades + Risk are non-toggleable, and any
// critical-severity alert (agent crash, drawdown halt) pushes regardless of toggles.
// Everything else defaults ON and can be muted per-user.

export const TOGGLEABLE_CATEGORIES = [
  { key: "dossiers", label: "Research dossiers", desc: "A dossier you or the agent requested is ready." },
  { key: "hunt", label: "The Hunt & ideas", desc: "New hunt names, directed-hunt results, and smart-money scans." },
  { key: "agentMoves", label: "Agent universe moves", desc: "When the agent tracks or self-promotes a name into its tradeable universe." },
  { key: "reports", label: "Daily reports", desc: "Morning plan, midday brief, end-of-day close, and the weekly review." },
  { key: "checkins", label: "Scheduled check-ins", desc: "The agent's hourly fund-level check-ins — its read on the whole portfolio and plan." },
  { key: "holdingChecks", label: "Held-position check-ins", desc: "Per-name reads when a holding moves or the agent revisits it — “ATD — no trade”, “IFC — hold”. Gets noisy as the portfolio grows." },
  { key: "members", label: "Member activity", desc: "When the other member blocks, pins, promotes, or demotes a name." },
  { key: "messages", label: "Messages", desc: "When the other member sends you a message or shares a stock." },
  { key: "system", label: "System health", desc: "Agent restarts and data-feed or broker hiccups (non-critical)." },
  { key: "priceTargets", label: "Price alerts", desc: "When a stock you set an alert on crosses your target price." },
] as const;

export type ToggleKey = (typeof TOGGLEABLE_CATEGORIES)[number]["key"];

// Shown read-only in settings so members know what they'll always receive.
export const ALWAYS_ON = [
  { label: "Trades", desc: "Every buy, sell, stop, and take-profit fill." },
  { label: "Risk & safety", desc: "Kill switch, drawdown halt, and daily-loss pause." },
  { label: "FX approvals", desc: "When the agent asks to convert CAD→USD to fund a US name — needs your OK." },
  { label: "Critical outages", desc: "Agent crashes and total data-feed failures." },
] as const;

export type NotificationPrefs = Record<ToggleKey, boolean>;

/** All-on — the default when a member has never touched their settings. */
export function defaultPrefs(): NotificationPrefs {
  return { dossiers: true, hunt: true, agentMoves: true, reports: true, checkins: true, holdingChecks: true, members: true, messages: true, system: true, priceTargets: true };
}

/** Normalize a DB row (or null) into the flat toggle object the API returns. */
export function prefsFromRow(row: Partial<NotificationPrefs> | null | undefined): NotificationPrefs {
  const d = defaultPrefs();
  if (!row) return d;
  for (const { key } of TOGGLEABLE_CATEGORIES) {
    if (typeof row[key] === "boolean") d[key] = row[key] as boolean;
  }
  return d;
}
