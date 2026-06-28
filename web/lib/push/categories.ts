// The push-notification catalog — the single source of truth for which categories
// exist, what they mean, and which are user-toggleable. The web Settings UI renders
// from this; the iOS settings screen mirrors the same copy (docs/PUSH-NOTIFICATIONS.md).
//
// "Always-on": Trades, Risk, FX approvals, and Messages are non-toggleable, and any
// critical-severity alert (agent crash, drawdown halt) pushes regardless of toggles.
// (Messages forced on for everyone — Cam 2026-06-25.) Everything else defaults ON
// and can be muted per-user.

export const TOGGLEABLE_CATEGORIES = [
  { key: "dossiers", label: "Research dossiers", desc: "A dossier you or the agent requested is ready." },
  { key: "hunt", label: "The Hunt & ideas", desc: "New hunt names, directed-hunt results, and smart-money scans." },
  { key: "agentMoves", label: "Agent universe moves", desc: "When the agent tracks or self-promotes a name into its tradeable universe." },
  { key: "reports", label: "Daily reports", desc: "Morning plan, midday brief, end-of-day close, and the weekly review." },
  { key: "checkins", label: "Intraday check-ins", desc: "The agent's hourly fund-level read on the whole portfolio and plan (“Intraday Check-in — …”)." },
  { key: "holdingChecks", label: "Position notes", desc: "A per-name read when one of your holdings makes a fresh ±4% move (“Position Note — ATD: …”). Fires once per move, not per tick." },
  { key: "members", label: "Member activity", desc: "When the other member blocks, pins, promotes, or demotes a name." },
  { key: "system", label: "System health", desc: "Agent restarts and data-feed or broker hiccups (non-critical)." },
  { key: "priceTargets", label: "Price alerts", desc: "When a stock you set an alert on crosses your target price." },
  { key: "optionsDesk", label: "Options Desk", desc: "When the experimental Options Desk opens or settles an option — a nudge to go read the teaching card. Sandbox only; never the real fund." },
] as const;

export type ToggleKey = (typeof TOGGLEABLE_CATEGORIES)[number]["key"];

// Shown read-only in settings so members know what they'll always receive.
export const ALWAYS_ON = [
  { label: "Trades", desc: "Every buy, sell, stop, and take-profit fill." },
  { label: "Risk & safety", desc: "Kill switch, drawdown halt, and daily-loss pause." },
  { label: "FX approvals", desc: "When the agent asks to convert CAD→USD to fund a US name — needs your OK." },
  { label: "Messages", desc: "When the other member sends you a message or shares a stock." },
  { label: "Critical outages", desc: "Agent crashes and total data-feed failures." },
] as const;

export type NotificationPrefs = Record<ToggleKey, boolean>;

/** All-on — the default when a member has never touched their settings. */
export function defaultPrefs(): NotificationPrefs {
  return { dossiers: true, hunt: true, agentMoves: true, reports: true, checkins: true, holdingChecks: true, members: true, system: true, priceTargets: true, optionsDesk: true };
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
