// Shared option contract resolution + marking for the REAL fund path (D99 — docs/ALFRED-OPTIONS.md).
// Mirrors the proven Options Desk engine (agent/options-desk/engine.ts) but operates on the real
// OptionPosition ledger instead of the sandbox Desk* tables. Buy-to-open long calls/puts only.
// US-only (the CBOE chain feed is US-only). All per-share premiums are cents; no floats (rule #4).
import { prisma } from "../db";
import { getQuote } from "../broker/quotes";
import { toCadCents } from "../fx";
import { fetchOptionChain, type OptChain } from "./cboe";
import { pickContract, markContractCents, findContract, intrinsicCents } from "./price";

/** Universe symbol → the bare US ticker the CBOE chain feed wants (e.g. "NVDA.US" → "NVDA"). */
export function bareUsTicker(symbol: string): string {
  return symbol.toUpperCase().replace(/\.(US|USD|USA)$/i, "");
}

/** Per-share mark (cents) of a specific contract given a live chain: CBOE mid → last → Black-Scholes,
 *  else intrinsic value at the chain spot (a contract the chain no longer lists). Same precedence the
 *  Options Desk uses. Caller passes the chain so a batch of marks shares one fetch. */
export function markFromChain(chain: OptChain, right: "CALL" | "PUT", strikeCents: number, expiry: string, now: Date): number {
  const c = findContract(chain, right, strikeCents, expiry);
  return c ? markContractCents(c, chain.spotCents, now) : intrinsicCents(right, chain.spotCents, strikeCents);
}

export type ResolvedContract = { bareTicker: string; strikeCents: number; expiry: string; multiplier: number; markCents: number };

/** Resolve the concrete BUY-TO-OPEN contract for (symbol, right, bias): pick the one contract within
 *  [minDte, maxDte] from the live chain (deterministic — pickContract) and mark it. Returns an error
 *  string when there's no US chain or no priceable contract. The agent picks a bias, never a strike. */
export async function resolveOpenContract(
  symbol: string,
  right: "CALL" | "PUT",
  bias: "ATM" | "SLIGHTLY_OTM",
  now: Date,
  minDte: number,
  maxDte: number,
): Promise<ResolvedContract | { error: string }> {
  const bare = bareUsTicker(symbol);
  const chain = await fetchOptionChain(bare).catch(() => null);
  if (!chain) return { error: `No listed US options for ${bare} (CBOE).` };
  const c = pickContract(chain, right, bias, now, minDte, maxDte);
  if (!c) return { error: `No ${minDte}–${maxDte} day ${right.toLowerCase()} contract for ${bare}.` };
  const mark = markContractCents(c, chain.spotCents, now);
  if (mark <= 0) return { error: `No priceable premium for ${bare} $${(c.strikeCents / 100).toFixed(0)} ${right.toLowerCase()}.` };
  return { bareTicker: bare, strikeCents: c.strikeCents, expiry: c.expiry, multiplier: 100, markCents: mark };
}

/** Mark a HELD contract (for a close or a NAV mark): live chain if available, else intrinsic at the
 *  stock quote, else null (caller falls back to ACB — the same defensive ladder stocks use). */
export async function markHeldContract(symbol: string, right: "CALL" | "PUT", strikeCents: number, expiry: string, now: Date): Promise<number | null> {
  const bare = bareUsTicker(symbol);
  const chain = await fetchOptionChain(bare).catch(() => null);
  if (chain) return markFromChain(chain, right, strikeCents, expiry, now);
  const q = await getQuote(symbol).catch(() => null);
  if (q && q.midCents > 0) return intrinsicCents(right, q.midCents, strikeCents);
  return null;
}

/** Total CAD value of EVERY held option position + per-id marks, for NAV. Zero positions → {0, empty}
 *  with NO network fetch — so the stock NAV path is byte-for-byte unchanged when the fund holds no
 *  options. One chain fetch per distinct underlying; a position whose chain is unavailable holds at ACB
 *  (defensive, like a stock with no quote falls back to avgCost). */
export async function valueOptionPositionsCad(fx: number | null, now: Date): Promise<{ totalCadCents: number; markById: Map<number, number> }> {
  const opts = await prisma.optionPosition.findMany();
  const markById = new Map<number, number>();
  if (opts.length === 0) return { totalCadCents: 0, markById };
  const chains = new Map<string, OptChain | null>();
  let totalCad = 0;
  for (const p of opts) {
    const bare = bareUsTicker(p.symbol);
    if (!chains.has(bare)) chains.set(bare, await fetchOptionChain(bare).catch(() => null));
    const chain = chains.get(bare) ?? null;
    const right = p.right === "PUT" ? "PUT" : "CALL";
    const mark = chain ? markFromChain(chain, right, p.strikeCents, p.expiry.toISOString().slice(0, 10), now) : p.avgCostCents;
    markById.set(p.id, mark);
    totalCad += toCadCents(p.qty * p.multiplier * mark, p.currency, fx);
  }
  return { totalCadCents: totalCad, markById };
}
