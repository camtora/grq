/** FMP's ticker-keyed logo image (web lib/logos.ts fmpLogo) — no key, and it
 * 404s on unknown tickers so <StockLogo>'s onError cleanly falls back to the
 * monogram. Safe ONLY for symbols that are real FMP tickers (e.g. the whole-
 * market gainers feed) — universe symbols (AMD.US, bare CA) must use the
 * server-resolved logoUrl instead, or a same-ticker US look-alike could render
 * a confidently-wrong logo (the D105 lesson). */
export function fmpLogo(symbol: string): string {
  return `https://financialmodelingprep.com/image-stock/${encodeURIComponent(symbol.trim().toUpperCase())}.png`;
}
