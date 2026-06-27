import { prisma } from "../db";
import { stripSuffix } from "../fmp";
import { etDateStr } from "../../agent/calendar";
import { fetchOptionChain } from "./cboe";
import { computeOptionsSignals } from "./signals";
import type { OptionsDaily } from "@prisma/client";

// Cache-through store for tier-3 options positioning. refreshOptions() fetches CBOE + computes our
// signals + upserts one row per (symbol, ET day); getOptions() reads the latest cached row. The
// stored symbol is what the stock page / agent know it by; CBOE is keyed by the bare US ticker.

const CA_SUFFIX = /\.(TO|V|NE|CN)$/i; // Canadian listings — never on CBOE, don't bother fetching
const FRESH_MS = 55 * 60 * 1000; // a covered name re-fetches after ~55 min (hourly intraday refresh)

/** Fetch + compute + cache for a stored symbol. Returns the row, or null if no options coverage.
 *  Hourly freshness: a covered row < ~55 min old is reused, a stale one re-fetched. No-coverage is
 *  remembered for the rest of the ET day (negative cache — a name won't grow options intraday).
 *  force=true bypasses the freshness check. */
export async function refreshOptions(symbol: string, force = false): Promise<OptionsDaily | null> {
  const sym = symbol.toUpperCase();
  if (CA_SUFFIX.test(sym)) return null; // US options only
  const date = etDateStr();
  const cached = await prisma.optionsDaily.findUnique({ where: { symbol_date: { symbol: sym, date } } }).catch(() => null);
  if (cached && !force) {
    if (!cached.covered) return null; // remembered "no options" — day-scoped, don't re-check
    if (Date.now() - cached.fetchedAt.getTime() < FRESH_MS) return cached; // still fresh
    // else: stale covered row → fall through and re-fetch for an intraday update
  }
  const chain = await fetchOptionChain(stripSuffix(sym));
  if (!chain) {
    // No listed options — remember the miss for the rest of the day so we don't re-hit CBOE.
    await prisma.optionsDaily
      .upsert({
        where: { symbol_date: { symbol: sym, date } },
        update: { covered: false, fetchedAt: new Date() },
        create: { symbol: sym, date, covered: false, spotCents: 0, netGex: 0, regime: "none" },
      })
      .catch(() => {});
    return null;
  }
  const s = computeOptionsSignals(chain);
  const data = {
    covered: true,
    fetchedAt: new Date(),
    spotCents: s.spotCents,
    netGex: s.netGex,
    regime: s.regime,
    callWallCents: s.callWallCents,
    putWallCents: s.putWallCents,
    pcOI: s.pcOI,
    pcVol: s.pcVol,
    atmIvBps: s.atmIvBps,
    skewBps: s.skewBps,
    callOI: s.totalCallOI,
    putOI: s.totalPutOI,
    callVol: s.totalCallVol,
    putVol: s.totalPutVol,
  };
  return prisma.optionsDaily
    .upsert({ where: { symbol_date: { symbol: sym, date } }, update: data, create: { symbol: sym, date, ...data } })
    .catch(() => null);
}

/** Daily pass: ensure today's options cache for the names that matter (held + watched + focus,
 *  same set the news ingest uses). US names only; CA/illiquid skip. Idempotent — reuses today's
 *  cache (force=false), so a restart doesn't re-hammer CBOE. */
export async function runOptionsRefresh(): Promise<{ tried: number; covered: number }> {
  const { newsTargets } = await import("../news/ingest");
  const targets = await newsTargets().catch(() => [] as { stored: string }[]);
  let tried = 0;
  let covered = 0;
  for (const t of targets) {
    tried++;
    const r = await refreshOptions(t.stored).catch(() => null);
    if (r) covered++;
  }
  return { tried, covered };
}

/** Latest cached COVERED options row for a symbol, or null. Read-only — never fetches; skips
 *  no-coverage negative-cache rows. */
export async function getOptions(symbol: string): Promise<OptionsDaily | null> {
  return prisma.optionsDaily.findFirst({ where: { symbol: symbol.toUpperCase(), covered: true }, orderBy: { fetchedAt: "desc" } }).catch(() => null);
}

/** A compact one-line digest for the agent's context / dossier prompt. null if no coverage. */
export function optionsLine(o: OptionsDaily): string {
  const flip = o.regime === "negative";
  const wall = (c: number | null) => (c != null ? `$${(c / 100).toFixed(0)}` : "—");
  return (
    `dealer GEX ${flip ? "NEGATIVE (amplifies moves — trendy/volatile)" : "POSITIVE (dampens moves — range-bound/pinned)"}` +
    `; put/call ${o.pcOI != null ? o.pcOI.toFixed(2) : "?"} OI / ${o.pcVol != null ? o.pcVol.toFixed(2) : "?"} vol` +
    `${o.atmIvBps != null ? `; ATM IV ${(o.atmIvBps / 100).toFixed(0)}%` : ""}` +
    `${o.skewBps != null ? `; 25Δ skew ${o.skewBps >= 0 ? "+" : ""}${o.skewBps}bp${o.skewBps > 200 ? " (heavy downside hedging)" : ""}` : ""}` +
    `; call wall ${wall(o.callWallCents)} / put wall ${wall(o.putWallCents)}`
  );
}
