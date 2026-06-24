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
 * Status (2026-06-16): ALL shapes are now served by live GET endpoints
 * (web/lib/feed.ts → /api/{portfolio,market,ideas,today,dossier/[symbol],settings,auth/me}),
 * built from the same Prisma source the web pages read and verified against these
 * zod schemas by web/scripts/verify-mobile-api.ts. Today/Market/Ideas/Dossier/Settings
 * were "v0" guesses; they now reflect what the feed actually emits — keep this file and
 * lib/feed.ts in lockstep. See docs/IOS-PLAN.md.
 */
import { z } from "zod";

/* ---------- shared enums (mirror prisma/schema.prisma + lib/users.ts) ---------- */
export const RiskLevel = z.enum(["CAUTIOUS", "BALANCED", "AGGRESSIVE"]);
export const Role = z.enum(["member", "viewer"]);
export const Theme = z.enum(["light", "dark"]);
/** The agent's own call on a name (glossary: "the-agent's-call"). */
export const AgentCall = z.enum(["buy", "accumulate", "hold", "watch", "trim", "avoid", "sell"]);
/** Member directive on a name (mirrors prisma SymbolDirective / DirectiveType). */
export const Directive = z.enum(["pin", "no_fly"]);

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
  currency: z.string().default("CAD"), // native currency of this holding (US$ vs C$)
});
export const Portfolio = z.object({
  // cashCents is the CAD TOTAL (CAD cash + USD cash × fx). The raw per-currency
  // balances + rate are below it (D62, multi-currency).
  cashCents: z.number().int(),
  cadCashCents: z.number().int(),
  usdCashCents: z.number().int(),
  fxUsdCad: z.number().nullable(),
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

// FX-approval guardrail (D62): a CAD→USD conversion the agent requested or a member
// ran manually. Mobile mirrors the web FxPanel — see/approve/reject + manual convert.
export const FxRequest = z.object({
  id: z.number().int(),
  createdAt: z.string(),
  fromCurrency: z.string().nullish(), // "CAD" | "USD" — direction (older rows may be null → CAD→USD)
  toCurrency: z.string().nullish(),
  amountUsdCents: z.number().int(),
  estCadCents: z.number().int(),
  reason: z.string(),
  symbol: z.string().nullable(),
  status: z.string(), // PENDING|APPROVED|REJECTED|EXECUTED|FAILED
  requestedBy: z.string(),
  decidedBy: z.string().nullable(),
  note: z.string().nullable(),
  executedRate: z.number().nullable(),
  executedCadCents: z.number().int().nullable(),
  executedUsdCents: z.number().int().nullable(),
  failReason: z.string().nullable(),
});
export const FxState = z.object({
  cadCashCents: z.number().int(),
  usdCashCents: z.number().int(),
  fxUsdCad: z.number().nullable(),
  usdPct: z.number(), // USD exposure (cash + positions) as % of NAV
  fxMaxPerRequestCents: z.number().int(), // member dials (0 = no limit)
  fxMaxPerWeekCents: z.number().int(),
  usdAllocationCapPct: z.number().int(), // 100 = all-USD allowed
  pending: z.array(FxRequest),
  recent: z.array(FxRequest),
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

/* ---------- notification preferences (per-user iOS push toggles — D53) ---------- */
// The toggleable categories only. trades + risk + critical outages are force-on in
// code (non-toggleable) and never appear here. GET/PUT /api/notifications/preferences.
export const NotificationPreferences = z.object({
  dossiers: z.boolean(), // a requested research dossier is ready
  hunt: z.boolean(), // new hunt names / directed-hunt / smart-money scan
  agentMoves: z.boolean(), // the agent self-tracks or self-promotes a name
  reports: z.boolean(), // morning plan / midday / EOD / weekly review
  checkins: z.boolean(), // SCHEDULED fund-level check-ins (the hourly clock review)
  holdingChecks: z.boolean(), // per-HOLDING check-ins (a position's move / revisit — "ATD — no trade")
  members: z.boolean(), // the OTHER member's universe/directive actions
  messages: z.boolean(), // the OTHER member messaged you or shared a stock (D61)
  system: z.boolean(), // agent restarts, data-feed/broker hiccups (non-critical)
  priceTargets: z.boolean(), // a price alert you set has crossed (The Wire, Phase 2)
});

/* ---------- price alerts (The Wire, Phase 2) — per-user "ping me at $X" ---------- */
// Set on the stock page or The Wire; the agent runner pushes the owner when the
// price crosses, then one-shots the alert. GET/POST/DELETE /api/notifications/price-alerts.
export const PriceAlert = z.object({
  id: z.number().int(),
  symbol: z.string(),
  direction: z.enum(["above", "below"]), // the side the price must cross
  thresholdCents: z.number().int(), // trigger price, native currency
  currency: z.string(),
  note: z.string().nullable(),
  active: z.boolean(), // false once it has fired (one-shot)
  createdAt: z.string(),
  firedAt: z.string().nullable(),
  // attribution — present only on the symbol-scoped "alerts on this stock" view, so
  // both members see who's watching a name. (Notifications + deletes stay per-owner.)
  owner: z.string().nullish(), // display name ("Cam" / "Graham")
  ownerKey: z.string().nullish(), // "cam" | "graham" → the bundled avatar
  mine: z.boolean().nullish(), // true if the caller owns it (→ deletable)
});
export const PriceAlertList = z.object({ alerts: z.array(PriceAlert) });

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
  // Listing currency ("CAD" | "USD" | …) — labels the price so a US name reads as
  // US$ vs C$ (native, labelled — D24). Defaults CAD for the all-CAD universe.
  currency: z.string().default("CAD"),
  lastCents: z.number().int(),
  dayChangeBps: z.number().int(),
  inUniverse: z.boolean(), // false = watchlist candidate (not yet tradable)
  agentCall: AgentCall.nullable(),
  directive: Directive.nullable(), // member pin / no-fly
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
  currency: z.string().default("CAD"), // labels target prices (US$ vs C$)
  call: AgentCall.nullable(),
  target: PriceTarget,
  unfamiliar: z.boolean(), // On the Radar surfaces unfamiliar names first
});
/* ---- stock-page parity panels (2026-06-23): the rich dossier the iOS page
   rebuilds to match web app/stocks/[symbol]/page.tsx. All optional/defaulted so
   older payloads keep parsing and the app degrades gracefully. ---- */

// Held position + the deterministic bracket (risk dial) — mirrors the web stat row.
export const DossierPosition = z.object({
  qty: z.number().int(),
  avgCostCents: z.number().int(),
  openedAt: z.string(),
  marketValueCents: z.number().int(),
  unrealizedPnlCents: z.number().int(),
  stopPct: z.number(),
  takeProfitPct: z.number(),
  autoStopCents: z.number().int(),
  takeProfitCents: z.number().int(),
});

// Analyst price-target band, re-anchored to this listing's currency when needed
// (a CDR's US targets rescaled to the CAD shares — same logic as the web page).
export const AnalystBand = z.object({
  nowCents: z.number().int(),
  consensusCents: z.number().int(),
  lowCents: z.number().int(),
  highCents: z.number().int(),
  currency: z.string(),
  upsidePct: z.number(),
  reanchored: z.boolean(),
  trendChangePct: z.number().nullable(),
  trendRecentCount: z.number().int().nullable(),
});

export const GradeAction = z.object({
  company: z.string(),
  action: z.string(), // upgrade | downgrade | maintain | initiate
  fromGrade: z.string(),
  toGrade: z.string(),
  date: z.string(),
});
export const DossierGrades = z.object({
  consensus: z.string(),
  total: z.number().int(),
  strongBuy: z.number().int(),
  buy: z.number().int(),
  hold: z.number().int(),
  sell: z.number().int(),
  strongSell: z.number().int(),
  trendDirection: z.string().nullable(), // "more bullish" | "more bearish" | "steady"
  buyDelta: z.number().int().nullable(),
  sellDelta: z.number().int().nullable(),
  trendMonths: z.number().int().nullable(),
  actions: z.array(GradeAction),
});

export const EarningsRow = z.object({
  date: z.string(),
  epsEstimated: z.number().nullable(),
  epsActual: z.number().nullable(),
  revenueEstimated: z.number().nullable(),
  revenueActual: z.number().nullable(),
});
export const DossierEarnings = z.object({
  next: EarningsRow.nullable(),
  last: EarningsRow.nullable(),
});

export const SignalFamily = z.object({
  family: z.string(),       // trend | rsi | macd | volatility
  signal: z.string(),       // BUY | SELL | HOLD
  confidence: z.number().int(),
  rationale: z.string(),
});

export const PeerRow = z.object({
  symbol: z.string(),
  name: z.string(),
  self: z.boolean(),
  peTtm: z.number().nullable(),
  pbTtm: z.number().nullable(),
  marketCapM: z.number().nullable(),
});

export const Holder = z.object({
  name: z.string(),
  isNew: z.boolean(),
  ownershipPct: z.number(),
  sharesChangePct: z.number(),
});
export const Institutional = z.object({
  investorsHolding: z.number().int(),
  investorsHoldingChange: z.number().int(),
  date: z.string(),
  holders: z.array(Holder),
});

export const ScoreRow = z.object({
  source: z.string(),
  grades: z.number().int(),
  hits: z.number().int(),
  misses: z.number().int(),
  neutral: z.number().int(),
  hitRate: z.number().nullable(),
});

export const ClosePoint = z.object({ t: z.number(), c: z.number().int() }); // t = epoch ms, c = close cents
export const NewsItem = z.object({ title: z.string(), url: z.string(), publisher: z.string(), at: z.string() });
export const CoverageRow = z.object({
  tier: z.number().int(),
  name: z.string(),
  status: z.string(), // live | partial | none
  detail: z.string(),
});
export const RecordEntry = z.object({
  id: z.number().int(),
  kind: z.string(),
  title: z.string(),
  body: z.string(),
  at: z.string(),
  agentVersion: z.string().nullable(),
  sources: z.array(z.string()),
});
export const TradeRow = z.object({
  id: z.number().int(),
  side: z.string(),
  qty: z.number().int(),
  priceCents: z.number().int(),
  realizedPnlCents: z.number().int().nullable(),
  at: z.string(),
});
export const DossierSmartMoney = z.object({
  hasAny: z.boolean(),
  congressBuyers: z.number().int(),
  congressSellers: z.number().int(),
  insiderBuyers: z.number().int(),
  insiderBuyValueUsd: z.number(),
  fundHolders: z.array(
    z.object({
      name: z.string(),
      firm: z.string(),
      asOf: z.string(),
      pctOfPort: z.number(),
      action: z.string(),
      putCall: z.string().nullable(),
    }),
  ),
  people: z.array(
    z.object({
      name: z.string(),
      role: z.string(),
      lastSide: z.string().nullable(),
      lastAmountRange: z.string().nullable(),
      lastTxnDate: z.string().nullable(),
    }),
  ),
});
export const CurrentRead = z.object({
  title: z.string(),
  body: z.string(),
  at: z.string(),
  sources: z.array(z.string()),
});

export const Dossier = z.object({
  symbol: z.string(),
  name: z.string(),
  currency: z.string().default("CAD"), // labels price/targets/cap (US$ vs C$)
  lastCents: z.number().int().nullable(), // current (delayed) share price
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
  // --- A5 enrichment (already emitted) ---
  logoUrl: z.string().nullable().default(null),
  status: z.string().nullable().default(null), // ACTIVE | CANDIDATE | RETIRED
  watch: z.string().nullable().default(null), // none | watching | universe
  rating: z.object({ label: z.string(), abbr: z.string(), tone: z.string(), pos: z.number(), blurb: z.string() }).nullable().default(null),
  recLabel: z.string().nullable().default(null),
  recPos: z.number().nullable().default(null),
  bottomLine: z.string().nullable().default(null),
  researching: z.boolean().default(false),
  directive: Directive.nullable().default(null),
  // --- stock-page parity (2026-06-23) ---
  tier: z.string().nullable().default(null),
  agentWatching: z.boolean().default(false),
  agentNote: z.string().nullable().default(null),
  lastResearchedAt: z.string().nullable().default(null),
  position: DossierPosition.nullable().default(null),
  analystBand: AnalystBand.nullable().default(null),
  grades: DossierGrades.nullable().default(null),
  earnings: DossierEarnings.nullable().default(null),
  signalFamilies: z.array(SignalFamily).default([]),
  peers: z.array(PeerRow).default([]),
  institutional: Institutional.nullable().default(null),
  scoreboard: z.array(ScoreRow).default([]),
  closes: z.array(ClosePoint).default([]),
  news: z.array(NewsItem).default([]),
  coverage: z.array(CoverageRow).default([]),
  record: z.array(RecordEntry).default([]),
  trades: z.array(TradeRow).default([]),
  smartMoney: DossierSmartMoney.nullable().default(null),
  currentRead: CurrentRead.nullable().default(null),
});

/* ---------- today / The Daily — v0 (sections per docs/NEWSPAPER.md) ---------- */
export const Edition = z.enum(["morning", "midday", "evening", "weekend"]);
export const NavPoint = z.object({ at: z.string(), navCents: z.number().int() });
export const Mover = z.object({
  symbol: z.string(),
  name: z.string(),
  currency: z.string().default("CAD"), // labels the price (US$ vs C$)
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
  leadStoryMarkdown: z.string().nullable(),   // the newest agent briefing (check-in/plan/midday/EOD/weekly)
  // Kicker for the lead, naming WHICH briefing it is (the freshest one) so it mirrors
  // the web Portfolio briefing slot, e.g. "Intraday Check-in · the latest read".
  leadTitle: z.string(),
  movers: z.array(Mover),                     // biggest universe moves
  topHitters: z.array(Mover),                 // holdings by day move
  onTheRadar: z.array(Idea),                  // ideas w/ targets, unfamiliar first
});

/* ---------- The Wire — the discovery feed (prototype, iOS-first) ---------- */
// One scrollable feed of heterogeneous typed cards. v1 is SHARED (not per-user) and
// READ-ONLY — no schema change, all data reused from existing tables/feeds. A flat,
// mostly-optional shape: each card sets only the fields its `kind` needs, the rest are
// omitted and decode to nil (the house "graceful-decode" pattern). `at` is the recency
// the feed is built from; the server already weaves kinds so clients render top-to-bottom.
export const WireKind = z.enum(["find", "dossier", "watch", "article", "lesson"]);
// A glossary term a lesson card links to. Self-contained (term+def ride along) so a
// tapped chip can present the explainer directly — the bundled iOS glossary is only
// a subset of web's, so we don't rely on the client having the slug.
export const WireRelatedTerm = z.object({ slug: z.string(), term: z.string(), def: z.string() });
export const WireItem = z.object({
  id: z.string(),        // stable client key, e.g. "find:ABC.TO" / "lesson:nav"
  kind: WireKind,
  at: z.string(),        // ISO recency the card was built from
  // stock-bearing cards (find / dossier / watch / stock-tied article)
  symbol: z.string().nullish(),
  name: z.string().nullish(),
  currency: z.string().nullish(),
  logoUrl: z.string().nullish(),
  lastCents: z.number().int().nullish(),
  dayChangeBps: z.number().int().nullish(),
  // discovery economics (find / dossier)
  call: AgentCall.nullish(),               // GRQ's call on the name
  farBps: z.number().int().nullish(),      // 12-month upside vs current
  nearBps: z.number().int().nullish(),     // near-term upside vs current
  nearDays: z.number().int().nullish(),    // near-term horizon (trading days)
  nearHorizon: z.string().nullish(),       // e.g. "~8 weeks"
  targetNearCents: z.number().int().nullish(), // near-term price target
  targetFarCents: z.number().int().nullish(),  // 12-month price target
  confidence: z.number().int().nullish(),  // 0–100 conviction
  heat: z.number().int().nullish(),        // 0–100 "ready to pop"
  obscurity: z.number().int().nullish(),   // 1–5 (5 = deepest cut)
  change30d: z.number().nullish(),         // 30-day momentum, as a fraction
  spark: z.array(z.number()).nullish(),    // ~30 daily closes (cents)
  signals: Signals.nullish(),              // technicals strip (dossier)
  sources: z.array(z.string()).nullish(),  // where the thesis came from (find)
  blurb: z.string().nullish(),             // one-liner summary (back-compat)
  bullets: z.array(z.string()).nullish(),  // a few clean, pre-stripped bullets — the card body (no markdown)
  tag: z.string().nullish(),               // "NYSE · Health" / "Market" / "Learn"
  // watch attribution (who put it on the board)
  watcher: z.string().nullish(),           // "Cam" | "Graham" | "Agent"
  watcherKey: z.string().nullish(),        // "cam" | "graham" | "agent" → the bundled avatar
  // article (market news)
  title: z.string().nullish(),
  publisher: z.string().nullish(),
  imageUrl: z.string().nullish(),
  url: z.string().nullish(),
  relatedTickers: z.array(z.string()).nullish(), // tracked names the article touches → tap to the dossier
  // lesson (literacy snippet)
  lessonTerm: z.string().nullish(),
  lessonBody: z.string().nullish(),
  lessonSlug: z.string().nullish(),        // glossary slug → the in-app explainer
  lessonExample: z.string().nullish(),     // a "here's what that looks like" line
  lessonRelated: z.array(WireRelatedTerm).nullish(), // tappable related terms
});
export const WireResponse = z.object({ items: z.array(WireItem) });

/* ---------- member-to-member messages (D61) ---------- */
// The two-person fund's own thread (Cam↔Graham), distinct from the read-only agent
// chat. A bare DM is just `body`; a "share" also carries `symbol` (+ optional `panel`)
// so the recipient deep-links straight to that dossier panel. GET/POST /api/messages.
export const DirectMessage = z.object({
  id: z.number().int(),
  at: z.string(), // ISO-8601
  fromKey: z.enum(["cam", "graham"]).nullable(), // stable member key of the author
  fromName: z.string(),
  mine: z.boolean(), // authored by the viewer
  body: z.string(), // may be empty for a bare share
  symbol: z.string().nullable(), // attached dossier, if a share
  panel: z.string().nullable(), // attached panel key, if a specific panel was shared
  panelLabel: z.string().nullable(), // human label for `panel` (lib/panels.ts)
  readAt: z.string().nullable(), // when the recipient read it; null = unread
});
export const DirectThread = z.object({
  messages: z.array(DirectMessage),
  unread: z.number().int(), // messages addressed to the viewer, not yet read
});

/* ---------- inferred TS types (Swift structs are generated separately) ---------- */
export type MeResponse = z.infer<typeof MeResponse>;
export type AuthResponse = z.infer<typeof AuthResponse>;
export type Position = z.infer<typeof Position>;
export type Portfolio = z.infer<typeof Portfolio>;
export type FundSettings = z.infer<typeof FundSettings>;
export type Signals = z.infer<typeof Signals>;
export type MarketName = z.infer<typeof MarketName>;
export type Directive = z.infer<typeof Directive>;
export type MarketResponse = z.infer<typeof MarketResponse>;
export type PriceTarget = z.infer<typeof PriceTarget>;
export type Idea = z.infer<typeof Idea>;
export type Dossier = z.infer<typeof Dossier>;
export type Mover = z.infer<typeof Mover>;
export type Today = z.infer<typeof Today>;
export type NotificationPreferences = z.infer<typeof NotificationPreferences>;
export type PriceAlert = z.infer<typeof PriceAlert>;
export type PriceAlertList = z.infer<typeof PriceAlertList>;
export type WireKind = z.infer<typeof WireKind>;
export type WireRelatedTerm = z.infer<typeof WireRelatedTerm>;
export type WireItem = z.infer<typeof WireItem>;
export type WireResponse = z.infer<typeof WireResponse>;
export type DirectMessage = z.infer<typeof DirectMessage>;
export type DirectThread = z.infer<typeof DirectThread>;
