import { prisma } from "./db";
import { getBroker } from "./broker";
import { getPortfolio } from "./portfolio";
import { toCadCents, usdCadRate } from "./fx";

// The FX-approval guardrail (D62). The agent can REQUEST a CAD→USD conversion
// (request_fx) to fund a US name it can't otherwise buy; a member APPROVES each one,
// and only then does money move (broker.convertCurrency). The member-set dials on
// Settings (fxMaxPerRequestCents / fxMaxPerWeekCents / usdAllocationCapPct) bound what
// can be approved — they bite HERE, at approval, not at request time. A member can also
// create one already-approved via manualConvert (the escape hatch). This module is the
// ONLY caller of broker.convertCurrency — the agent never touches it.

const MAX_PENDING = 8; // anti-runaway: cap simultaneous open requests

export type FxCreateResult = { ok: true; id: number; estCadCents: number } | { ok: false; reason: string };
export type FxExecuteResult =
  | { ok: true; id: number; cadDebitedCents: number; usdCreditedCents: number; rate: number }
  | { ok: false; reason: string };

async function estCadForUsd(amountUsdCents: number, fx: number | null): Promise<number> {
  const rate = fx ?? (await usdCadRate());
  return rate ? Math.round(amountUsdCents * rate) : amountUsdCents;
}

/** Agent-side: raise a PENDING CAD→USD request. Uncapped on amount (the agent may ask
 *  for anything — a member is the gate); deduped per symbol; bounded only by MAX_PENDING. */
export async function createFxRequest(args: {
  amountUsdCents: number;
  reason: string;
  symbol?: string | null;
  requestedBy?: string;
}): Promise<FxCreateResult> {
  const amountUsdCents = Math.round(args.amountUsdCents);
  if (!Number.isInteger(amountUsdCents) || amountUsdCents <= 0) return { ok: false, reason: "Amount must be a positive whole number of USD cents." };
  const symbol = args.symbol?.toUpperCase() ?? null;

  if (symbol) {
    const dup = await prisma.fxRequest.findFirst({ where: { status: "PENDING", symbol } });
    if (dup) return { ok: false, reason: `A conversion to fund ${symbol} is already pending a member's approval (request #${dup.id}).` };
  }
  const pending = await prisma.fxRequest.count({ where: { status: "PENDING" } });
  if (pending >= MAX_PENDING) return { ok: false, reason: `${pending} FX requests already awaiting approval (cap ${MAX_PENDING}). Wait for a member to clear them.` };

  const estCadCents = await estCadForUsd(amountUsdCents, null);
  const r = await prisma.fxRequest.create({
    data: {
      fromCurrency: "CAD",
      toCurrency: "USD",
      amountUsdCents,
      estCadCents,
      reason: args.reason,
      symbol,
      requestedBy: args.requestedBy ?? "agent",
    },
  });
  return { ok: true, id: r.id, estCadCents };
}

/** Cap gate (member dials) — returns null if clear, else the reason it's blocked. */
async function checkCaps(amountUsdCents: number, estCadCents: number): Promise<string | null> {
  const [settings, pf] = await Promise.all([prisma.settings.findUnique({ where: { id: 1 } }), getPortfolio()]);
  const fx = pf.fxUsdCad;
  const cadCost = estCadCents;

  const perReq = settings?.fxMaxPerRequestCents ?? 0;
  if (perReq > 0 && cadCost > perReq) {
    return `Over the per-request FX cap ($${(perReq / 100).toFixed(2)} CAD). Lower the amount or raise the dial in Settings.`;
  }
  const perWeek = settings?.fxMaxPerWeekCents ?? 0;
  if (perWeek > 0) {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60_000);
    const agg = await prisma.fxRequest.aggregate({ where: { status: "EXECUTED", decidedAt: { gte: weekAgo } }, _sum: { executedCadCents: true } });
    const spent = agg._sum.executedCadCents ?? 0;
    if (spent + cadCost > perWeek) {
      return `Over the weekly FX cap ($${(perWeek / 100).toFixed(2)} CAD; $${(spent / 100).toFixed(2)} already converted this week). Raise the dial in Settings.`;
    }
  }
  const capPct = settings?.usdAllocationCapPct ?? 100;
  if (capPct < 100 && pf.navCents > 0) {
    const usdPositionsCad = pf.positions.filter((p) => p.currency === "USD").reduce((s, p) => s + p.marketValueCadCents, 0);
    const usdCashCad = toCadCents(pf.usdCashCents, "USD", fx);
    const addedCad = toCadCents(amountUsdCents, "USD", fx);
    const projectedPct = ((usdPositionsCad + usdCashCad + addedCad) / pf.navCents) * 100;
    if (projectedPct > capPct) {
      return `Over the USD allocation cap: this would put the fund at ${projectedPct.toFixed(0)}% USD vs the ${capPct}% limit. Raise the dial in Settings or convert less.`;
    }
  }
  return null;
}

/** Execute a request through the broker FX path, mark it EXECUTED/FAILED, journal it.
 *  Shared by member approval and the manual-convert escape hatch. */
async function executeRequest(id: number, decidedBy: string, note?: string | null): Promise<FxExecuteResult> {
  const req = await prisma.fxRequest.findUnique({ where: { id } });
  if (!req) return { ok: false, reason: `FX request #${id} not found.` };
  if (req.status !== "PENDING" && req.status !== "APPROVED") return { ok: false, reason: `FX request #${id} is ${req.status}, not actionable.` };

  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  if (settings?.killSwitch) return { ok: false, reason: "Kill switch is engaged — no conversions while halted." };

  const capBlock = await checkCaps(req.amountUsdCents, req.estCadCents);
  if (capBlock) return { ok: false, reason: capBlock };

  const result = await getBroker().convertCurrency({ fromCurrency: "CAD", toCurrency: "USD", amountToCents: req.amountUsdCents });
  if (!result.ok) {
    await prisma.fxRequest.update({ where: { id }, data: { status: "FAILED", decidedBy, decidedAt: new Date(), note: note ?? undefined, failReason: result.error } });
    return { ok: false, reason: result.error };
  }

  await prisma.fxRequest.update({
    where: { id },
    data: {
      status: "EXECUTED",
      decidedBy,
      decidedAt: new Date(),
      note: note ?? undefined,
      executedRate: result.rate,
      executedCadCents: result.fromDebitedCents,
      executedUsdCents: result.toCreditedCents,
      commissionCents: result.commissionCents,
    },
  });
  await prisma.journalEntry.create({
    data: {
      kind: "SYSTEM",
      symbol: req.symbol ?? undefined,
      title: `FX: converted $${(result.fromDebitedCents / 100).toFixed(2)} CAD → US$${(result.toCreditedCents / 100).toFixed(2)}`,
      body:
        `${decidedBy} approved the agent's request${req.symbol ? ` to fund ${req.symbol}` : ""} @ ${result.rate.toFixed(4)} USD/CAD.\n\n` +
        `**Reason:** ${req.reason}` +
        (note ? `\n\n**Note:** ${note}` : ""),
    },
  });
  return { ok: true, id, cadDebitedCents: result.fromDebitedCents, usdCreditedCents: result.toCreditedCents, rate: result.rate };
}

export async function approveFxRequest(id: number, decidedBy: string, note?: string | null): Promise<FxExecuteResult> {
  return executeRequest(id, decidedBy, note);
}

export async function rejectFxRequest(id: number, decidedBy: string, note?: string | null): Promise<{ ok: boolean; reason?: string }> {
  const req = await prisma.fxRequest.findUnique({ where: { id } });
  if (!req || req.status !== "PENDING") return { ok: false, reason: `FX request #${id} is not pending.` };
  await prisma.fxRequest.update({ where: { id }, data: { status: "REJECTED", decidedBy, decidedAt: new Date(), note: note ?? undefined } });
  return { ok: true };
}

/** Member escape hatch: convert immediately (no agent request). Subject to the same
 *  caps + kill switch as an approval. */
export async function manualConvert(amountUsdCents: number, memberEmail: string, note?: string | null): Promise<FxExecuteResult> {
  const created = await createFxRequest({ amountUsdCents, reason: "Manual conversion by a member.", requestedBy: memberEmail });
  if (!created.ok) return { ok: false, reason: created.reason };
  return executeRequest(created.id, memberEmail, note ?? "manual convert");
}

export async function listFxRequests(): Promise<{
  pending: Awaited<ReturnType<typeof prisma.fxRequest.findMany>>;
  recent: Awaited<ReturnType<typeof prisma.fxRequest.findMany>>;
}> {
  const [pending, recent] = await Promise.all([
    prisma.fxRequest.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "desc" } }),
    prisma.fxRequest.findMany({ where: { status: { not: "PENDING" } }, orderBy: { decidedAt: "desc" }, take: 8 }),
  ]);
  return { pending, recent };
}
