// The tradeable universe: screened, liquid TSX names. Symbols are stored bare
// everywhere in GRQ; the Yahoo mapping happens only at the data boundary.
// Risk-dial tiers: CAUTIOUS = etf+large, BALANCED = +mid, AGGRESSIVE = all.

export type Tier = "etf" | "large" | "mid";

export type UniverseEntry = {
  symbol: string;
  yahoo: string;
  name: string;
  tier: Tier;
};

export const BENCHMARK = "XIC";

export const UNIVERSE: UniverseEntry[] = [
  // Broad ETFs
  { symbol: "XIC", yahoo: "XIC.TO", name: "iShares Core S&P/TSX Capped Composite", tier: "etf" },
  { symbol: "XIU", yahoo: "XIU.TO", name: "iShares S&P/TSX 60", tier: "etf" },
  { symbol: "VFV", yahoo: "VFV.TO", name: "Vanguard S&P 500 (CAD)", tier: "etf" },
  { symbol: "VDY", yahoo: "VDY.TO", name: "Vanguard FTSE Cdn High Dividend", tier: "etf" },
  // Large caps
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
  // Liquid mids
  { symbol: "OTEX", yahoo: "OTEX.TO", name: "OpenText", tier: "mid" },
  { symbol: "EMA", yahoo: "EMA.TO", name: "Emera", tier: "mid" },
  { symbol: "IFC", yahoo: "IFC.TO", name: "Intact Financial", tier: "mid" },
  { symbol: "K", yahoo: "K.TO", name: "Kinross", tier: "mid" },
  { symbol: "MG", yahoo: "MG.TO", name: "Magna", tier: "mid" },
  { symbol: "TFII", yahoo: "TFII.TO", name: "TFI International", tier: "mid" },
];

const bySymbol = new Map(UNIVERSE.map((u) => [u.symbol, u]));

export function inUniverse(symbol: string): boolean {
  return bySymbol.has(symbol.toUpperCase());
}

export function universeEntry(symbol: string): UniverseEntry | null {
  return bySymbol.get(symbol.toUpperCase()) ?? null;
}

export function toYahoo(symbol: string): string {
  return bySymbol.get(symbol.toUpperCase())?.yahoo ?? `${symbol.toUpperCase()}.TO`;
}

export function universeSymbols(): string[] {
  return UNIVERSE.map((u) => u.symbol);
}
