// The living-examples engine (docs/LEARN-FRAMEWORK.md D111 §6, phase L4). Each generator
// pulls facts from data GRQ ALREADY stores (bars, delayed quotes, insider tape, social
// buzz, the macro snapshot) and writes a 2–4 sentence market example into `LearnExample`,
// which the lesson's `example` block renders with an honest "live · as of" stamp.
//
// v1 narration is DETERMINISTIC — authored templates with the numbers injected. That's a
// deliberate deviation from the doc's "one Haiku call" line: the living part is the DATA
// changing nightly, template prose keeps the voice exact, and the token cost is zero (the
// Max quota is load-bearing, D96). A narration polish can slot in per-generator later
// without touching the shape.
//
// Rules: a generator returns null when the data can't support an honest example (the
// lesson then renders its authored fallback); every failure is caught per-key; nothing
// here ever throws upward into the runner's tick.
import { prisma } from "../db";
import { activeSymbols } from "../universe";
import type { LearnExampleKey } from "./content";

const DAY = 24 * 60 * 60 * 1000;
const NICE_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric" });
const money = (c: number) => `$${Math.floor(c / 100)}.${String(Math.abs(c) % 100).padStart(2, "0")}`;
const pct1 = (bps: number) => `${(bps / 100).toFixed(1)}%`;
const signed = (bps: number) => `${bps >= 0 ? "+" : "−"}${Math.abs(bps / 100).toFixed(1)}%`;

type BarRow = { symbol: string; date: Date; openCents: number; closeCents: number; volume: number };

type Ctx = {
  symbols: string[];
  /** ~50 calendar days of bars for every tracked name, ascending per symbol. */
  barsBySym: Map<string, BarRow[]>;
};

async function buildCtx(): Promise<Ctx> {
  const symbols = await activeSymbols();
  const rows = await prisma.bar.findMany({
    where: { symbol: { in: symbols }, date: { gte: new Date(Date.now() - 50 * DAY) } },
    orderBy: { date: "asc" },
    select: { symbol: true, date: true, openCents: true, closeCents: true, volume: true },
  });
  const barsBySym = new Map<string, BarRow[]>();
  for (const r of rows) {
    const arr = barsBySym.get(r.symbol) ?? [];
    arr.push(r);
    barsBySym.set(r.symbol, arr);
  }
  return { symbols, barsBySym };
}

type Generated = { md: string; data?: Record<string, unknown> } | null;

type Generator = {
  courseSlug: string;
  lessonSlug: string;
  generate: (ctx: Ctx) => Promise<Generated>;
};

/* ── the generators ─────────────────────────────────────────────────────────── */

/** The biggest true overnight gap (open vs prior close) among tracked names, ~2 weeks. */
async function biggestGap(ctx: Ctx): Promise<Generated> {
  let best: { sym: string; date: Date; prevClose: number; open: number; bps: number } | null = null;
  for (const [sym, bars] of ctx.barsBySym) {
    const recent = bars.slice(-11);
    for (let i = 1; i < recent.length; i++) {
      const prev = recent[i - 1].closeCents;
      if (prev < 200) continue; // penny noise makes dishonest percentages
      const bps = Math.round(((recent[i].openCents - prev) * 10000) / prev);
      if (!best || Math.abs(bps) > Math.abs(best.bps)) {
        best = { sym, date: recent[i].date, prevClose: prev, open: recent[i].openCents, bps };
      }
    }
  }
  if (!best || Math.abs(best.bps) < 150) return null; // under 1.5% isn't a story
  return {
    md: `Live from the names GRQ tracks: **${best.sym}** closed at ${money(best.prevClose)}, and the next session opened at ${money(best.open)} — **${signed(best.bps)} while the market was shut** (${NICE_DAY.format(best.date)}). Nobody traded it there; the first print simply agreed on a new number. A stop-loss set in between those prices would have filled at the open, not at the stop.`,
    data: best as unknown as Record<string, unknown>,
  };
}

/** The loudest recent move — size + volume vs the name's own average = conviction or shrug. */
async function volumeMover(ctx: Ctx): Promise<Generated> {
  let best: { sym: string; date: Date; bps: number; ratio: number } | null = null;
  for (const [sym, bars] of ctx.barsBySym) {
    if (bars.length < 25) continue;
    const last = bars[bars.length - 1];
    const prev = bars[bars.length - 2];
    if (!prev || prev.closeCents < 200) continue;
    const bps = Math.round(((last.closeCents - prev.closeCents) * 10000) / prev.closeCents);
    const hist = bars.slice(-31, -1);
    const avgVol = hist.reduce((n, b) => n + b.volume, 0) / Math.max(hist.length, 1);
    if (avgVol < 1000) continue;
    const ratio = last.volume / avgVol;
    if (Math.abs(bps) < 200) continue; // want a ≥2% move to talk about
    if (!best || Math.abs(bps) * Math.min(ratio, 4) > Math.abs(best.bps) * Math.min(best.ratio, 4)) {
      best = { sym, date: last.date, bps, ratio };
    }
  }
  if (!best) return null;
  const conviction = best.ratio >= 1.5;
  return {
    md: conviction
      ? `The loudest recent tape among tracked names: **${best.sym}** moved **${signed(best.bps)}** on **${best.ratio.toFixed(1)}×** its usual volume (${NICE_DAY.format(best.date)}). That's real money changing its mind — impatient buyers or anxious sellers eating through the standing orders, not a shrug.`
      : `A move worth reading twice: **${best.sym}** printed **${signed(best.bps)}** on just ${best.ratio.toFixed(1)}× its usual volume (${NICE_DAY.format(best.date)}). Same headline number a conviction move would make — but on a trickle like that, it's a shrug that can reverse by lunch. Volume is the difference.`,
    data: best as unknown as Record<string, unknown>,
  };
}

/** Tightest vs widest live spread among tracked names — liquidity, priced. */
async function spreadPair(): Promise<Generated> {
  const quotes = await prisma.quote.findMany({
    where: { fetchedAt: { gte: new Date(Date.now() - 4 * DAY) }, bidCents: { gt: 0 } },
    select: { symbol: true, bidCents: true, askCents: true, midCents: true },
  });
  const rated = quotes
    .filter((q) => q.askCents > q.bidCents && q.midCents > 200)
    .map((q) => ({ ...q, bps: Math.round(((q.askCents - q.bidCents) * 10000) / q.midCents) }))
    .filter((q) => q.bps > 0 && q.bps < 2000);
  if (rated.length < 6) return null;
  rated.sort((a, b) => a.bps - b.bps);
  const tight = rated[0];
  const wide = rated[rated.length - 1];
  if (wide.bps < tight.bps * 3) return null; // no contrast, no lesson
  const toll = (bps: number) => `$${((bps / 10000) * 1000).toFixed(2)}`;
  return {
    md: `On GRQ's own (delayed) quotes right now: **${tight.symbol}** shows ${money(tight.bidCents)} / ${money(tight.askCents)} — a ${tight.bps} bps spread — while **${wide.symbol}** shows ${money(wide.bidCents)} / ${money(wide.askCents)}, **${wide.bps} bps of open water**. Put $1,000 into each and you start ${toll(tight.bps)} vs ${toll(wide.bps)} underwater before either stock moves. That gap is liquidity, priced by the market makers who have to carry it.`,
    data: { tight, wide },
  };
}

/** Calmest vs bumpiest tracked name over ~30 sessions — sizing's whole argument. */
async function calmVsBumpy(ctx: Ctx): Promise<Generated> {
  const stats: { sym: string; sd: number; worst: number }[] = [];
  for (const [sym, bars] of ctx.barsBySym) {
    if (bars.length < 21 || bars[bars.length - 1].closeCents < 200) continue;
    const rets: number[] = [];
    for (let i = 1; i < bars.length; i++) {
      if (bars[i - 1].closeCents <= 0) continue;
      rets.push(((bars[i].closeCents - bars[i - 1].closeCents) * 10000) / bars[i - 1].closeCents);
    }
    if (rets.length < 20) continue;
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length);
    const worst = rets.reduce((w, r) => (Math.abs(r) > Math.abs(w) ? r : w), 0);
    stats.push({ sym, sd, worst });
  }
  if (stats.length < 6) return null;
  stats.sort((a, b) => a.sd - b.sd);
  const calm = stats[0];
  const bumpy = stats[stats.length - 1];
  if (bumpy.sd < calm.sd * 2) return null;
  return {
    md: `Same market, different weather — measured on the names GRQ tracks, last month: **${calm.sym}**'s typical day is about ±${pct1(calm.sd)}, while **${bumpy.sym}** swings ±${pct1(bumpy.sd)} — **${(bumpy.sd / calm.sd).toFixed(1)}× the turbulence**, with a worst single day of ${signed(bumpy.worst)}. The sizing rule exists for exactly this: you don't avoid ${bumpy.sym}, you own less of it.`,
    data: { calm, bumpy },
  };
}

/** The freshest open-market insider cluster buy on the tape. */
async function insiderCluster(): Promise<Generated> {
  const buys = await prisma.insiderTrade.findMany({
    where: { side: "BUY", txnType: { startsWith: "P" }, txnDate: { gte: new Date(Date.now() - 14 * DAY) } },
    select: { symbol: true, insiderName: true, valueUsd: true, txnDate: true },
  });
  const bySym = new Map<string, { insiders: Set<string>; total: number; latest: Date }>();
  for (const b of buys) {
    const cur = bySym.get(b.symbol) ?? { insiders: new Set<string>(), total: 0, latest: b.txnDate };
    cur.insiders.add(b.insiderName);
    cur.total += b.valueUsd;
    if (b.txnDate > cur.latest) cur.latest = b.txnDate;
    bySym.set(b.symbol, cur);
  }
  let best: { sym: string; n: number; total: number; latest: Date } | null = null;
  for (const [sym, v] of bySym) {
    if (v.insiders.size < 2) continue;
    if (!best || v.insiders.size > best.n || (v.insiders.size === best.n && v.total > best.total)) {
      best = { sym, n: v.insiders.size, total: v.total, latest: v.latest };
    }
  }
  if (!best || best.total < 50_000) return null;
  const totalStr = best.total >= 1_000_000 ? `$${(best.total / 1_000_000).toFixed(1)}M` : `$${Math.round(best.total / 1000)}k`;
  return {
    md: `Freshest cluster on the tape GRQ ingests: **${best.n} insiders at ${best.sym}** bought roughly **${totalStr}** of their own stock on the open market inside two weeks (latest ${NICE_DAY.format(best.latest)}). Open-market buys with their own cash are the one insider pattern worth attention — and still only a lead. The dossier work comes before any trade, every time.`,
    data: best as unknown as Record<string, unknown>,
  };
}

/** The loudest name on the crowd gauge — buzz as RISK colour, never a tip. */
async function buzzLeader(): Promise<Generated> {
  const latest = await prisma.socialDaily.findFirst({ orderBy: { date: "desc" }, select: { date: true } });
  if (!latest) return null;
  const rows = await prisma.socialDaily.findMany({
    where: { date: latest.date, covered: true, mentions: { gte: 5 } },
    orderBy: { buzz: "desc" },
    take: 1,
  });
  const top = rows[0];
  if (!top || top.buzz < 40) return null;
  const vel = top.velocity && top.velocity > 1.2 ? ` and running **${top.velocity.toFixed(1)}×** its own usual chatter` : "";
  const bull = top.bullPct !== null && top.bullSample && top.bullSample >= 10 ? ` About ${Math.round(top.bullPct * 100)}% of tagged posts read bullish.` : "";
  return {
    md: `The loudest tracked name on the crowd gauge today: **${top.symbol}** — ${top.mentions} Reddit mentions${vel} (buzz ${top.buzz}/100).${bull} Read it the way this lesson says: crowding is a risk flag on names you hold, not a shopping list. By the time chatter goes vertical, the easy money has usually left the building.`,
    data: { symbol: top.symbol, date: top.date, mentions: top.mentions, velocity: top.velocity, buzz: top.buzz, bullPct: top.bullPct },
  };
}

/** A month of USD/CAD drift — the silent passenger, measured. */
async function fxDrift(): Promise<Generated> {
  const rows = await prisma.macroDaily.findMany({
    where: { usdcad: { not: null } },
    orderBy: { date: "desc" },
    take: 40,
    select: { date: true, usdcad: true },
  });
  if (rows.length < 15) return null;
  const now = rows[0];
  const then = rows.find((r) => now.date.localeCompare(r.date) >= 0 && daysBetween(r.date, now.date) >= 26) ?? rows[rows.length - 1];
  if (!now.usdcad || !then.usdcad || daysBetween(then.date, now.date) < 15) return null;
  const drift = ((now.usdcad - then.usdcad) / then.usdcad) * 100;
  const dir = drift >= 0 ? "strengthened against the loonie" : "slipped against the loonie";
  const effect =
    Math.abs(drift) < 0.3
      ? `Some months the passenger sleeps — this was one of them. It doesn't always.`
      : `Hold a US stock that went exactly nowhere over that stretch and your CAD statement still moved ${Math.abs(drift).toFixed(1)}% — ${drift >= 0 ? "in your favour, this time" : "against you, this time"}. The passenger rides every cross-border position, both directions.`;
  return {
    md: `Measured off GRQ's own macro feed: over the last month USD/CAD went **${then.usdcad.toFixed(4)} → ${now.usdcad.toFixed(4)}** — the US dollar ${dir} by **${Math.abs(drift).toFixed(1)}%**. ${effect}`,
    data: { from: then, to: now, driftPct: drift },
  };
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / DAY);
}

/* ── the registry + the refresh ─────────────────────────────────────────────── */

export const EXAMPLE_GENERATORS: Record<LearnExampleKey, Generator> = {
  "biggest-gap": { courseSlug: "the-machine", lessonSlug: "market-hours", generate: biggestGap },
  "volume-mover": { courseSlug: "how-a-price-happens", lessonSlug: "what-moves-a-price", generate: volumeMover },
  "spread-pair": { courseSlug: "how-a-price-happens", lessonSlug: "market-makers-and-liquidity", generate: () => spreadPair() },
  "calm-vs-bumpy": { courseSlug: "risk", lessonSlug: "volatility", generate: calmVsBumpy },
  "insider-cluster": { courseSlug: "reading-the-game", lessonSlug: "big-money", generate: () => insiderCluster() },
  "buzz-leader": { courseSlug: "reading-the-game", lessonSlug: "news-and-the-crowd", generate: () => buzzLeader() },
  "fx-drift": { courseSlug: "owning-a-piece", lessonSlug: "two-currencies", generate: () => fxDrift() },
};

/** Refresh every living example. Skips keys refreshed in the last 18h unless forced;
 *  a generator returning null keeps a recent row (≤5 days — still honestly stamped)
 *  and deletes an older one so the lesson falls back to its authored illustration. */
export async function runLearnExamplesRefresh(force = false): Promise<number> {
  const ctx = await buildCtx();
  const existing = await prisma.learnExample.findMany({ select: { key: true, asOf: true } });
  const byKey = new Map(existing.map((e) => [e.key, e.asOf]));
  let wrote = 0;
  for (const [key, gen] of Object.entries(EXAMPLE_GENERATORS) as [LearnExampleKey, Generator][]) {
    try {
      const last = byKey.get(key);
      if (!force && last && Date.now() - last.getTime() < 18 * 60 * 60 * 1000) continue;
      const out = await gen.generate(ctx);
      if (out) {
        await prisma.learnExample.upsert({
          where: { key },
          create: { key, courseSlug: gen.courseSlug, lessonSlug: gen.lessonSlug, asOf: new Date(), md: out.md, dataJson: (out.data ?? {}) as object },
          update: { asOf: new Date(), md: out.md, dataJson: (out.data ?? {}) as object },
        });
        wrote++;
      } else if (last && Date.now() - last.getTime() > 5 * DAY) {
        await prisma.learnExample.delete({ where: { key } }).catch(() => {});
      }
    } catch (e) {
      console.error(`[learn] example "${key}" failed:`, e instanceof Error ? e.message : e);
    }
  }
  return wrote;
}
