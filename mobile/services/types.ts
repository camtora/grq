/** Wire types — hand-mirrored from shared/contract.ts (docs/MOBILE-DESIGN.md §6).
 * Server-additive fields are optional: render nothing when absent, never crash. */

export type Mover = {
  symbol: string;
  name: string;
  currency: string;
  lastCents: number;
  dayChangeBps: number;
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
