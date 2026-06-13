import type { Tier } from "../lib/universe";

export const AGENT_VERSION = "v1.0-phase2";

// Hard limits — humans edit this file, the agent never does (D11).
export const HARD = {
  maxPositions: 8,
  maxOrdersPerDay: 10,
  maxOrdersPerHour: 4,
  dailyLossPauseBps: -300, // day P&L ≤ −3% NAV → no new buys today
  drawdownKillBps: -1500, // NAV ≤ −15% from high-water mark → kill switch
  feeEdgeMultiple: 3, // thesis target must clear ≥ 3× round-trip commissions
  warmupMs: 5 * 60_000, // no agent trading for 5 min after a restart
  noEntriesFirstMin: 15, // no new BUYs in the first 15 min of the session
  noEntriesLastMin: 15, // …or the last 15
  maxDecisionSessionsPerDay: 4, // Fable escalations are budgeted
  triageCooldownMs: 30 * 60_000, // per-symbol trigger cooldown
};

export type DialPolicy = {
  maxPositionPct: number; // of NAV, post-trade
  cashFloorPct: number; // of NAV, post-trade
  tiers: Tier[];
  stopPct: number; // deterministic stop distance below ACB
  maxNewTradesPerWeek: number; // BUY orders, rolling 7 days
};

export const DIALS: Record<"CAUTIOUS" | "BALANCED" | "AGGRESSIVE", DialPolicy> = {
  CAUTIOUS: { maxPositionPct: 10, cashFloorPct: 30, tiers: ["etf", "large"], stopPct: 5, maxNewTradesPerWeek: 2 },
  BALANCED: { maxPositionPct: 15, cashFloorPct: 15, tiers: ["etf", "large", "mid"], stopPct: 8, maxNewTradesPerWeek: 5 },
  AGGRESSIVE: { maxPositionPct: 25, cashFloorPct: 0, tiers: ["etf", "large", "mid"], stopPct: 12, maxNewTradesPerWeek: 10 },
};

// Seed research sources (Cam, 2026-06-12). The agent self-curates over time:
// retros grade source hit-rates; adds/drops are proposed in weekly reviews.
export const SOURCES = [
  "BNN Bloomberg",
  "CBC Business",
  "MSNBC / CNBC",
  "New York Times Business",
  "Toronto Star Business",
  "Wall Street Journal",
];

export const MACRO_SWEEP = ["gold", "oil (WTI/WCS)", "CAD/USD", "Bank of Canada / Fed rates", "geopolitics affecting the TSX"];

export const MODELS = {
  // Decision tier: Opus 4.8 (2026-06-13 — Fable 5 access broke overnight, the
  // Max token returns "model may not exist or you may not have access"; Opus is
  // the flagship the token can reach). Override per-env with GRQ_MODEL_DECISION.
  decision: process.env.GRQ_MODEL_DECISION ?? "claude-opus-4-8",
  triage: process.env.GRQ_MODEL_TRIAGE ?? "claude-haiku-4-5-20251001",
};
