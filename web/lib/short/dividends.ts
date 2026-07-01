// Dividend carry on a short (docs/SHORT-LAB.md Phase 3). A short borrows shares, so it OWES any dividend
// the stock pays while short — a real cost we now model. Cached 12h per symbol (dividends move quarterly)
// so the hot mark path doesn't hammer FMP; best-effort (0 on any failure — never breaks marking).
import { fmpDividends, dividendsBetween, type DividendRow } from "../fmp";

const cache = new Map<string, { at: number; rows: DividendRow[] }>();
const TTL_MS = 12 * 3_600_000;

async function divsFor(symbol: string): Promise<DividendRow[]> {
  const hit = cache.get(symbol);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.rows;
  const rows = await fmpDividends(symbol).catch(() => []);
  cache.set(symbol, { at: Date.now(), rows });
  return rows;
}

/** Per-share dividend (cents) a short of `symbol` accrues from `sinceISO` (exclusive) to today. */
export async function shortDividendCents(symbol: string, sinceISO: string): Promise<number> {
  try {
    return dividendsBetween(await divsFor(symbol), sinceISO, new Date().toISOString().slice(0, 10));
  } catch {
    return 0;
  }
}
