// Agent self-demotion (D126, Cam 2026-09-22) — the missing counterpart to promote.
//
// The agent could promote (CANDIDATE → ACTIVE) at up to 25/rolling week but had no way
// to give a slot back: ACTIVE → CANDIDATE was humans-only, and the D112 prune only ever
// touches CANDIDATEs. So the universe filled at 25/wk and drained at 0/wk, hit the
// 60-name cap around 2026-08-24, and stayed jammed for a month — with 45 of the 60 slots
// held by names the fund didn't even own. Selling out of a name never freed its slot, so
// the agent would sell to fund a rotation and find the door still shut (GEHC → AMZN,
// 2026-09-22). This module lets it hand back a slot it isn't using.
//
// What it is NOT: the agent never RETIRES (CANDIDATE → RETIRED stays humans-only — a
// demoted name stays researched and one click from coming back), never demotes a name a
// human staked a claim to, and never touches the §6 order gate. A demotion only removes
// BUY eligibility; an existing position is untouched and exits are never trapped, exactly
// as on the human path. Every demotion is journaled + Discord'd, and either member can
// undo one with the Promote button.
//
// decideDemote is PURE (unit-tested in test/demote.test.ts) so the eligibility rules
// can't drift silently; agentSelfDemote gathers the signals and does the write.

import { prisma } from "../lib/db";
import { universeEntry, activeUniverse, invalidateUniverseCache, BENCHMARK } from "../lib/universe";
import { personByName } from "../lib/people";
import { SELF_INVEST, AGENT_VERSION } from "./policy";
import { notifyOut } from "./alerts";

export type DemoteResult = { ok: boolean; reason?: string };

/** Everything the eligibility decision needs, as plain data. */
export type DemoteSignals = {
  status: "CANDIDATE" | "ACTIVE" | "RETIRED";
  isBenchmark: boolean;
  /** addedBy resolves to an actual member (Cam/Graham). Seed, hunt finds and the
   *  agent's own adds do NOT — Cam's call 2026-09-22: the seed library was a bootstrap
   *  list, not a standing endorsement, so the agent may reclaim those slots. */
  humanAdded: boolean;
  /** StockWatch rows. Watches are humans-only (D78), so any watcher = hands off. */
  watchers: number;
  /** A member's PINNED directive — an explicit "keep this". */
  pinned: boolean;
  /** Open position size. A held name is not a dead slot. */
  heldQty: number;
  /** Agent demotions in the last 7 days (anti-churn). */
  recentDemotes: number;
};

/** Pure: may the agent hand this slot back? Rejections explain which rule fired, in the
 *  same voice as the order gate — the model reads the reason verbatim. */
export function decideDemote(s: DemoteSignals, P = SELF_INVEST): { demote: boolean; reason: string } {
  if (s.status !== "ACTIVE") {
    return { demote: false, reason: `it is ${s.status}, not ACTIVE — only tradeable names get demoted.` };
  }
  if (s.isBenchmark) {
    return { demote: false, reason: `${BENCHMARK} is the fund's benchmark — it stays in the universe.` };
  }
  // ── the human-claim guards: anything a member put here or is tracking is theirs ──
  if (s.pinned) {
    return { demote: false, reason: "a member PINNED it — that's an explicit keep, and their directive stands." };
  }
  if (s.humanAdded) {
    return { demote: false, reason: "a member added this name — only they can demote it. Say so in your check-in if you think it should go." };
  }
  if (s.watchers > 0) {
    return {
      demote: false,
      reason: `${s.watchers} member${s.watchers === 1 ? " is" : "s are"} watching it — hands off. Make the case in your check-in instead.`,
    };
  }
  // ── the "is this actually a dead slot" guard ──
  if (s.heldQty > 0) {
    return {
      demote: false,
      reason: `the fund holds ${s.heldQty} share${s.heldQty === 1 ? "" : "s"} — a held name isn't a spare slot. Exit the position first, then demote it.`,
    };
  }
  // ── anti-churn ──
  if (s.recentDemotes >= P.maxDemotesPerRollingWeek) {
    return {
      demote: false,
      reason: `weekly demotion cap reached (${s.recentDemotes}/${P.maxDemotesPerRollingWeek} in the last 7 days) — let this week's reshuffle settle.`,
    };
  }
  return { demote: true, reason: "unheld, unwatched, agent-added — a dead slot." };
}

/** How many ACTIVE names the agent could hand back RIGHT NOW, and which ones.
 *  Used by the promote rejection and the decision context so the agent never has to
 *  GUESS whether the cap is movable — on 2026-09-22 it demoted two names, was still
 *  over the cap, assumed the rest were protected (35 were not), and told the members
 *  the wall was theirs to open. An uninformative rejection produced a false story. */
export async function demotableSlots(): Promise<{ count: number; symbols: string[]; demotesLeft: number; activeCount: number }> {
  const [active, watches, positions, directives, recentDemotes] = await Promise.all([
    activeUniverse(),
    prisma.stockWatch.findMany({ select: { symbol: true } }),
    prisma.position.findMany({ select: { symbol: true, qty: true } }),
    prisma.symbolDirective.findMany({ select: { symbol: true, directive: true } }),
    prisma.journalEntry.count({
      where: { title: { startsWith: "Self-demoted —" }, at: { gte: new Date(Date.now() - 7 * 86_400_000) } },
    }),
  ]);
  const watched = new Set(watches.map((w) => w.symbol));
  const qty = new Map(positions.map((p) => [p.symbol, p.qty]));
  const pinned = new Set(directives.filter((d) => d.directive === "PINNED").map((d) => d.symbol));

  const symbols = active
    .filter(
      (r) =>
        decideDemote({
          status: r.status,
          isBenchmark: r.symbol === BENCHMARK,
          humanAdded: personByName(r.addedBy) != null,
          watchers: watched.has(r.symbol) ? 1 : 0,
          pinned: pinned.has(r.symbol),
          heldQty: qty.get(r.symbol) ?? 0,
          recentDemotes: 0, // the weekly budget is reported separately, not an eligibility fact
        }).demote,
    )
    .map((r) => r.symbol);

  return {
    count: symbols.length,
    symbols,
    demotesLeft: Math.max(0, SELF_INVEST.maxDemotesPerRollingWeek - recentDemotes),
    activeCount: active.length,
  };
}

/** PURE: the message a promote gets when the universe is at/over its cap. It MUST state
 *  how many slots are needed and whether the agent can free them itself — the 2026-09-22
 *  failure was a rejection that said only "at its cap — demote something", after which the
 *  agent freed two, was still over, and invented the conclusion that the rest were
 *  protected and the wall was member-gated. 35 were reclaimable. Unit-tested. */
export function capRejectionReason(
  activeCount: number,
  spareCount: number,
  spareSymbols: string[],
  demotesLeft: number,
  P = SELF_INVEST,
): string {
  const need = activeCount - P.maxUniverseSize + 1;
  const budget = Math.min(spareCount, demotesLeft);
  const tail =
    budget >= need
      ? `You can clear this yourself RIGHT NOW: demote_from_universe ${need} of these ${spareCount} spare name${spareCount === 1 ? "" : "s"} — ${spareSymbols.slice(0, 12).join(", ")}${spareSymbols.length > 12 ? ", …" : ""} — then promote again. Do NOT conclude this is member-gated; it is not while that list can cover it.`
      : spareCount === 0
        ? "Every remaining ACTIVE name is held, watched, member-added or pinned, so you genuinely cannot clear this one — make the case to the members in your check-in."
        : `You can only free ${budget} right now (${spareCount} spare, ${demotesLeft} demotions left of ${P.maxDemotesPerRollingWeek}) and need ${need} — free what you can, then make the case to the members for the rest.`;
  return `the universe is ${activeCount}/${P.maxUniverseSize} — you must free ${need} slot${need === 1 ? "" : "s"} before a promote fits. ${tail}`;
}

/** Demote an ACTIVE name back to CANDIDATE if (and only if) every rule passes. Returns a
 *  reject reason (never throws) so the calling tool hands it back to the model verbatim. */
export async function agentSelfDemote(symbol: string, reason: string): Promise<DemoteResult> {
  const sym = symbol.toUpperCase();

  // One switch governs every autonomous change to universe membership, in both
  // directions — if the members have turned self-investing off, the agent's roster is
  // frozen until they turn it back on.
  if (!SELF_INVEST.enabled) return { ok: false, reason: "self-investing is disabled (GRQ_AGENT_SELF_PROMOTE=false)." };

  const entry = await universeEntry(sym);
  if (!entry) return { ok: false, reason: `${sym} isn't tracked — there's nothing to demote.` };

  const [watchers, position, directive, recentDemotes] = await Promise.all([
    prisma.stockWatch.count({ where: { symbol: entry.symbol } }),
    prisma.position.findUnique({ where: { symbol: entry.symbol } }),
    prisma.symbolDirective.findUnique({ where: { symbol: entry.symbol } }),
    prisma.journalEntry.count({
      where: { title: { startsWith: "Self-demoted —" }, at: { gte: new Date(Date.now() - 7 * 86_400_000) } },
    }),
  ]);

  const verdict = decideDemote({
    status: entry.status,
    isBenchmark: entry.symbol === BENCHMARK,
    humanAdded: personByName(entry.addedBy) != null,
    watchers,
    pinned: directive?.directive === "PINNED",
    heldQty: position?.qty ?? 0,
    recentDemotes,
  });
  if (!verdict.demote) return { ok: false, reason: verdict.reason };

  await prisma.universeMember.update({
    where: { symbol: entry.symbol },
    data: { status: "CANDIDATE", promotionRequestedBy: null, promotionRequestedAt: null, proposedTier: null },
  });
  invalidateUniverseCache();
  await prisma.journalEntry.create({
    data: {
      kind: "DECISION",
      symbol: entry.symbol,
      title: `Self-demoted — ${entry.symbol}`,
      body: `Agent demoted **${entry.symbol}** (${entry.name}) out of the tradeable universe, back to CANDIDATE — freeing a slot under the ${SELF_INVEST.maxUniverseSize}-name cap. It stays researched and either member can put it back with one click. No position was held, no member was watching it, and no member added it.\n\n**Why:** ${reason}`,
      agentVersion: AGENT_VERSION,
    },
  });
  await notifyOut(
    "info",
    `🤖 GRQ demoted ${entry.symbol} — slot freed`,
    `Back to CANDIDATE (unheld, unwatched). ${reason.slice(0, 240)}`,
    { category: "agentMoves", symbol: entry.symbol },
  );
  return { ok: true };
}
