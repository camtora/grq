// A rotating financial-literacy "fun fact" for the Today brief — the literacy
// pillar made delightful. Picked by day-of-year so it changes daily.
export const FUN_FACTS = [
  "The TSX is older than Canada's flag — it opened in 1861; the maple leaf arrived in 1965.",
  "Compounding beats timing: $1 doubling every year for 20 years is over $1,000,000.",
  "A 'bull' market is named for how a bull attacks — horns thrust UP; a bear swipes DOWN.",
  "Warren Buffett made ~99% of his wealth after age 50 — investing rewards patience, not speed.",
  "The S&P 500 has never lost money over any 20-year holding period in its history.",
  "Over time, index funds beat most active managers — largely because of fees.",
  "A TFSA isn't a savings account — you can hold stocks, ETFs and bonds in it, all tax-free.",
  "Capital gains in Canada are only HALF-taxable — a quirk that rewards long-term gains.",
  "The first stock exchange opened in Amsterdam in 1602, to trade Dutch East India Company shares.",
  "The Rule of 72: divide 72 by your return % to estimate the years to double your money.",
  "'Blue chip' comes from poker, where blue chips are the most valuable.",
  "Most of the market's long-run return comes from a handful of its best days — so staying invested matters.",
  "Market cap is price × shares — not how much cash a company has or makes.",
  "Diversification is the only free lunch in investing: spreading risk costs you nothing.",
  "Inflation is a silent tax — 3% a year halves your money's purchasing power in ~24 years.",
  "Fees compound against you exactly like returns compound for you — 2% a year is brutal over decades.",
  "Reinvested dividends have driven a huge share of the stock market's total return.",
  "Short selling has unlimited downside — a stock can only fall to zero, but can rise forever.",
  "Dollar-cost averaging — buying a fixed amount on a schedule — quietly removes the urge to time the market.",
  "Your superficial-loss rule: sell at a loss and rebuy within 30 days, and the CRA denies the loss.",
];

export function funFactOfDay(d = new Date()): string {
  const dayOfYear = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86_400_000);
  return FUN_FACTS[dayOfYear % FUN_FACTS.length];
}
