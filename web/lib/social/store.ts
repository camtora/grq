import { prisma } from "../db";
import { etDateStr } from "../../agent/calendar";
import { newsTargets, bareTicker } from "../news/ingest";
import { fetchApeBoard, fetchStocktwitsSentiment, type ApeRow } from "./sources";
import type { SocialDaily } from "@prisma/client";

// Cache-through store for tier-8 social sentiment. runSocialRefresh() pulls the ApeWisdom boards
// once, joins them to our tracked names (held + watched + focus — same set news/options use), adds
// Stocktwits bull/bear, computes velocity vs OUR stored history, and upserts one row per (symbol, ET
// day). getSocial() reads the latest covered row. A SIGNAL the agent weighs (risk/crowding), never
// the gate; on probation in the scoreboard. docs/DATA-SOURCES.md tier 8, DECISIONS D89.

const MENTION_FLOOR = 5; // below this, mention/rank velocity is statistical noise (1-mention names swing rank wildly)
const FRESH_MS = 6 * 60 * 60 * 1000; // re-pull the boards at most ~every 6h (cheap, but no point hammering a free feed)
const ST_CONCURRENCY = 4; // be polite to Stocktwits
const MIN_BULL_SAMPLE = 4; // need at least this many tagged messages before we trust a bull%

/** Upvotes per mention — a crude QUALITY proxy. Organic discussion gets upvoted; comment-spam /
 *  astroturf doesn't. Observed range ~2 (thin) to ~23 (genuine), so we scale a haircut 0.55→1.0
 *  over a ratio of 2→8. null upvotes (untracked) → no haircut. (D89 hardening.) */
function qualityFactor(mentions: number, upvotes: number | null | undefined): number {
  if (upvotes == null || mentions <= 0) return 1;
  const ratio = upvotes / mentions;
  return Math.max(0.55, Math.min(1, 0.55 + 0.45 * ((ratio - 2) / 6)));
}

/** "How loud, getting louder, and is anyone actually engaging?" — log-scaled attention (most of the
 *  score) + a velocity kicker, then a quality haircut for mentions nobody upvoted (likely spam). */
function computeBuzz(mentions: number, velocity: number | null, upvotes?: number | null): number {
  const loud = Math.min(100, (Math.log10(Math.max(mentions, 1)) / Math.log10(400)) * 100); // ~0 at 1 mention, ~100 at 400
  const accel = velocity == null ? 0 : Math.max(-20, Math.min(25, (velocity - 1) * 25)); // rewards heating up, penalises fading
  const raw = loud * 0.85 + accel;
  return Math.max(0, Math.min(100, Math.round(raw * qualityFactor(mentions, upvotes))));
}

/** Our-own velocity: today's mentions ÷ trailing ≤7-day average. Falls back to ApeWisdom's 24h
 *  ratio until we've banked a couple of days of history. null if we have nothing to compare to. */
async function computeVelocity(symbol: string, date: string, mentions: number, ape: ApeRow): Promise<number | null> {
  const hist = await prisma.socialDaily
    .findMany({ where: { symbol, date: { lt: date }, mentions: { gt: 0 } }, orderBy: { date: "desc" }, take: 7, select: { mentions: true } })
    .catch(() => [] as { mentions: number }[]);
  if (hist.length >= 2) {
    const avg = hist.reduce((a, h) => a + h.mentions, 0) / hist.length;
    return avg > 0 ? mentions / avg : null;
  }
  return ape.mentionsPrev > 0 ? mentions / ape.mentionsPrev : null; // day-1 fallback to the vendor baseline
}

/** Daily-ish pass: pull the boards, join our book, write today's SocialDaily rows. Idempotent — if
 *  today's rows are fresh (< FRESH_MS) it reuses them. Around the clock (Reddit buzz builds nights/
 *  weekends), NOT gated on market hours. Returns coverage counts. */
export async function runSocialRefresh(force = false): Promise<{ tried: number; covered: number; reused: boolean }> {
  const date = etDateStr();
  if (!force) {
    const newest = await prisma.socialDaily.findFirst({ where: { date }, orderBy: { fetchedAt: "desc" }, select: { fetchedAt: true } }).catch(() => null);
    if (newest && Date.now() - newest.fetchedAt.getTime() < FRESH_MS) {
      const covered = await prisma.socialDaily.count({ where: { date, covered: true } }).catch(() => 0);
      return { tried: 0, covered, reused: true };
    }
  }

  const [targets, apeAll, apeWsb] = await Promise.all([newsTargets(), fetchApeBoard("all-stocks"), fetchApeBoard("wallstreetbets")]);
  const apeFor = (fmp: string): ApeRow | null => apeAll.get(fmp) ?? apeWsb.get(fmp) ?? null;

  // The names worth a Stocktwits call: tracked + above the mention floor on Reddit.
  const loud = targets.filter((t) => (apeFor(t.fmp)?.mentions ?? 0) >= MENTION_FLOOR);
  const stBy = new Map<string, { bull: number; bear: number } | null>();
  for (let i = 0; i < loud.length; i += ST_CONCURRENCY) {
    const batch = loud.slice(i, i + ST_CONCURRENCY);
    const res = await Promise.all(batch.map((t) => fetchStocktwitsSentiment(t.fmp).then((s) => [t.fmp, s] as const).catch(() => [t.fmp, null] as const)));
    for (const [fmp, s] of res) stBy.set(fmp, s);
  }

  let tried = 0;
  let covered = 0;
  for (const t of targets) {
    tried++;
    const ape = apeFor(t.fmp);
    const mentions = ape?.mentions ?? 0;
    const isCovered = mentions >= MENTION_FLOOR;
    if (isCovered) covered++;

    const velocity = ape ? await computeVelocity(t.stored, date, mentions, ape) : null;
    const st = stBy.get(t.fmp) ?? null;
    const sample = st ? st.bull + st.bear : 0;
    const bullPct = st && sample >= MIN_BULL_SAMPLE ? st.bull / sample : null;
    const sources = [ape ? "apewisdom" : "", bullPct != null ? "stocktwits" : ""].filter(Boolean).join(",");

    const data = {
      covered: isCovered,
      fetchedAt: new Date(),
      mentions,
      velocity: isCovered ? velocity : null, // don't surface velocity for sub-floor noise
      rank: ape?.rank || null,
      rankPrev: ape?.rankPrev || null,
      upvotes: ape?.upvotes ?? null,
      bullPct,
      bullSample: bullPct != null ? sample : null,
      buzz: isCovered ? computeBuzz(mentions, velocity, ape?.upvotes) : 0,
      sources,
    };
    await prisma.socialDaily
      .upsert({ where: { symbol_date: { symbol: t.stored, date } }, update: data, create: { symbol: t.stored, date, ...data } })
      .catch(() => {});
  }
  return { tried, covered, reused: false };
}

/** Latest cached COVERED social row for a symbol, or null. Read-only — never fetches. */
export async function getSocial(symbol: string): Promise<SocialDaily | null> {
  return prisma.socialDaily.findFirst({ where: { symbol: symbol.toUpperCase(), covered: true }, orderBy: { fetchedAt: "desc" } }).catch(() => null);
}

/** On-demand single-name refresh for the stock page: ensures today's row for one symbol exists,
 *  pulling the boards if needed. Returns the covered row (or null if the name has no chatter). */
export async function refreshSocialOne(symbol: string): Promise<SocialDaily | null> {
  const sym = symbol.toUpperCase();
  const existing = await getSocial(sym);
  if (existing && existing.date === etDateStr() && Date.now() - existing.fetchedAt.getTime() < FRESH_MS) return existing;

  const date = etDateStr();
  const fmp = bareTicker(sym);
  const [apeAll, apeWsb] = await Promise.all([fetchApeBoard("all-stocks"), fetchApeBoard("wallstreetbets")]);
  const ape = apeAll.get(fmp) ?? apeWsb.get(fmp) ?? null;
  const mentions = ape?.mentions ?? 0;
  if (mentions < MENTION_FLOOR) {
    await prisma.socialDaily
      .upsert({ where: { symbol_date: { symbol: sym, date } }, update: { covered: false, mentions, fetchedAt: new Date() }, create: { symbol: sym, date, covered: false, mentions } })
      .catch(() => {});
    return null;
  }
  const st = await fetchStocktwitsSentiment(fmp).catch(() => null);
  const sample = st ? st.bull + st.bear : 0;
  const bullPct = st && sample >= MIN_BULL_SAMPLE ? st.bull / sample : null;
  const velocity = ape ? await computeVelocity(sym, date, mentions, ape) : null;
  const data = {
    covered: true,
    fetchedAt: new Date(),
    mentions,
    velocity,
    rank: ape?.rank || null,
    rankPrev: ape?.rankPrev || null,
    upvotes: ape?.upvotes ?? null,
    bullPct,
    bullSample: bullPct != null ? sample : null,
    buzz: computeBuzz(mentions, velocity, ape?.upvotes),
    sources: [ape ? "apewisdom" : "", bullPct != null ? "stocktwits" : ""].filter(Boolean).join(","),
  };
  return prisma.socialDaily.upsert({ where: { symbol_date: { symbol: sym, date } }, update: data, create: { symbol: sym, date, ...data } }).catch(() => null);
}

/** A compact one-line digest for the agent's context / dossier prompt. null-safe. */
export function socialLine(s: SocialDaily): string {
  const vel =
    s.velocity != null
      ? `${s.velocity.toFixed(1)}× our 7-day avg ${s.velocity >= 1.5 ? "(SPIKING)" : s.velocity >= 1.15 ? "(rising)" : s.velocity <= 0.6 ? "(cooling)" : "(steady)"}`
      : "velocity n/a";
  const bull = s.bullPct != null ? `; ${Math.round(s.bullPct * 100)}% bullish (Stocktwits, n=${s.bullSample ?? 0}, bot-screened)` : "";
  const rank = s.rank ? `; #${s.rank} on the Reddit board` : "";
  // Low upvotes-per-mention = chatter nobody engaged with → discount it (already haircut into buzz).
  const ratio = s.upvotes != null && s.mentions > 0 ? s.upvotes / s.mentions : null;
  const quality = ratio != null && ratio < 3 ? `; ⚠ low engagement (${ratio.toFixed(1)} upvotes/mention — thin or spammy)` : "";
  return `${s.mentions} Reddit mentions, ${vel}${bull}${rank}; buzz ${s.buzz}/100${quality}`;
}
