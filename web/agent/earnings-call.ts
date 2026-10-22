// Earnings-call summaries (D140 F8) — the Claude half. One Haiku pass per new call, for ACTIVE + held +
// watched + focus names only, from the transcript ALONE (lib/financials/call-summary.ts says why that
// matters: users may read these). Runs after the daily financials refresh has listed the calls.
// The transcript is fetched for the pass and never stored (§4.5).

import { prisma } from "../lib/db";
import { runSession } from "./sessions";
import { MODELS } from "./policy";
import { limitQuietActive } from "./limit-quiet";
import { fetchTranscript, financialsTargets } from "../lib/financials/store";
import { CALL_SUMMARY_SCHEMA, CALL_SUMMARY_SYSTEM, callSummaryPrompt, parseCallSummary } from "../lib/financials/call-summary";
import type { Prisma } from "@prisma/client";

const RECENT_DAYS = 120; // only the latest call matters for the panel; older ones are history
const MAX_ATTEMPTS = 3;
const TRANSCRIPT_CAP = 120_000; // chars — the longest calls run ~90k; anything past this is boilerplate

/** Summarize up to `max` unsummarized recent calls. Returns how many were written. */
export async function runCallSummaries(max = 12): Promise<{ written: number; failed: number }> {
  const deep = new Set((await financialsTargets()).filter((t) => t.deep).map((t) => t.key));
  if (deep.size === 0) return { written: 0, failed: 0 };
  const since = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString().slice(0, 10);
  const pending = await prisma.earningsCall.findMany({
    where: { summarizedAt: null, attempts: { lt: MAX_ATTEMPTS }, callDate: { gte: since }, symbol: { in: [...deep] } },
    orderBy: { callDate: "desc" },
    take: max,
  });

  let written = 0;
  let failed = 0;
  for (const c of pending) {
    if (await limitQuietActive()) break; // the shared token is walled — try again tomorrow, no attempt burned
    const t = await fetchTranscript(c.symbol, c.fiscalYear, c.fiscalQuarter);
    if (!t) {
      await prisma.earningsCall.update({ where: { id: c.id }, data: { attempts: { increment: 1 }, error: "no transcript from FMP" } });
      failed++;
      continue;
    }
    const st = await prisma.financialsStatus.findUnique({ where: { symbol: c.symbol }, select: { companyName: true } });
    const label = `fiscal ${c.fiscalYear} Q${c.fiscalQuarter}, held ${c.callDate}`;
    const transcript = t.content.slice(0, TRANSCRIPT_CAP);
    const out = await runSession({
      label: "earnings-call",
      model: MODELS.triage,
      withTools: false,
      maxTurns: 4, // structured output rides a synthetic tool call → 2 turns
      noThinking: true,
      systemPrompt: CALL_SUMMARY_SYSTEM,
      outputFormat: CALL_SUMMARY_SCHEMA,
      prompt: callSummaryPrompt(st?.companyName ?? c.symbol, label, transcript),
    });
    if (out == null && (await limitQuietActive())) break; // tripped mid-run: not this call's fault
    const summary = parseCallSummary(out, transcript);
    if (!summary) {
      await prisma.earningsCall.update({ where: { id: c.id }, data: { attempts: { increment: 1 }, error: out == null ? "no output" : "unparseable output" } });
      failed++;
      continue;
    }
    await prisma.earningsCall.update({
      where: { id: c.id },
      data: { summary: summary as unknown as Prisma.InputJsonValue, model: MODELS.triage, summarizedAt: new Date(), error: null, attempts: { increment: 1 } },
    });
    written++;
  }
  return { written, failed };
}
