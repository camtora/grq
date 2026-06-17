import { prisma } from "./db";
import { getQuote } from "./broker/quotes";

/** The automated promotion liquidity screen: price ≥ $2, 20d ADV ≥ 100k sh, ≥30
 *  bars of history. Shared by the human promotion route AND the agent's
 *  self-promote path so both clear the SAME deterministic bar. Returns the list of
 *  failures ([] = pass). Lives in its own module to avoid a universe↔quotes import
 *  cycle (quotes already imports universe). */
export async function promotionScreen(symbol: string): Promise<string[]> {
  const failures: string[] = [];
  const quote = await getQuote(symbol);
  if (!quote) failures.push("no quote available");
  else if (quote.midCents < 200) failures.push(`price $${(quote.midCents / 100).toFixed(2)} < $2.00 floor`);
  const bars = await prisma.bar.findMany({ where: { symbol }, orderBy: { date: "desc" }, take: 20 });
  if (bars.length < 20) {
    const total = await prisma.bar.count({ where: { symbol } });
    if (total < 30) failures.push(`insufficient bar history (${total} days; need 30)`);
  }
  if (bars.length > 0) {
    const adv = bars.reduce((s, b) => s + b.volume, 0) / bars.length;
    if (adv < 100_000) failures.push(`20d avg volume ${Math.round(adv).toLocaleString()} < 100,000 sh`);
  }
  return failures;
}
