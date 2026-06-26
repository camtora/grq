// Agent self-investing (D30) — the agent promotes a CANDIDATE it has researched
// and has conviction on into the tradeable universe, bounded by deterministic
// rules. This sits alongside the human promotion path, which is ALSO single-actor
// (D78) — same liquidity screen, no second approver. The §6 order gate and the
// block/demote/kill overrides always still apply on top. Every promotion fires a
// distinct Discord so the members see each autonomous add and can veto it.

import { prisma } from "../lib/db";
import { universeEntry, activeUniverse, invalidateUniverseCache, isTradeable, bareTicker, CANDIDATE_CAP } from "../lib/universe";
import { promotionScreen } from "../lib/screen";
import { probeYahooSymbol } from "../lib/broker/yahoo";
import { refreshQuotesFor } from "../lib/broker/quotes";
import { refreshBars } from "../lib/bars";
import { stanceMeta } from "../lib/stance";
import { SELF_INVEST, AGENT_VERSION } from "./policy";
import { notifyOut } from "./alerts";

export type PromoteResult = { ok: boolean; tier?: string; reason?: string };
export type CandidateResult = { ok: boolean; symbol?: string; reason?: string };

// The runner opens a "bootstrap window" for the one-time startup universe review
// (Cam 2026-06-17): inside it the per-week self-promotion cap is lifted so the agent
// can rebuild a freshly-demoted watchlist in one pass. Every QUALITY gate (conviction,
// liquidity screen, CAD/USD-tradeable, not-blocked) and the hard universe-size cap STILL
// apply — only the anti-churn weekly cap is relaxed.
let bootstrapMode = false;
export function setBootstrapMode(on: boolean): void {
  bootstrapMode = on;
}

// A full dossier older than this counts as STALE — a tracked name should get a fresh
// pass rather than the agent waiting forever on / grounding on an aged read.
const DOSSIER_STALE_DAYS = 5;

/** Ensure a CURRENT full dossier (the runStockDossier pipeline → "Dossier —" entry) is
 *  on the way for a tracked name. Returns what it found: "inflight" (one already queued
 *  or running), "current" (a fresh "Dossier —" entry exists), or "queued" (none or stale
 *  → queued a fresh ResearchRequest). Closes the 2026-06-25 gap where a name already a
 *  CANDIDATE with only a stale/inline note never got a fresh dossier — the agent then
 *  reported "dossier not landed" every check-in, waiting on a job nobody queued. */
async function ensureDossierQueued(key: string): Promise<"inflight" | "current" | "queued"> {
  const pending = await prisma.researchRequest.count({ where: { symbol: key, status: { in: ["QUEUED", "RUNNING"] } } });
  if (pending > 0) return "inflight";
  const latest = await prisma.journalEntry.findFirst({
    where: { kind: "RESEARCH", symbol: key, title: { startsWith: "Dossier" } },
    orderBy: { at: "desc" },
    select: { at: true },
  });
  const fresh = latest ? Date.now() - latest.at.getTime() < DOSSIER_STALE_DAYS * 86_400_000 : false;
  if (fresh) return "current";
  await prisma.researchRequest.create({ data: { symbol: key, requestedBy: "agent" } });
  return "queued";
}

/** Track a researched name (e.g. a discovery-hunt find) as a CANDIDATE — the step
 *  BEFORE self-promotion. Resolves the listing (CAD listings first), pulls a year
 *  of bars so the liquidity screen can run later, queues a fresh dossier if none is
 *  current, and alerts the members. Mirrors the human "watch" action, attributed to
 *  the agent. */
export async function addCandidate(symbol: string, reason: string, name?: string): Promise<CandidateResult> {
  const key = bareTicker(symbol);

  const existing = await universeEntry(key);
  if (existing && existing.status !== "RETIRED") {
    // Already tracked — don't re-add, but make sure a CURRENT dossier is actually on
    // the way (the old early-bail left a candidate with a stale/inline note waiting on
    // a dossier nobody queued; 2026-06-25 fix).
    const d = await ensureDossierQueued(key);
    const tail =
      d === "queued"
        ? ` — its dossier was missing or stale, so I queued a FRESH one. Decide once it lands (add_agenda / schedule_checkin to come back).`
        : d === "inflight"
          ? ` — a fresh dossier is already queued/running; it'll land shortly.`
          : ` — its dossier is current.`;
    return { ok: false, reason: `${key} is already tracked (${existing.status})${tail}` };
  }

  const candidates = await prisma.universeMember.count({ where: { status: "CANDIDATE" } });
  if (candidates >= CANDIDATE_CAP) return { ok: false, reason: `candidate cap reached (${CANDIDATE_CAP}) — retire something first.` };

  // Resolve the listing — hunt finds are TSX/TSXV, so try CAD listings first.
  const tries = symbol.includes(".") ? [symbol.toUpperCase()] : [`${key}.TO`, `${key}.V`, key];
  let resolved: { yahoo: string; priceCents: number; name: string | null } | null = null;
  for (const y of tries) {
    const p = await probeYahooSymbol(y).catch(() => null);
    if (p) {
      resolved = { yahoo: y, ...p };
      break;
    }
  }
  if (!resolved) return { ok: false, reason: `couldn't find a live quote for ${key} (tried ${tries.join(", ")}).` };
  const currency = /\.(TO|V|NE|CN)$/i.test(resolved.yahoo) ? "CAD" : null;

  if (existing) {
    await prisma.universeMember.update({ where: { symbol: key }, data: { status: "CANDIDATE", addedBy: "agent" } });
  } else {
    await prisma.universeMember.create({
      data: { symbol: key, yahoo: resolved.yahoo, name: name ?? resolved.name ?? key, status: "CANDIDATE", addedBy: "agent", currency, note: reason.slice(0, 200) },
    });
  }
  invalidateUniverseCache();
  await refreshQuotesFor([key]).catch(() => 0);
  await refreshBars([key], "1y").catch(() => 0); // bars now exist for the screen
  await ensureDossierQueued(key); // queue a fresh dossier unless one is current or already inflight
  await prisma.journalEntry.create({
    data: {
      kind: "DECISION",
      symbol: key,
      title: `Tracking — ${key}`,
      body: `Agent is now tracking **${key}** (${name ?? resolved.name ?? ""}) as a research CANDIDATE — not tradeable yet. ${reason}`,
      agentVersion: AGENT_VERSION,
    },
  });
  await notifyOut("info", `🤖 GRQ is tracking ${key}`, `Added as a research candidate. ${reason.slice(0, 160)}`, { category: "agentMoves", symbol: key });
  return { ok: true, symbol: key };
}

/** Promote a researched candidate to ACTIVE if (and only if) every rule passes.
 *  Returns a reject reason (never throws) so the calling tool can hand it back to
 *  the model verbatim — like the order gate, rejections are final and explained. */
export async function agentSelfPromote(symbol: string, tier: "large" | "mid" | undefined, reason: string): Promise<PromoteResult> {
  const sym = symbol.toUpperCase();

  if (!SELF_INVEST.enabled) return { ok: false, reason: "self-investing is disabled (GRQ_AGENT_SELF_PROMOTE=false)." };

  const entry = await universeEntry(sym);
  if (!entry) return { ok: false, reason: `${sym} isn't tracked yet — it must be a researched CANDIDATE before you can promote it.` };
  if (entry.status === "ACTIVE") return { ok: false, reason: `${sym} is already in the tradeable universe.` };
  if (entry.status === "RETIRED") return { ok: false, reason: `${sym} is RETIRED — the members stopped researching it; you can't promote it.` };

  // Members' no-fly veto persists.
  const directive = await prisma.symbolDirective.findUnique({ where: { symbol: sym } });
  if (directive?.directive === "BLOCKED") return { ok: false, reason: `${sym} is BLOCKED (no-fly) by ${directive.by} — the members' veto stands.` };

  // Tradeable currency only — the fund holds CAD + USD (D34); other currencies stay research-only.
  if (!isTradeable(entry.currency, entry.yahoo)) {
    return { ok: false, reason: `${sym} is ${entry.currency ?? "a non-CAD/USD"} listing — the fund trades CAD and USD only; not promotable.` };
  }

  // Conviction: your latest dossier call must be a genuine buy at ≥ the gate's bar.
  const dossier = await prisma.journalEntry.findFirst({ where: { symbol: sym, stance: { not: null } }, orderBy: { at: "desc" } });
  const m = stanceMeta(dossier?.stance);
  if (!m || !(SELF_INVEST.allowedStances as readonly string[]).includes(m.label)) {
    return { ok: false, reason: `your latest call on ${sym} is "${m?.label ?? "none yet"}" — only promote names you rate ${SELF_INVEST.allowedStances.join(" or ")}. Dossier it first.` };
  }
  if ((dossier?.confidence ?? 0) < SELF_INVEST.minConfidence) {
    return { ok: false, reason: `conviction on ${sym} is ${dossier?.confidence ?? 0}% — need ≥${SELF_INVEST.minConfidence}% to self-promote.` };
  }

  // Freshness: that conviction must come from a COMPLETED research-pipeline pass — not a
  // dossier the agent wrote inline in this same session. A thin, un-cross-checked inline
  // note can carry a data error straight into the conviction bar (L's BoC-CPI sign-flip
  // turned a standing 62 HOLD into a 77 Buy and self-promoted it on bad data; D49).
  // Pipeline dossiers are written by runStockDossier with a DONE researchRequest
  // completing alongside them; an inline note has none. No backing pass → queue one and
  // defer, and the agent comes back to promote once the real dossier lands (the persona's
  // own "add_candidate now, schedule_checkin to decide with the finished dossier" pattern).
  const key = bareTicker(sym);
  const backed = dossier
    ? await prisma.researchRequest.findFirst({
        where: { symbol: key, status: "DONE", completedAt: { gte: new Date(dossier.at.getTime() - 5 * 60_000) } },
      })
    : null;
  if (!backed) {
    const inflight = await prisma.researchRequest.count({ where: { symbol: key, status: { in: ["QUEUED", "RUNNING"] } } });
    if (inflight === 0) await prisma.researchRequest.create({ data: { symbol: key, requestedBy: "agent" } });
    return { ok: false, reason: `your latest call on ${sym} is an inline note, not a finished research pass — I've queued a full dossier. Promote it once that lands (schedule_checkin to come back and decide with it in front of you).` };
  }

  // Deterministic liquidity screen — the SAME bar the human path uses.
  const failures = await promotionScreen(sym);
  if (failures.length > 0) return { ok: false, reason: `liquidity screen failed: ${failures.join("; ")}.` };

  // Anti-runaway: rolling-weekly cap (lifted during the startup bootstrap) + total universe size.
  if (!bootstrapMode) {
    const weekAgo = new Date(Date.now() - 7 * 86_400_000);
    const recent = await prisma.journalEntry.count({ where: { title: { startsWith: "Self-promoted —" }, at: { gte: weekAgo } } });
    if (recent >= SELF_INVEST.maxPerRollingWeek) {
      return { ok: false, reason: `weekly self-promotion cap reached (${recent}/${SELF_INVEST.maxPerRollingWeek} in the last 7 days) — let these prove out first.` };
    }
  }
  const activeCount = (await activeUniverse()).length;
  if (activeCount >= SELF_INVEST.maxUniverseSize) {
    return { ok: false, reason: `the universe is at its ${SELF_INVEST.maxUniverseSize}-name cap — demote something before adding more.` };
  }

  // All rules clear — promote.
  const finalTier = tier && (SELF_INVEST.promotableTiers as readonly string[]).includes(tier) ? tier : "mid";
  await prisma.universeMember.update({
    where: { symbol: sym },
    data: { status: "ACTIVE", tier: finalTier, promotionRequestedBy: null, promotionRequestedAt: null, proposedTier: null },
  });
  invalidateUniverseCache();
  await prisma.journalEntry.create({
    data: {
      kind: "DECISION",
      symbol: sym,
      title: `Self-promoted — ${sym}`,
      body: `Agent promoted **${sym}** (${entry.name}) into the tradeable universe as a *${finalTier}* name — self-invested. Conviction: ${m.label} @ ${dossier?.confidence}%. Liquidity screen passed (≥$2 · ADV ≥100k · ≥30 bars). The §6 order gate, position caps, and the members' block/demote/kill all still apply.\n\n**Why:** ${reason}`,
      agentVersion: AGENT_VERSION,
    },
  });
  await notifyOut("info", `🤖 GRQ self-promoted ${sym} (${finalTier})`, `${m.label} @ ${dossier?.confidence}% · screen passed. ${reason.slice(0, 240)}`, { category: "agentMoves", symbol: sym });
  return { ok: true, tier: finalTier };
}
