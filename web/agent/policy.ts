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
  minBuyConfidence: 75, // conviction gate (Graham, 2026-06-14): no BUY below 75% thesis confidence
  warmupMs: 5 * 60_000, // no agent trading for 5 min after a restart
  noEntriesFirstMin: 15, // no new BUYs in the first 15 min of the session
  noEntriesLastMin: 15, // …or the last 15
  maxDecisionSessionsPerDay: 4, // Fable escalations are budgeted
  triageCooldownMs: 30 * 60_000, // per-symbol trigger cooldown
};

// Agent self-investing (D30): the agent may promote a CANDIDATE it has RESEARCHED
// and has conviction on straight into the tradeable universe — bounded by these
// rules (the deterministic liquidity screen still runs on top). The human
// watchlist→universe path (two-person) is unchanged; the §6 order gate and the
// block/demote/kill overrides ALWAYS still apply. Humans edit this; the agent never
// does (D11). Flip GRQ_AGENT_SELF_PROMOTE=false to disable without a deploy.
export const SELF_INVEST = {
  enabled: (process.env.GRQ_AGENT_SELF_PROMOTE ?? "true").toLowerCase() !== "false",
  allowedStances: ["Strong Buy", "Buy"] as const, // must be a genuine buy call
  minConfidence: HARD.minBuyConfidence, // ≥75, same bar as the BUY gate
  maxPerRollingWeek: 2, // anti-runaway: ≤2 self-promotions / rolling 7 days
  maxUniverseSize: 60, // anti-runaway: total ACTIVE cap
  promotableTiers: ["large", "mid"] as const, // ETFs stay human-curated; default "mid"
};

export type DialPolicy = {
  maxPositionPct: number; // of NAV, post-trade
  cashFloorPct: number; // of NAV, post-trade
  tiers: Tier[];
  stopPct: number; // deterministic stop distance below ACB
  takeProfitPct: number; // deterministic take-profit distance above ACB (claim the gain)
  maxNewTradesPerWeek: number; // BUY orders, rolling 7 days
};

export const DIALS: Record<"CAUTIOUS" | "BALANCED" | "AGGRESSIVE", DialPolicy> = {
  CAUTIOUS: { maxPositionPct: 10, cashFloorPct: 30, tiers: ["etf", "large"], stopPct: 5, takeProfitPct: 15, maxNewTradesPerWeek: 2 },
  BALANCED: { maxPositionPct: 15, cashFloorPct: 15, tiers: ["etf", "large", "mid"], stopPct: 8, takeProfitPct: 25, maxNewTradesPerWeek: 5 },
  AGGRESSIVE: { maxPositionPct: 25, cashFloorPct: 0, tiers: ["etf", "large", "mid"], stopPct: 12, takeProfitPct: 40, maxNewTradesPerWeek: 10 },
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

// Account type → the CRA tax treatment the agent must reason about. Cam framed
// it as "we'll pay capital gains on profits", so the default is a non-registered
// (taxable) account; a TFSA (GRQ_ACCOUNT_TYPE=TFSA) makes gains tax-free. The
// owner/account decision lives in docs/OWNERSHIP.md.
export const ACCOUNT_TYPE = (process.env.GRQ_ACCOUNT_TYPE ?? "UNREGISTERED").toUpperCase();

export const TAX_CONTEXT: Record<string, string> = {
  TFSA: "Account: TFSA — realized gains are tax-FREE. But the CRA can reclassify a frequently-trading TFSA as carrying on a business and tax all of it, so keep the swing-trade cadence (never day-trading) to protect the shelter. No capital-gains tax to model — just don't churn.",
  RRSP: "Account: RRSP — tax-deferred; there's no capital-gains event on trades inside it (withdrawals are taxed as income).",
  UNREGISTERED:
    "Account: non-registered (taxable). Realized gains are capital gains — half the gain is taxable at the members' marginal rate, so a 10% gross gain is worth noticeably less after tax. Factor the AFTER-TAX gain into every thesis, prefer letting winners run over churning short-term gains, and harvest losses against gains where it's clean — never tripping the superficial-loss rule (already enforced in code).",
};

export const taxContext = (): string => TAX_CONTEXT[ACCOUNT_TYPE] ?? TAX_CONTEXT.UNREGISTERED;

export const MODELS = {
  // Decision tier: Opus 4.8 (2026-06-13 — Fable 5 access broke overnight, the
  // Max token returns "model may not exist or you may not have access"; Opus is
  // the flagship the token can reach). Override per-env with GRQ_MODEL_DECISION.
  decision: process.env.GRQ_MODEL_DECISION ?? "claude-opus-4-8",
  triage: process.env.GRQ_MODEL_TRIAGE ?? "claude-haiku-4-5-20251001",
};
