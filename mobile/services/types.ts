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
