// Agent self-investing (D30) — the agent promotes a CANDIDATE it has researched
// and has conviction on into the tradeable universe, bounded by deterministic
// rules. This is a NEW path that sits ALONGSIDE the human watchlist→universe
// promotion (two-person), which is unchanged. The §6 order gate and the
// block/demote/kill overrides always still apply on top. Every promotion fires a
// distinct Discord so the members see each autonomous add and can veto it.

import { prisma } from "../lib/db";
import { universeEntry, activeUniverse, invalidateUniverseCache, isCadTradeable } from "../lib/universe";
import { promotionScreen } from "../lib/screen";
import { stanceMeta } from "../lib/stance";
import { SELF_INVEST, AGENT_VERSION } from "./policy";
import { sendDiscord } from "./alerts";

export type PromoteResult = { ok: boolean; tier?: string; reason?: string };

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

  // CAD-tradeable only — US listings stay research-only until multi-currency.
  if (!isCadTradeable(entry.currency, entry.yahoo)) {
    return { ok: false, reason: `${sym} is ${entry.currency ?? "non-CAD"}-listed — research-only until multi-currency support; not promotable.` };
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

  // Deterministic liquidity screen — the SAME bar the human path uses.
  const failures = await promotionScreen(sym);
  if (failures.length > 0) return { ok: false, reason: `liquidity screen failed: ${failures.join("; ")}.` };

  // Anti-runaway: rolling-weekly cap + total universe size.
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const recent = await prisma.journalEntry.count({ where: { title: { startsWith: "Self-promoted —" }, at: { gte: weekAgo } } });
  if (recent >= SELF_INVEST.maxPerRollingWeek) {
    return { ok: false, reason: `weekly self-promotion cap reached (${recent}/${SELF_INVEST.maxPerRollingWeek} in the last 7 days) — let these prove out first.` };
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
  await sendDiscord("info", `🤖 GRQ self-promoted ${sym} (${finalTier})`, `${m.label} @ ${dossier?.confidence}% · screen passed. ${reason.slice(0, 240)}`);
  return { ok: true, tier: finalTier };
}
