import type { Tier } from "../lib/universe";

// Provenance stamp on every agent-authored record (Settings "on duty", trades, journal
// entries, proposals). Convention `v<major>.<minor>-phase<N>` (D77):
//   major — a deliberate full re-architecture of the agent (still 1); promoting it resets the minor.
//   minor — BUMP +1 ON EVERY AGENT REDEPLOY. Seeded at 48 = the count of DECISIONS.md entries
//           that changed the agent's behaviour/guardrails through D76 (2026-06-25); from here it
//           just tracks deploys. The CLAUDE.md deploy block carries the rule so it isn't forgotten.
//   phase — the PROJECT_PLAN §9 project phase (phase4).
// Edit this constant in the SAME build you ship, so the new stamp is honest.
export const AGENT_VERSION = "v2.2-phase4";

// Hard limits — humans edit this file, the agent never does (D11).
export const HARD = {
  // No cap on the NUMBER of distinct holdings (Cam, 2026-06-22, D52): breadth is the
  // agent's call. Still bounded by maxUniverseSize (eligible names), the dial's
  // maxNewTradesPerWeek + cashFloorPct, the fee-edge floor, and the order-rate caps below.
  maxOrdersPerDay: 10,
  maxOrdersPerHour: 4,
  dailyLossPauseBps: -300, // day P&L ≤ −3% NAV → no new buys today
  drawdownKillBps: -1500, // NAV ≤ −15% from high-water mark → kill switch
  feeEdgeMultiple: 3, // thesis target must clear ≥ 3× round-trip commissions
  minBuyConfidence: 75, // conviction gate (Graham, 2026-06-14): no BUY below 75% thesis confidence
  warmupMs: 5 * 60_000, // no agent trading for 5 min after a restart
  noEntriesFirstMin: 15, // no new BUYs in the first 15 min of the session
  noEntriesLastMin: 15, // …or the last 15
  maxDecisionSessionsPerDay: 6, // AD-HOC decision budget: held-position trigger escalations + self-scheduled wakeups. The fixed CHECKIN_TIMES_ET check-ins are EXEMPT (bounded by being a short fixed list). Persisted per-ET-day in AgentState (Cam 2026-06-24) so restarts can't reset it.
  triggerMoveBps: 400, // a held name fires a check when it has moved ≥4% SINCE THE LAST CHECK (a fresh ±4% leg) — not when its absolute day-move is ≥4%. So a +14% gap that holds is one check, not a 30-min drumbeat; a run to +18% or a reversal to +10% is a new check. The anchor is persisted (AgentState.triggerAnchorsJson). The 2-min scan cadence is unchanged. (Cam 2026-06-24)
};

// Anti-runaway cap on the agent's standing to-do list (AgentAgendaItem).
export const MAX_OPEN_AGENDA = 12;

// Fixed intraday trading check-ins (ET) — HOURLY 10:00→15:00 INCLUDING noon (Cam 2026-06-25;
// noon used to be the midday brief — it's now a real check-in and the brief moved to 12:30).
// Each is a decision-capable session that acts on the standing game plan, fires once/day in a
// 60-min window, and runs AFTER any same-slot research/brief (those blocks return first; the
// check-in falls through on a later tick within the hour). The 12:30 midday BRIEF (runMiddayReport,
// in runner.ts) is a readable lunch summary, NOT a decision session: it shares the noon hour with
// the 12:00 check-in (the check-in fires 12:00–12:30, the brief 12:30–13:00). The day is bookended
// by the 9:00 morning plan ("open") and the 16:15 EOD brief ("close"). EXEMPT from
// maxDecisionSessionsPerDay (a short fixed list). Humans edit this.
export const CHECKIN_TIMES_ET = ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00"] as const;

// Agent self-scheduling: how many of its own future check-ins may be PENDING at
// once (anti-runaway). Same-day, market-hours wakeups only for now.
export const MAX_PENDING_WAKEUPS = 6;

// Agent self-investing (D30): the agent may promote a CANDIDATE it has RESEARCHED
// and has conviction on straight into the tradeable universe — bounded by these
// rules (the deterministic liquidity screen still runs on top). The human promotion
// path is also single-actor (D78) — same screen, no second approver; the §6 order
// gate and the block/demote/kill overrides ALWAYS still apply. Humans edit this; the
// agent never does (D11). Flip GRQ_AGENT_SELF_PROMOTE=false to disable without a deploy.
export const SELF_INVEST = {
  enabled: (process.env.GRQ_AGENT_SELF_PROMOTE ?? "true").toLowerCase() !== "false",
  allowedStances: ["Strong Buy", "Buy"] as const, // must be a genuine buy call
  minConfidence: HARD.minBuyConfidence, // ≥75, same bar as the BUY gate
  maxPerRollingWeek: 25, // anti-runaway: ≤25 self-promotions / rolling 7 days (2→5→25 on 2026-06-18 — under the active-deployment mandate the agent's wider hunt is surfacing more real ≥75 ideas than 5/wk allowed; AC/COST/DAL got blocked. Still bounded by maxUniverseSize and the dial's maxNewTradesPerWeek BUY cap)
  maxUniverseSize: 60, // anti-runaway: total ACTIVE cap
  promotableTiers: ["large", "mid"] as const, // ETFs stay human-curated; default "mid"
};

export type DialPolicy = {
  maxPositionPct: number; // of NAV, post-trade
  // cashFloorPct / cashCeilingPct are enforced PER CURRENCY-ACCOUNT (Cam 2026-06-25): each of
  // CAD and USD is its own account, and its cash is measured against THAT account's NAV (its
  // cash + its positions, native units) — never summed. Floor = MIN cash (a hard gate on buys).
  // Ceiling = MAX idle cash before deployment is mandated; currently SOFT (a check-in mandate to
  // deploy the over-ceiling leg — prefer a real stock, index-ETF ballast only with no conviction);
  // the hard auto-sweep-to-ceiling is deferred (revisit if the soft mandate doesn't move it).
  cashFloorPct: number;
  cashCeilingPct: number;
  tiers: Tier[];
  stopPct: number; // deterministic stop distance below ACB
  takeProfitPct: number; // deterministic take-profit distance above ACB (claim the gain)
  maxNewTradesPerWeek: number; // BUY orders, rolling 7 days
};

export const DIALS: Record<"CAUTIOUS" | "BALANCED" | "AGGRESSIVE", DialPolicy> = {
  // maxNewTradesPerWeek raised 2/5/10 → 15/20/25 (Cam 2026-06-25): the old caps bound the active-
  // deployment push (a fresh US$25k sleeve to build + rotation), so they fought the strategy. The
  // burst caps (HARD.maxOrdersPerDay 10 · /hour 4) still bound pace; the cautiousness of each dial
  // now comes from size/cash/stops/universe, not the trade count.
  CAUTIOUS: { maxPositionPct: 10, cashFloorPct: 30, cashCeilingPct: 50, tiers: ["etf", "large"], stopPct: 5, takeProfitPct: 15, maxNewTradesPerWeek: 15 },
  BALANCED: { maxPositionPct: 15, cashFloorPct: 15, cashCeilingPct: 30, tiers: ["etf", "large", "mid"], stopPct: 8, takeProfitPct: 25, maxNewTradesPerWeek: 20 },
  AGGRESSIVE: { maxPositionPct: 25, cashFloorPct: 0, cashCeilingPct: 15, tiers: ["etf", "large", "mid"], stopPct: 12, takeProfitPct: 40, maxNewTradesPerWeek: 25 },
};

// The fund's REAL hurdle (Cam 2026-06-25): it only earns genuine return once it clears its own
// running costs — Claude Max (~$240 USD/mo) + FMP (~$250 USD/mo) ≈ $490 USD/mo in subscriptions.
// Beating XIC while still UNDER this hurdle is NOT "doing a good job." The hurdle is brutal at
// small AUM (a high % of a tiny NAV) and shrinks as capital grows — so the answer is scale +
// patient compounding, NEVER oversized risk to chase it (the §6 gate + 75% bar are unchanged).
// Surfaced live in context (as %/yr of current NAV) and weighed by the agent's reporting. USD cents.
export const OPERATING_COST_USD_CENTS_PER_MONTH = 49000;

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

// The Race (D68) — the model bake-off. The CHAMPION (MODELS.decision = Opus) is the only model
// that ever trades. CHALLENGERS run shadow-only on the exact same frozen prompt, one-shot, NO
// tools, and record what they WOULD do — they never touch the §6 gate (guardrail #1).
//   Phase 1 — a Claude challenger (Sonnet 4.6) reachable on the same Max token, no new auth, FREE.
//   Phase 2 — non-Claude challengers via OpenRouter (`vendor/model` slugs in GRQ_RACE_CHALLENGERS),
//             metered $ on OPENROUTER_API_KEY. Routing is by slug shape (see agent/openrouter.ts).
// Kill the whole thing without a deploy: GRQ_RACE_ENABLED=false. Humans edit this.
export const RACE = {
  enabled: (process.env.GRQ_RACE_ENABLED ?? "true").toLowerCase() !== "false",
  challengers: (process.env.GRQ_RACE_CHALLENGERS ?? "claude-sonnet-4-6")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean),
  // Phase 2 spend guard: a per-ET-day USD ceiling on the METERED (OpenRouter) challengers only.
  // Claude challengers ride the Max token for free and are NOT counted. When the day's metered
  // spend reaches this, the metered challengers skip for the rest of the day — the champion and any
  // free (Claude) challengers are unaffected. Env-tunable; the default is a blowup-guard, not a
  // real constraint (a normal day's 5-model slate is well under a dollar).
  maxUsdPerDay: Number(process.env.GRQ_RACE_MAX_USD_PER_DAY ?? "2") || 2,
};
