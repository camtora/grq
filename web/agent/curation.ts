// Research-refresh materiality gate + pool curation (Cam 2026-07-05, policy.ts REFRESH).
//
// The weekly Sunday sweep used to re-dossier EVERY tracked name blind — ~200 names,
// ~57M tokens, a third of the week's shared Claude-Max quota in one overnight batch.
// This module makes the sweep SELECTIVE and keeps the pool lean:
//
//   • the GATE (decideRefresh) — a name is re-researched only when something MATERIAL
//     changed since its last dossier (price drift, earnings, relevant news, an insider
//     cluster, a crowd spike) or it crossed the staleness floor. Never-dossiered
//     unwatched candidates are LEFT for on-demand research (D46), not blind-dossiered.
//   • the PRUNE (decidePrune) — a dead CANDIDATE (unwatched, un-pinned, not buy-rated,
//     stale) is RETIRED so the sweep iterates over fewer names. Reversible: the hunt can
//     resurface it, and opening its stock page re-adds it.
//
// This governs whether we SPEND TOKENS re-researching. It NEVER touches the §6 order
// gate, a dossier's content, or any trade decision — worst case a quiet name waits a few
// extra days (the staleness floor guarantees nothing goes stale forever). The two
// decision functions are PURE (unit-tested in test/curation.test.ts); planWeeklyCuration
// is read-only (the dry-run calls it); applyCuration does the writes.

import { prisma } from "@/lib/db";
import { trackedUniverse, invalidateUniverseCache } from "@/lib/universe";
import { REFRESH, SELF_INVEST, AGENT_VERSION } from "./policy";
import { fmpEnabled, fmpEarningsCalendar, stripSuffix } from "@/lib/fmp";

const DAY_MS = 24 * 60 * 60_000;
const bare = (s: string) => stripSuffix(s).toUpperCase();

/* ─────────────────────────── the pure decisions ─────────────────────────── */

export type RefreshSignals = {
  /** open position (money), ACTIVE universe, or a plain CANDIDATE. */
  tier: "held" | "active" | "candidate";
  /** a human is watching it (StockWatch) — keeps it in the sweep even if quiet-and-new. */
  watched: boolean;
  hasDossier: boolean;
  dossierAgeDays: number | null;
  /** |price move since the dossier's day|, in bps; null when not computable. */
  driftBps: number | null;
  earnings: boolean; // reports soon, or reported since the last dossier
  news: boolean; // a triaged headline ≥ relevance floor filed since the dossier
  insiderCluster: boolean; // ≥ N distinct open-market buyers since the dossier
  crowdSpike: boolean; // social buzz ≥ floor
};

/** Should this tracked name be re-dossiered by the weekly sweep? Pure. */
export function decideRefresh(s: RefreshSignals, R = REFRESH): { refresh: boolean; reason: string } {
  const prioritized = s.tier === "held" || s.tier === "active";

  if (!s.hasDossier) {
    // D46: an un-dossiered name only gets a blind dossier if we already care about it;
    // otherwise it waits for someone to open it (on-demand research).
    return prioritized || s.watched
      ? { refresh: true, reason: "never researched · tracked" }
      : { refresh: false, reason: "never researched · unwatched (waits for on-demand)" };
  }

  const age = s.dossierAgeDays ?? 0;
  const floor = prioritized ? R.heldStaleMaxDays : R.staleMaxDays;
  if (age >= floor) return { refresh: true, reason: `stale · ${Math.round(age)}d old` };

  const driftFloor = prioritized ? R.heldDriftBps : R.driftBps;
  const reasons: string[] = [];
  if (s.driftBps != null && s.driftBps >= driftFloor) reasons.push(`moved ${(s.driftBps / 100).toFixed(1)}%`);
  if (s.earnings) reasons.push("earnings");
  if (s.news) reasons.push("news");
  if (s.insiderCluster) reasons.push("insider cluster");
  if (s.crowdSpike) reasons.push("crowd spike");

  return reasons.length
    ? { refresh: true, reason: reasons.join(" · ") }
    : { refresh: false, reason: `quiet · ${Math.round(age)}d old` };
}

export type PruneSignals = {
  status: "CANDIDATE" | "ACTIVE" | "RETIRED";
  watched: boolean; // a human watches it
  hasDirective: boolean; // a member pinned or blocked it — human intent, keep
  hasDossier: boolean;
  dossierAgeDays: number | null;
  addedAgeDays: number;
  stanceIsBuy: boolean; // latest dossier's call is a genuine buy — keep, it deserves a look
};

/** Should this CANDIDATE be retired from the pool? Pure. Only ever touches CANDIDATEs. */
export function decidePrune(p: PruneSignals, R = REFRESH): { retire: boolean; reason: string } {
  if (p.status !== "CANDIDATE") return { retire: false, reason: "not a candidate" };
  if (p.watched) return { retire: false, reason: "watched by a member" };
  if (p.hasDirective) return { retire: false, reason: "member directive" };
  if (p.stanceIsBuy) return { retire: false, reason: "buy-rated — deserves a look" };

  if (!p.hasDossier) {
    return p.addedAgeDays >= R.demoteUnopenedDays
      ? { retire: true, reason: `never opened · added ${Math.round(p.addedAgeDays)}d ago` }
      : { retire: false, reason: "new lead" };
  }
  return (p.dossierAgeDays ?? 0) >= R.demoteStaleDays
    ? { retire: true, reason: `stale ${Math.round(p.dossierAgeDays ?? 0)}d · unwatched · not buy-rated` }
    : { retire: false, reason: "recently dossiered" };
}

/* ─────────────────────────── the read-only plan ─────────────────────────── */

export type CurationPlan = {
  queue: { symbol: string; reason: string }[]; // to re-dossier
  skip: { symbol: string; reason: string }[]; // material-check said no
  retire: { symbol: string; reason: string }[]; // candidates to retire
  keptCandidates: number;
  total: number;
};

type DossierInfo = { at: Date; stance: string | null };

/** Build every signal the gate + prune need, in ~8 batched queries (independent of pool
 *  size), then run both pure decisions over the tracked roster. NO writes. */
export async function planWeeklyCuration(): Promise<CurationPlan> {
  const roster = await trackedUniverse(); // ACTIVE + CANDIDATE (never RETIRED)
  const now = Date.now();
  const lookback = new Date(now - 40 * DAY_MS);

  const [dossierRows, members, positions, watches, directives, quotes, bars, news, insiders, social] = await Promise.all([
    prisma.journalEntry.findMany({
      where: { kind: "RESEARCH", title: { startsWith: "Dossier" }, symbol: { not: null } },
      orderBy: { at: "desc" },
      select: { symbol: true, at: true, stance: true },
    }),
    prisma.universeMember.findMany({ select: { symbol: true, addedAt: true } }),
    prisma.position.findMany({ select: { symbol: true } }),
    prisma.stockWatch.findMany({ select: { symbol: true } }),
    prisma.symbolDirective.findMany({ select: { symbol: true } }),
    prisma.quote.findMany({ select: { symbol: true, midCents: true } }),
    prisma.bar.findMany({ where: { date: { gte: lookback } }, orderBy: { date: "asc" }, select: { symbol: true, date: true, closeCents: true } }),
    prisma.newsArticle.findMany({
      where: { triagedAt: { not: null }, relevance: { gte: REFRESH.newsRelevanceMin }, publishedAt: { gte: lookback } },
      select: { symbol: true, symbolsJson: true, publishedAt: true },
    }),
    prisma.insiderTrade.findMany({
      where: { side: "BUY", txnType: { startsWith: "P" }, txnDate: { gte: lookback } },
      select: { symbol: true, insiderName: true, txnDate: true },
    }),
    prisma.socialDaily.findMany({
      where: { fetchedAt: { gte: new Date(now - 4 * DAY_MS) }, buzz: { gte: REFRESH.crowdBuzzMin } },
      select: { symbol: true },
    }),
  ]);

  // latest dossier per symbol (rows arrive newest-first)
  const dossier = new Map<string, DossierInfo>();
  for (const d of dossierRows) {
    const k = (d.symbol ?? "").toUpperCase();
    if (k && !dossier.has(k)) dossier.set(k, { at: d.at, stance: d.stance });
  }

  const addedAt = new Map(members.map((m) => [m.symbol.toUpperCase(), m.addedAt.getTime()]));
  const held = new Set(positions.map((p) => p.symbol.toUpperCase()));
  const watched = new Set(watches.map((w) => w.symbol.toUpperCase()));
  const directed = new Set(directives.map((d) => d.symbol.toUpperCase()));
  const mid = new Map(quotes.map((q) => [q.symbol.toUpperCase(), q.midCents]));

  // per-symbol close series (ascending) for drift
  const closes = new Map<string, { date: Date; c: number }[]>();
  for (const b of bars) {
    const k = b.symbol.toUpperCase();
    (closes.get(k) ?? closes.set(k, []).get(k)!).push({ date: b.date, c: b.closeCents });
  }

  // latest relevant-news timestamp per bare ticker
  const newsAt = new Map<string, number>();
  for (const a of news) {
    const keys = new Set<string>();
    if (a.symbol) keys.add(bare(a.symbol));
    try {
      for (const t of (JSON.parse(a.symbolsJson ?? "[]") as string[]) ?? []) keys.add(bare(t));
    } catch {
      /* ignore malformed tags */
    }
    for (const k of keys) newsAt.set(k, Math.max(newsAt.get(k) ?? 0, a.publishedAt.getTime()));
  }

  // per-bare-ticker: distinct open-market buyers keyed to their trade dates
  const insiderBuyers = new Map<string, { name: string; at: number }[]>();
  for (const t of insiders) {
    const k = bare(t.symbol);
    (insiderBuyers.get(k) ?? insiderBuyers.set(k, []).get(k)!).push({ name: t.insiderName, at: t.txnDate.getTime() });
  }
  const crowd = new Set(social.map((s) => bare(s.symbol)));

  // earnings window: one FMP call spanning a short lookback (reported-since) + the forward
  // window. A name is earnings-material if a report falls in [dossierAt, today+window].
  const earningsBy = new Map<string, number[]>(); // bare ticker → report epoch(s)
  if (fmpEnabled()) {
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const from = fmt(new Date(now - 21 * DAY_MS));
    const to = fmt(new Date(now + REFRESH.earningsWindowDays * DAY_MS));
    try {
      const cal = await fmpEarningsCalendar(from, to);
      for (const row of cal) {
        const k = bare(row.symbol);
        const when = row.date ? new Date(row.date + "T00:00:00Z").getTime() : NaN;
        if (!Number.isNaN(when)) (earningsBy.get(k) ?? earningsBy.set(k, []).get(k)!).push(when);
      }
    } catch {
      /* no earnings signal this run — the other signals + staleness floor still apply */
    }
  }

  const plan: CurationPlan = { queue: [], skip: [], retire: [], keptCandidates: 0, total: roster.length };

  for (const row of roster) {
    const U = row.symbol.toUpperCase();
    const B = bare(row.symbol);
    const dos = dossier.get(U) ?? null;
    const dossierAgeDays = dos ? (now - dos.at.getTime()) / DAY_MS : null;
    const isHeld = held.has(U);
    const isActive = row.status === "ACTIVE";
    const isWatched = watched.has(U);

    // ── prune first: a retired candidate never reaches the gate ──
    const prune = decidePrune({
      status: row.status,
      watched: isWatched,
      hasDirective: directed.has(U),
      hasDossier: !!dos,
      dossierAgeDays,
      addedAgeDays: (now - (addedAt.get(U) ?? now)) / DAY_MS,
      stanceIsBuy: !!dos && (SELF_INVEST.allowedStances as readonly string[]).includes(dos.stance ?? ""),
    });
    if (prune.retire) {
      plan.retire.push({ symbol: row.symbol, reason: prune.reason });
      continue;
    }
    if (row.status === "CANDIDATE") plan.keptCandidates++;

    // ── the gate ──
    const driftBps = computeDrift(closes.get(U), dos?.at ?? null, mid.get(U) ?? null);
    const dosAt = dos?.at.getTime() ?? 0;
    const decision = decideRefresh({
      tier: isHeld ? "held" : isActive ? "active" : "candidate",
      watched: isWatched,
      hasDossier: !!dos,
      dossierAgeDays,
      driftBps,
      earnings: (earningsBy.get(B) ?? []).some((t) => t >= (dos ? dosAt : now - REFRESH.earningsWindowDays * DAY_MS) && t <= now + REFRESH.earningsWindowDays * DAY_MS),
      news: (newsAt.get(B) ?? 0) > dosAt,
      insiderCluster: distinctBuyersSince(insiderBuyers.get(B), dosAt) >= REFRESH.insiderClusterMin,
      crowdSpike: crowd.has(B),
    });
    (decision.refresh ? plan.queue : plan.skip).push({ symbol: row.symbol, reason: decision.reason });
  }

  return plan;
}

function computeDrift(series: { date: Date; c: number }[] | undefined, dossierAt: Date | null, latestMid: number | null): number | null {
  if (!series || series.length === 0 || !dossierAt) return null;
  // close on or before the dossier day
  let base: number | null = null;
  for (const p of series) {
    if (p.date.getTime() <= dossierAt.getTime() + DAY_MS) base = p.c;
    else break;
  }
  const latest = latestMid ?? series[series.length - 1].c;
  if (!base || base <= 0 || !latest) return null;
  return Math.round((Math.abs(latest - base) / base) * 10000);
}

function distinctBuyersSince(buyers: { name: string; at: number }[] | undefined, sinceMs: number): number {
  if (!buyers) return 0;
  return new Set(buyers.filter((b) => b.at >= sinceMs).map((b) => b.name)).size;
}

/* ─────────────────────────── apply the plan (writes) ─────────────────────────── */

export type CurationResult = { queued: number; skipped: number; retired: number };

/** Retire the pruned candidates and queue the material refreshes. Skips anything already
 *  in flight. Writes one SYSTEM journal summary for the prune batch. */
export async function applyCuration(plan: CurationPlan): Promise<CurationResult> {
  const inFlight = new Set(
    (await prisma.researchRequest.findMany({ where: { status: { in: ["QUEUED", "RUNNING"] } }, select: { symbol: true } })).map((r) => r.symbol),
  );

  let retired = 0;
  for (const r of plan.retire) {
    // Re-check status at write time — guard against a race where a member promoted or a
    // hunt touched the name between plan and apply.
    const m = await prisma.universeMember.findUnique({ where: { symbol: r.symbol }, select: { status: true } });
    if (!m || m.status !== "CANDIDATE") continue;
    await prisma.universeMember.update({ where: { symbol: r.symbol }, data: { status: "RETIRED", note: `auto-retired: ${r.reason}` } });
    retired++;
  }
  if (retired > 0) {
    invalidateUniverseCache();
    await prisma.journalEntry.create({
      data: {
        kind: "SYSTEM",
        title: `Pool curation — ${retired} candidate${retired === 1 ? "" : "s"} retired`,
        body: `Auto-retired ${retired} stale/unwatched candidate${retired === 1 ? "" : "s"} to keep the research pool lean (policy REFRESH). Reversible — the hunt resurfaces a name, or opening its page re-adds it.\n\n${plan.retire.map((r) => `• ${r.symbol} — ${r.reason}`).join("\n")}`,
        agentVersion: AGENT_VERSION,
      },
    });
  }

  let queued = 0;
  for (const q of plan.queue) {
    if (inFlight.has(q.symbol)) continue;
    await prisma.researchRequest.create({ data: { symbol: q.symbol, requestedBy: "weekly-refresh" } });
    queued++;
  }

  return { queued, skipped: plan.skip.length, retired };
}
