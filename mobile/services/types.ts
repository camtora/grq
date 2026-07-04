/** Wire types — hand-mirrored from shared/contract.ts (docs/MOBILE-DESIGN.md §6).
 * Server-additive fields are optional: render nothing when absent, never crash. */

export type Mover = {
  symbol: string;
  name: string;
  currency: string;
  lastCents: number;
  dayChangeBps: number;
  logoUrl?: string | null;
};

export type IndexQuote = { symbol: string; name: string; priceCents: number; changeBps: number };

export type Headline = {
  at: string;
  title: string;
  url: string;
  publisher: string;
  image: string | null;
  summary: string | null;
  sentiment: string | null; // POS | NEU | NEG
};

export type EarningReported = {
  symbol: string;
  name: string;
  logoUrl: string | null;
  date: string; // YYYY-MM-DD
  epsEstimated: number | null;
  epsActual: number | null;
  revenueEstimated: number | null;
  revenueActual: number | null;
  dayBps: number | null;
  stance: string | null;
};

export type EarningUpcoming = { symbol: string; name: string; logoUrl: string | null; date: string };

export type Sector = { name: string; avgBps: number; n: number };

export type MarketGainer = {
  symbol: string;
  name: string;
  priceCents: number;
  changeBps: number;
  exchange: string;
  inUniverse: boolean;
};

export type PortfolioPosition = {
  symbol: string;
  qty: number;
  avgCostCents: number;
  lastCents: number;
  marketValueCents: number;
  unrealizedPnlCents: number;
  dayChangeBps: number;
  openedAt: string;
  currency: string;
  logoUrl: string | null;
};

export type Portfolio = {
  cashCents: number;
  cadCashCents: number;
  usdCashCents: number;
  fxUsdCad: number | null;
  positions: PortfolioPosition[];
  positionsCents: number;
  navCents: number;
  contributionsCents: number;
  totalPnlCents: number;
  benchmarkCents: number | null;
  feeSpentMonthCents: number;
  feeBudgetCentsMonth: number;
  riskLevel: string;
  killSwitch: boolean;
  killSwitchBy: string | null;
  quotesAsOf: string | null;
};

export type ExternalHolding = {
  symbol: string;
  description: string | null;
  qty: number;
  priceCents: number | null;
  marketValueCents: number | null;
  currency: string;
  openPnlCents: number | null;
};

export type ExternalAccount = {
  id: string;
  institution: string;
  name: string | null;
  numberMasked: string | null;
  accountType: string | null;
  currency: string;
  totalValueCents: number | null;
  cashCents: number | null;
  disabled: boolean;
  syncedAt: string | null;
  authorizationId?: string | null; // the SnapTrade connection — the one-tap Reconnect key
  holdings: ExternalHolding[];
};

export type AccountsResponse = {
  members: {
    email: string;
    name: string;
    isSelf: boolean;
    connected: boolean;
    dailyValues?: { date: string; valueCents: number }[]; // nightly CAD-valued series
    accounts: ExternalAccount[];
  }[];
};

export type WatchRow = {
  symbol: string;
  name: string;
  logoUrl: string | null;
  currency: string;
  exchange: string | null;
  lastCents: number | null;
  dayBps: number | null;
  stance: string | null;
  stanceTone: 'emerald' | 'teal' | 'amber' | 'red' | null;
  stanceBlurb: string | null;
  watchers: { key: string; name: string }[];
  pinnedBy: string | null;
  blocked: boolean;
  status: string; // CANDIDATE | ACTIVE
  researchInFlight: boolean;
  upsidePct: number | null; // 12-mo target vs current, as a fraction
  nearPct: number | null;
  nearDays: number | null;
  confidence: number | null;
  bottomLine: string | null;
};

export type WatchlistResponse = { rows: WatchRow[] };

export type StockExtras = {
  earnings: {
    last: { date: string; epsEstimated: number | null; epsActual: number | null } | null;
    next: { date: string; epsEstimated: number | null } | null;
  } | null;
  grades: {
    strongBuy: number;
    buy: number;
    hold: number;
    sell: number;
    strongSell: number;
    consensus: string;
    total: number;
  } | null;
};

export type SymbolMatch = {
  symbol: string;
  name: string;
  exchange: string | null;
  currency: string | null;
};

export type StockIndexItem = {
  symbol: string;
  name: string;
  kind: 'active' | 'watching' | 'retired' | 'researched' | 'screened';
  seenAt: number;
  watchers?: string[]; // member keys watching this name
};

/** The subset of /api/dossier/[symbol] the stock screen renders (the feed is
 * full web-parity, D60 — grow this as sections land). */
export type Dossier = {
  symbol: string;
  name: string;
  currency: string;
  lastCents: number | null;
  logoUrl: string | null;
  status: string;
  researching: boolean;
  rating: { label: string; abbr: string; tone: 'emerald' | 'teal' | 'amber' | 'red'; pos: number; blurb: string } | null;
  target: {
    nearCents: number | null;
    nearHorizon: string | null;
    farCents: number | null;
    expectedReturnBps: number | null;
    confidence: number | null;
  } | null;
  bottomLine: string | null;
  bodyMarkdown: string | null;
  marketCapCents: number | null;
  peRatio: number | null;
  position: {
    qty: number;
    avgCostCents: number;
    marketValueCents: number;
    unrealizedPnlCents: number;
    autoStopCents: number;
    takeProfitCents: number;
  } | null;
  earnings: {
    next: { date: string; epsEstimated: number | null } | null;
    last: { date: string; epsEstimated: number | null; epsActual: number | null } | null;
  } | null;
  grades:
    | (NonNullable<StockExtras['grades']> & {
        trendDirection?: string | null;
        buyDelta?: number | null;
        sellDelta?: number | null;
        trendMonths?: number | null;
        actions?: { date: string; company: string; action: string; fromGrade: string; toGrade: string }[];
      })
    | null;
  news: { title: string; url: string; publisher: string; at?: string | null }[];
  closes: { t: number; c: number }[];
  signals: { recommendationPct: number | null; trend: string | null; rsi: number | null; macd: string | null } | null;
  watchers: { key: string; name: string }[];
  recLabel: string | null; // the technical-signal lean (an input, not a verdict)
  recPos: number | null;
  agentWatching: boolean;
  agentNote: string | null;
  confidenceLevers?: {
    gap: string;
    direction: 'up' | 'down' | 'tighten';
    magnitude: 'small' | 'moderate' | 'large';
    kind: 'data-gap' | 'catalyst';
    trigger: string;
    retrievable: boolean;
  }[];
  structuralGaps?: { name: string; detail: string }[];
  options?: {
    line: string;
    regime: string | null;
    pcOI: number | null;
    pcVol: number | null;
    atmIvBps: number | null;
    asOf: string;
  } | null;
  social?: {
    line: string;
    rank: number | null;
    velocity: number | null;
    bullPct: number | null;
    asOf: string;
  } | null;
  personalPositions?: {
    owner: string;
    ownerKey: string | null;
    institution: string;
    accountType: string | null;
    qty: number;
    currency: string;
    avgCostCents: number | null;
    marketValueCents: number | null;
    openPnlCents: number | null;
  }[];
  analystBand: {
    nowCents: number;
    consensusCents: number;
    lowCents: number;
    highCents: number;
    currency: string;
    upsidePct: number;
    reanchored: boolean;
  } | null;
  signalFamilies: { family: string; signal: string; confidence: number; rationale: string }[];
  peers: { symbol: string; name: string; self: boolean; peTtm: number | null; pbTtm: number | null; marketCapM: number | null }[];
  institutional: {
    investorsHolding: number;
    investorsHoldingChange: number;
    date: string;
    holders: { name: string; isNew: boolean; ownershipPct: number; sharesChangePct: number }[];
  } | null;
  smartMoney: {
    hasAny: boolean;
    congressBuyers: number;
    congressSellers: number;
    insiderBuyers: number;
    insiderBuyValueUsd: number | null;
    fundHolders: { name: string; firm: string; asOf: string; pctOfPort: number; action?: string | null }[];
  } | null;
  trades: { id: number; side: string; qty: number; priceCents: number; realizedPnlCents: number | null; at: string }[];
  coverage: { tier: number; name: string; status: string; detail: string }[];
  scoreboard: { source: string; grades: number; hits: number; misses: number; neutral: number; hitRate: number | null }[];
  record: { id: number; kind: string; title: string; body: string; at: string; agentVersion: string | null; sources: string[] }[];
  related?: {
    ticker: string;
    name: string;
    weight: number;
    why: string;
    symbol: string | null;
    logoUrl: string | null;
    stance: string | null;
  }[];
  chess?: {
    themeId: number;
    title: string;
    anchor: string;
    role: string | null;
    thesis: string | null;
    selfStage: number;
    stages: {
      label: string;
      role: string | null;
      items: { symbol: string | null; name: string; note: string | null }[];
    }[];
  }[];
};

/* ---------- Alfred's desk printouts (/api/briefings) ---------- */
export type BriefingItem = {
  id: string;
  at: string;
  kind: 'premarket' | 'plan' | 'checkin' | 'midday' | 'eod' | 'weekly';
  title: string;
  body: string;
};

/* ---------- fund settings + FX (D62) ---------- */
export type FundSettings = {
  riskLevel: 'CAUTIOUS' | 'BALANCED' | 'AGGRESSIVE';
  cashFloorBps: number;
  maxPositionBps: number;
  stopLossBps: number;
  takeProfitBps: number;
  feeBudgetCentsMonth: number;
  feeSpentMonthCents: number;
  killSwitch: boolean;
  killSwitchBy: string | null;
  soakDaysClean: number;
  soakDaysRequired: number;
  soakPaperDaysClean: number;
  soakPaperDaysRequired: number;
};

export type FxRequest = {
  id: number;
  createdAt: string;
  fromCurrency: string;
  toCurrency: string;
  amountUsdCents: number | null;
  estCadCents: number | null;
  reason: string | null;
  symbol: string | null;
  status: string; // PENDING | EXECUTED | REJECTED | FAILED
  requestedBy: string | null;
  executedRate: number | null;
  executedCadCents: number | null;
  failReason: string | null;
};

export type FxState = {
  cadCashCents: number;
  usdCashCents: number;
  fxUsdCad: number | null;
  usdPct: number;
  fxMaxPerRequestCents: number;
  fxMaxPerWeekCents: number;
  usdAllocationCapPct: number;
  pending: FxRequest[];
  recent: FxRequest[];
};

export type Health = {
  status: string;
  broker: string;
  phase: number;
  killSwitch: boolean;
  agent: { bootAt: string | null; lastTickAt: string | null; lastSessionAt: string | null } | null;
};

/* ---------- member-to-member messages (D61) ---------- */
export type DirectMessage = {
  id: number;
  at: string;
  fromKey: 'cam' | 'graham' | null;
  fromName: string;
  mine: boolean;
  body: string; // may be empty for a bare share
  symbol: string | null; // attached dossier, if a share
  panel: string | null;
  panelLabel: string | null;
  readAt: string | null;
};

export type DirectThread = { messages: DirectMessage[]; unread: number; otherName: string };

/* ---------- The Hunt — /api/hunt (web lib/feed.ts huntResponse) ---------- */
export type HuntFind = {
  sym: string;
  name: string;
  logoUrl: string | null;
  currency: string | null;
  cur: number | null; // current price, cents
  quoteSymbol?: string; // the resolved listing the live-quote poll keys on (D51)
  nearBps: number | null;
  farBps: number | null;
  nearDays: number | null; // trading days to the near target
  targetNearCents: number | null;
  targetFarCents: number | null;
  confidence: number | null;
  body: string;
  bottomLine: string | null;
  sources: string[];
  obscurity: number | null; // 1–5, agent-scored (5 = almost nobody covers it)
  change30d: number | null; // fraction over the sparkline window
  spark: number[];
  heat: number; // derived 0–100 "ready to pop" (conviction + momentum + obscurity)
  tag: string | null; // "NYSE · Healthcare"
  watch: 'none' | 'watching' | 'universe';
  watchers?: { key: string; name: string }[]; // who's watching (D78) — [] for most leads
};
export type HuntFeed = { brief: string | null; finds: HuntFind[] };
/** /api/hunt/status — the pending poller anchors on latestFindAt (the runner
 * clears huntRequestedAt at the run's START, before results land). */
export type HuntStatus = {
  requestedAt: string | null;
  brief: string | null;
  latestFindAt: string | null;
  finds: number;
};

/* ---------- The Wire — the discovery feed (shared/contract.ts WireItem) ---------- */
export type WireKind = 'find' | 'dossier' | 'watch' | 'article' | 'lesson';
export type WireItem = {
  id: string;
  kind: WireKind;
  at: string;
  symbol?: string | null;
  name?: string | null;
  currency?: string | null;
  logoUrl?: string | null;
  lastCents?: number | null;
  dayChangeBps?: number | null;
  call?: string | null; // strong_buy … strong_sell
  farBps?: number | null;
  nearBps?: number | null;
  nearDays?: number | null;
  nearHorizon?: string | null;
  targetNearCents?: number | null;
  targetFarCents?: number | null;
  confidence?: number | null;
  heat?: number | null;
  obscurity?: number | null;
  change30d?: number | null;
  spark?: number[] | null;
  signals?: { recommendationPct?: number | null; trend?: string | null; rsi?: number | null; macd?: string | null } | null;
  sources?: string[] | null;
  blurb?: string | null;
  bullets?: string[] | null;
  tag?: string | null;
  watcher?: string | null;
  watcherKey?: string | null;
  title?: string | null;
  publisher?: string | null;
  imageUrl?: string | null;
  url?: string | null;
  relatedTickers?: string[] | null;
  lessonTerm?: string | null;
  lessonBody?: string | null;
  lessonSlug?: string | null;
  lessonExample?: string | null;
  lessonRelated?: { slug: string; term: string; def: string }[] | null;
};

export type Today = {
  edition: 'morning' | 'midday' | 'evening' | 'weekend';
  dateISO: string;
  quote: string;
  navCents: number;
  dayPnlCents: number;
  dayPnlBps: number;
  benchmarkBps: number | null;
  tape: { at: string; navCents: number }[];
  leadStoryMarkdown: string | null;
  leadTitle: string;
  movers: Mover[];
  topHitters: Mover[];
  indices: IndexQuote[];
  // Newspaper sections (2026-07-03, optional on the wire)
  marketOpen?: boolean;
  dayLabel?: string;
  funFact?: string;
  macroLine?: string | null;
  macroNote?: string | null;
  marketBrief?: { body: string; edition: string; date: string } | null;
  headlines?: Headline[];
  earningsReported?: EarningReported[];
  earningsUpcoming?: EarningUpcoming[];
  sectors?: Sector[];
  marketGainers?: MarketGainer[];
};
