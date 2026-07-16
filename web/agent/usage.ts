// Token accounting for every Agent-SDK call the fund makes — the AgentUsage row behind /admin/usage
// and the daily burn alarm on Cam's shared Claude Max quota.
//
// This lives in its OWN module, apart from sessions.ts, for one reason: sessions.ts imports tools.ts,
// which imports council.ts, so council.ts cannot import sessions.ts without closing a cycle. That is
// very likely why council.ts hand-rolled its own query() loop — and the cost of that copy was silence.
// Its six Opus passes per convene wrote no AgentUsage row at all, so the council was invisible in
// /admin/usage AND its tokens never counted toward the 40M/day milestone alarm below: the alarm that
// exists precisely because a runaway agent can drain the day's quota by 11am. Anything that spends
// tokens imports THIS, and shows up.

import { prisma } from "../lib/db";
import { AGENT_VERSION } from "./policy";
import { startOfEtDay, etDateStr } from "./calendar";
import { alert } from "./alerts";

// Notify BOTH members when the day's cumulative agent token burn crosses 40M, then every 10M above
// (50M, 60M…) — a budget-watch alarm on the shared Claude Max quota (a normal day is ~30M). Fires
// once per (day, threshold) via a SYSTEM journal marker, so restarts/retries never re-alert. Discord
// always; iOS push to whoever has the "system" category on. Best-effort — never throws into a session.
const TOKEN_MILESTONE_STEP = 10_000_000; // every 10M
const TOKEN_MILESTONE_FLOOR = 40_000_000; // start at 40M/day

export async function checkTokenMilestones(): Promise<void> {
  try {
    const dayStart = startOfEtDay(new Date());
    const agg = await prisma.agentUsage.aggregate({
      where: { at: { gte: dayStart } },
      _sum: { inputTokens: true, outputTokens: true, cacheCreationTokens: true, cacheReadTokens: true },
    });
    const total =
      (agg._sum.inputTokens ?? 0) + (agg._sum.outputTokens ?? 0) + (agg._sum.cacheCreationTokens ?? 0) + (agg._sum.cacheReadTokens ?? 0);
    if (total < TOKEN_MILESTONE_FLOOR) return;
    const M = (Math.floor(total / TOKEN_MILESTONE_STEP) * TOKEN_MILESTONE_STEP) / 1_000_000; // 47.3M → 40
    const day = etDateStr();
    const markerTitle = `Token milestone — ${M}M (${day})`;
    if ((await prisma.journalEntry.count({ where: { kind: "SYSTEM", title: markerTitle } })) > 0) return;
    await prisma.journalEntry.create({
      data: {
        kind: "SYSTEM",
        title: markerTitle,
        body: `The agent has used ${(total / 1e6).toFixed(1)}M tokens of the shared Claude Max quota today (${day}), crossing the ${M}M mark.`,
      },
    });
    await alert(
      "warning",
      `⚡ Token burn ${M}M today`,
      `The agent has used ${(total / 1e6).toFixed(1)}M tokens of Cam's shared Claude Max quota so far today — past the ${M}M mark. A normal day is ~30M. See /tokens.`,
      { category: "system" },
    );
  } catch (e) {
    console.error("[token-milestone] check failed:", e instanceof Error ? e.message : e);
  }
}

/** Persist per-call token/cost from the Agent-SDK result message (AgentUsage row), and log a rich
 *  one-liner to stdout. Tokens are SUMMED across modelUsage so subagent fan-out + any triage model the
 *  session spawned are all counted (a startup scan fans out to ~12 subagents — the single biggest token
 *  sink); falls back to the aggregate `usage` shape. Cost may be 0 on a Max/OAuth token that doesn't
 *  meter cost, so token counts are the real signal. Never throws into the caller — logging must not
 *  break a trading session. */
export async function recordAgentUsage(label: string, model: string, rm: any, result: string | null): Promise<void> {
  let inT = 0, outT = 0, ccT = 0, crT = 0, cost = 0;
  const mu = rm?.modelUsage && typeof rm.modelUsage === "object" ? rm.modelUsage : null;
  if (mu && Object.keys(mu).length) {
    for (const k of Object.keys(mu)) {
      const e = mu[k] || {};
      inT += e.inputTokens || 0;
      outT += e.outputTokens || 0;
      ccT += e.cacheCreationInputTokens || 0;
      crT += e.cacheReadInputTokens || 0;
      cost += e.costUSD || 0;
    }
  } else if (rm?.usage) {
    const u = rm.usage;
    inT = u.input_tokens || u.inputTokens || 0;
    outT = u.output_tokens || u.outputTokens || 0;
    ccT = u.cache_creation_input_tokens || u.cacheCreationInputTokens || 0;
    crT = u.cache_read_input_tokens || u.cacheReadInputTokens || 0;
  }
  if (!cost && typeof rm?.total_cost_usd === "number") cost = rm.total_cost_usd;
  const turns = rm?.num_turns || 0;
  console.log(
    `[session] ${label} done — ${result ? result.length : 0} chars · ${turns} turns · ` +
      `in ${inT} out ${outT} cacheW ${ccT} cacheR ${crT} (total ${inT + outT + ccT + crT}) · ~$${cost.toFixed(2)}`,
  );
  try {
    await prisma.agentUsage.create({
      data: {
        label,
        model,
        status: rm?.subtype || (result ? "success" : "unknown"),
        numTurns: turns,
        durationMs: rm?.duration_ms || 0,
        inputTokens: inT,
        outputTokens: outT,
        cacheCreationTokens: ccT,
        cacheReadTokens: crT,
        costMicroUsd: Math.round(cost * 1e6),
        modelUsageJson: mu ? JSON.stringify(mu) : null,
        agentVersion: AGENT_VERSION,
      },
    });
  } catch (e) {
    console.error(`[usage-log] failed for ${label}:`, e instanceof Error ? e.message : e);
  }
  await checkTokenMilestones();
}
