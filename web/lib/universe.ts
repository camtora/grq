import { prisma } from "./db";

// The universe is DB-backed (Phase 2.7): CANDIDATE (researched, not tradeable)
// → ACTIVE (the agent may buy; promotion needs BOTH members + the automated
// screen) → RETIRED (stop researching; history kept). The agent can never
// change membership — it may only propose. A 60s in-process cache keeps the
// hot paths cheap.

export type Tier = "etf" | "large" | "mid";
export type UniverseStatus = "CANDIDATE" | "ACTIVE" | "RETIRED";

export type UniverseRow = {
  symbol: string;
  yahoo: string;
  name: string;
  tier: Tier | null;
  status: UniverseStatus;
  addedBy: string | null;
  promotionRequestedBy: string | null;
  proposedTier: string | null;
};

export const BENCHMARK = "XIC";
export const CANDIDATE_CAP = 20;
export const ON_DEMAND_RESEARCH_PER_DAY = 10; // sized for Cam's Max 20x (was 5)
export const ROTATION_DOSSIERS_PER_DAY = 3;

let cache: { at: number; rows: UniverseRow[] } | null = null;
const TTL_MS = 60_000;

export function invalidateUniverseCache(): void {
  cache = null;
}

async function load(): Promise<UniverseRow[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;
  const rows = await prisma.universeMember.findMany();
  const mapped: UniverseRow[] = rows.map((r) => ({
    symbol: r.symbol,
    yahoo: r.yahoo,
    name: r.name,
    tier: (r.tier as Tier | null) ?? null,
    status: r.status as UniverseStatus,
    addedBy: r.addedBy,
    promotionRequestedBy: r.promotionRequestedBy,
    proposedTier: r.proposedTier,
  }));
  cache = { at: Date.now(), rows: mapped };
  return mapped;
}

export async function allUniverse(): Promise<UniverseRow[]> {
  return load();
}

/** Tradeable names — what the agent may BUY. */
export async function activeUniverse(): Promise<UniverseRow[]> {
  return (await load()).filter((r) => r.status === "ACTIVE");
}

/** Everything we keep data warm for (ACTIVE + CANDIDATE). */
export async function trackedUniverse(): Promise<UniverseRow[]> {
  return (await load()).filter((r) => r.status !== "RETIRED");
}

export async function activeSymbols(): Promise<string[]> {
  return (await activeUniverse()).map((r) => r.symbol);
}

export async function trackedSymbols(): Promise<string[]> {
  return (await trackedUniverse()).map((r) => r.symbol);
}

export async function universeEntry(symbol: string): Promise<UniverseRow | null> {
  return (await load()).find((r) => r.symbol === symbol.toUpperCase()) ?? null;
}

export async function inUniverse(symbol: string): Promise<boolean> {
  return (await universeEntry(symbol)) !== null;
}

export async function toYahoo(symbol: string): Promise<string> {
  const e = await universeEntry(symbol);
  return e?.yahoo ?? `${symbol.toUpperCase().replace(".", "-")}.TO`;
}

// The original hand-screened list — seeds UniverseMember as ACTIVE.
export const SEED: { symbol: string; yahoo: string; name: string; tier: Tier }[] = [
  { symbol: "XIC", yahoo: "XIC.TO", name: "iShares Core S&P/TSX Capped Composite", tier: "etf" },
  { symbol: "XIU", yahoo: "XIU.TO", name: "iShares S&P/TSX 60", tier: "etf" },
  { symbol: "VFV", yahoo: "VFV.TO", name: "Vanguard S&P 500 (CAD)", tier: "etf" },
  { symbol: "VDY", yahoo: "VDY.TO", name: "Vanguard FTSE Cdn High Dividend", tier: "etf" },
  { symbol: "RY", yahoo: "RY.TO", name: "Royal Bank", tier: "large" },
  { symbol: "TD", yahoo: "TD.TO", name: "TD Bank", tier: "large" },
  { symbol: "BNS", yahoo: "BNS.TO", name: "Scotiabank", tier: "large" },
  { symbol: "BMO", yahoo: "BMO.TO", name: "Bank of Montreal", tier: "large" },
  { symbol: "CM", yahoo: "CM.TO", name: "CIBC", tier: "large" },
  { symbol: "NA", yahoo: "NA.TO", name: "National Bank", tier: "large" },
  { symbol: "ENB", yahoo: "ENB.TO", name: "Enbridge", tier: "large" },
  { symbol: "TRP", yahoo: "TRP.TO", name: "TC Energy", tier: "large" },
  { symbol: "CNQ", yahoo: "CNQ.TO", name: "Canadian Natural Resources", tier: "large" },
  { symbol: "SU", yahoo: "SU.TO", name: "Suncor", tier: "large" },
  { symbol: "CVE", yahoo: "CVE.TO", name: "Cenovus", tier: "large" },
  { symbol: "CNR", yahoo: "CNR.TO", name: "CN Rail", tier: "large" },
  { symbol: "CP", yahoo: "CP.TO", name: "CPKC", tier: "large" },
  { symbol: "SHOP", yahoo: "SHOP.TO", name: "Shopify", tier: "large" },
  { symbol: "CSU", yahoo: "CSU.TO", name: "Constellation Software", tier: "large" },
  { symbol: "BCE", yahoo: "BCE.TO", name: "BCE", tier: "large" },
  { symbol: "T", yahoo: "T.TO", name: "TELUS", tier: "large" },
  { symbol: "ABX", yahoo: "ABX.TO", name: "Barrick", tier: "large" },
  { symbol: "AEM", yahoo: "AEM.TO", name: "Agnico Eagle", tier: "large" },
  { symbol: "FTS", yahoo: "FTS.TO", name: "Fortis", tier: "large" },
  { symbol: "MFC", yahoo: "MFC.TO", name: "Manulife", tier: "large" },
  { symbol: "SLF", yahoo: "SLF.TO", name: "Sun Life", tier: "large" },
  { symbol: "ATD", yahoo: "ATD.TO", name: "Couche-Tard", tier: "large" },
  { symbol: "L", yahoo: "L.TO", name: "Loblaw", tier: "large" },
  { symbol: "DOL", yahoo: "DOL.TO", name: "Dollarama", tier: "large" },
  { symbol: "WCN", yahoo: "WCN.TO", name: "Waste Connections", tier: "large" },
  { symbol: "WSP", yahoo: "WSP.TO", name: "WSP Global", tier: "large" },
  { symbol: "BN", yahoo: "BN.TO", name: "Brookfield", tier: "large" },
  { symbol: "OTEX", yahoo: "OTEX.TO", name: "OpenText", tier: "mid" },
  { symbol: "EMA", yahoo: "EMA.TO", name: "Emera", tier: "mid" },
  { symbol: "IFC", yahoo: "IFC.TO", name: "Intact Financial", tier: "mid" },
  { symbol: "K", yahoo: "K.TO", name: "Kinross", tier: "mid" },
  { symbol: "MG", yahoo: "MG.TO", name: "Magna", tier: "mid" },
  { symbol: "TFII", yahoo: "TFII.TO", name: "TFI International", tier: "mid" },
];
