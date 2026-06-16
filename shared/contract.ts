/**
 * GRQ shared API contract — the ONE source of truth for the shapes that cross the
 * wire to both platforms. Web route handlers validate/serialize against these;
 * Swift `Codable` structs are generated from them. "No separation": change a shape
 * here, and both platforms change.
 *
 * Conventions:
 *  - Money is integer CENTS, never floats. Money fields end in `Cents`.
 *  - Rates/moves are basis points (`Bps`, 1% = 100 bps), matching lib/portfolio.ts.
 *  - Dates are ISO-8601 strings on the wire (Swift decodes with `.iso8601`).
 *
 * Status (2026-06-15): Portfolio + Auth mirror web/lib/portfolio.ts exactly.
 * Today / Market / Ideas / Settings are **v0** — reconcile field-by-field when the
 * GET endpoints are built (the web reads Prisma in server components today; see
 * docs/IOS-CONTENT.md and docs/IOS-PLAN.md).
 */
import { z } from "zod";

/* ---------- shared enums (mirror prisma/schema.prisma + lib/users.ts) ---------- */
export const RiskLevel = z.enum(["CAUTIOUS", "BALANCED", "AGGRESSIVE"]);
export const Role = z.enum(["member", "viewer"]);
export const Theme = z.enum(["light", "dark"]);
/** The agent's own call on a name (glossary: "the-agent's-call"). */
export const AgentCall = z.enum(["buy", "accumulate", "hold", "watch", "trim", "avoid", "sell"]);

/* ---------- auth ---------- */
export const MeResponse = z.object({
  email: z.string(),
  name: z.string().nullable(),
  role: Role,
  theme: Theme,
  // for the splash's wealth-aware greeting (shared/content/daily.json bands):
  totalPnlCents: z.number().int(),
  contributionsCents: z.number().int(),
});
export const GoogleLoginRequest = z.object({ idToken: z.string() });
export const AuthResponse = z.object({ token: z.string(), me: MeResponse });

/* ---------- portfolio (mirrors lib/portfolio.ts PositionView / PortfolioView) ---------- */
export const Position = z.object({
  symbol: z.string(),
  qty: z.number().int(),
  avgCostCents: z.number().int(),
  lastCents: z.number().int(),
  marketValueCents: z.number().int(),
  unrealizedPnlCents: z.number().int(),
  dayChangeBps: z.number().int(),
  openedAt: z.string(),
});
export const Portfolio = z.object({
  cashCents: z.number().int(),
  positions: z.array(Position),
  positionsCents: z.number().int(),
  navCents: z.number().int(),
  contributionsCents: z.number().int(),
  totalPnlCents: z.number().int(),
  benchmarkCents: z.number().int().nullable(),
  feeSpentMonthCents: z.number().int(),
  feeBudgetCentsMonth: z.number().int(),
  riskLevel: RiskLevel,
  killSwitch: z.boolean(),
  killSwitchBy: z.string().nullable(),
  quotesAsOf: z.string().nullable(),
});

/* ---------- fund settings / risk dial (v0; mirrors web Settings + soak gate) ---------- */
export const FundSettings = z.object({
  riskLevel: RiskLevel,
  cashFloorBps: z.number().int(),       // min cash as a share of NAV
  maxPositionBps: z.number().int(),     // max weight per name
  stopLossBps: z.number().int(),
  takeProfitBps: z.number().int(),
  feeBudgetCentsMonth: z.number().int(),
  feeSpentMonthCents: z.number().int(),
  killSwitch: z.boolean(),
  killSwitchBy: z.string().nullable(),
  soakDaysClean: z.number().int(),
  soakDaysRequired: z.number().int(),
  soakPaperDaysClean: z.number().int(),
  soakPaperDaysRequired: z.number().int(),
});

/* ---------- signals (advisory technicals consensus; see glossary) — v0 ---------- */
export const Signals = z.object({
  recommendationPct: z.number().int(), // 0–100 share of signal-confidence behind the call
  trend: z.string(),                    // "uptrend" / "downtrend" / "mixed"
  rsi: z.number().nullable(),
  macd: z.string().nullable(),
});

/* ---------- market: a tracked name (universe or watchlist candidate) — v0 ---------- */
export const MarketName = z.object({
  symbol: z.string(),
  name: z.string(),
  lastCents: z.number().int(),
  dayChangeBps: z.number().int(),
  inUniverse: z.boolean(), // false = watchlist candidate (not yet tradable)
  agentCall: AgentCall.nullable(),
  signals: Signals.nullable(),
});
export const MarketResponse = z.object({
  universe: z.array(MarketName),
  watchlist: z.array(MarketName),
});

/* ---------- ideas / dossier / stock detail — v0 ---------- */
export const PriceTarget = z.object({
  nearCents: z.number().int().nullable(),
  nearHorizon: z.string().nullable(), // e.g. "2–6 weeks"
  farCents: z.number().int().nullable(), // 12-month
  expectedReturnBps: z.number().int().nullable(),
  confidence: z.number().int().nullable(), // 0–100, the agent's self-assessment
});
export const Idea = z.object({
  symbol: z.string(),
  name: z.string(),
  call: AgentCall.nullable(),
  target: PriceTarget,
  unfamiliar: z.boolean(), // On the Radar surfaces unfamiliar names first
});
export const Dossier = z.object({
  symbol: z.string(),
  name: z.string(),
  bodyMarkdown: z.string(),
  call: AgentCall.nullable(),
  target: PriceTarget,
  signals: Signals.nullable(),
  analystTargetCents: z.number().int().nullable(), // outside check on the agent's call
  marketCapCents: z.number().int().nullable(),
  peRatio: z.number().nullable(),
  freeCashFlowCents: z.number().int().nullable(),
  dividendYieldBps: z.number().int().nullable(),
  filedAt: z.string().nullable(),
});

/* ---------- today / The Daily — v0 (sections per docs/NEWSPAPER.md) ---------- */
export const Edition = z.enum(["morning", "midday", "evening", "weekend"]);
export const NavPoint = z.object({ at: z.string(), navCents: z.number().int() });
export const Mover = z.object({
  symbol: z.string(),
  name: z.string(),
  lastCents: z.number().int(),
  dayChangeBps: z.number().int(),
});
export const Today = z.object({
  edition: Edition,
  dateISO: z.string(),
  navCents: z.number().int(),
  dayPnlCents: z.number().int(),
  dayPnlBps: z.number().int(),
  benchmarkBps: z.number().int().nullable(), // vs-XIC for the day
  tape: z.array(NavPoint),                    // intraday NAV, open → now
  leadStoryMarkdown: z.string().nullable(),   // EOD wrap, or the morning plan pre-close
  movers: z.array(Mover),                     // biggest universe moves
  topHitters: z.array(Mover),                 // holdings by day move
  onTheRadar: z.array(Idea),                  // ideas w/ targets, unfamiliar first
});

/* ---------- inferred TS types (Swift structs are generated separately) ---------- */
export type MeResponse = z.infer<typeof MeResponse>;
export type AuthResponse = z.infer<typeof AuthResponse>;
export type Position = z.infer<typeof Position>;
export type Portfolio = z.infer<typeof Portfolio>;
export type FundSettings = z.infer<typeof FundSettings>;
export type Signals = z.infer<typeof Signals>;
export type MarketName = z.infer<typeof MarketName>;
export type MarketResponse = z.infer<typeof MarketResponse>;
export type PriceTarget = z.infer<typeof PriceTarget>;
export type Idea = z.infer<typeof Idea>;
export type Dossier = z.infer<typeof Dossier>;
export type Mover = z.infer<typeof Mover>;
export type Today = z.infer<typeof Today>;
