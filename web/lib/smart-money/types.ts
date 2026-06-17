// Client-safe view-model types + formatters for Smart Money. Kept free of any
// server imports (no prisma) so client components can import these without
// dragging server code into the bundle. queries.ts re-exports these.

export type WatchOverlap = "universe" | "watching";

export type SmHolding = {
  symbol: string;
  name: string;
  shares: number;
  valueUsd: number;
  pctOfPort: number;
  putCall: "PUT" | "CALL" | null;
  action: string; // NEW | ADD | TRIM | HOLD
  qoqSharesPct: number | null;
  rank: number;
};

export type SmPortfolio = {
  slug: string;
  name: string;
  firm: string;
  blurb: string;
  accent: string | null;
  avatar: string | null;
  cik: string;
  asOf: string; // YYYY-MM-DD
  totalValueUsd: number;
  holdingsCount: number;
  securitiesAdded: number | null;
  securitiesRemoved: number | null;
  perf1yPct: number | null;
  topHoldings: SmHolding[];
  hasPuts: boolean;
};

export type CongressLeader = { symbol: string; assetName: string; buyers: number; trades: number; members: string[] };
export type FundLeader = { symbol: string; name: string; funds: number; fundNames: string[]; totalValueUsd: number };
export type InsiderBuy = {
  symbol: string;
  companyName: string | null;
  insiderName: string;
  insiderTitle: string | null;
  valueUsd: number;
  shares: number;
  priceUsd: number;
  txnDate: string;
  source: string;
  link: string | null;
};
export type InsiderCluster = { symbol: string; insiders: number; totalValueUsd: number };
export type CongressTrade = { symbol: string; assetName: string; side: string; amountRange: string; txnDate: string; link: string | null };

/** Compact USD with a magnitude suffix — "$263.1B", "$25.0M". Reference figures. */
export function fmtUsd(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (a >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}
