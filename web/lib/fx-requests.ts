import { prisma } from "./db";
import { getBroker } from "./broker";
import { getPortfolio } from "./portfolio";
import { toCadCents, usdCadRate } from "./fx";

// The FX-approval guardrail (D62, bidirectional 2026-06-24). The agent can REQUEST a
// CAD→USD conversion (request_fx) to fund a US name it can't otherwise buy; a member
// APPROVES each one, and only then does money move (broker.convertCurrency). Members can
// also convert either way directly (manualConvert) — incl. USD→CAD to bring money home.
// The Settings dials (fxMaxPerRequestCents / fxMaxPerWeekCents / usdAllocationCapPct) bound
// what can be approved — they bite HERE, at approval, and only on CAD→USD (adding USD
// exposure); USD→CAD de-risks, so it's cap-free. A source-funds guard refuses any
// conversion that would overdraw the from-currency (no margin — IBKR paper would otherwise
// happily run the balance negative). This module is the ONLY caller of broker.convertCurrency.

const MAX_PENDING = 8; // anti-runaway: cap simultaneous open requests
const FEE_CAD = 200; // ≈ IBKR IDEALPRO minimum (~US$2), matches SimBroker

type Ccy = "CAD" | "USD";

export type FxCreateResult = { ok: true; id: number; estCadCents: number } | { ok: false; reason: string };
export type FxExecuteResult =
  | { ok: true; id: number; fromCurrency: Ccy; toCurrency: Ccy; fromDebitedCents: number; toCreditedCents: number; rate: number }
  | { ok: false; reason: string };

async function estCadForUsd(amountUsdCents: number, fx: number | null): Promise<number> {
  const rate = fx ?? (await usdCadRate());
  return rate ? Math.round(amountUsdCents * rate) : amountUsdCents;
}

/** Both cash legs (USD + CAD) for a conversion, from an amount the member typed in EITHER
 *  currency. `fx` is USD→CAD (1 USD = fx CAD). Estimates are rate-only — the broker applies
 *  the fee at execution and reports the exact realized legs. The leg matching the TO currency
 *  becomes the broker's `amountToCents` (see executeRequest), so typing the destination amount
 *  is exact ("I want US$1,000") while typing the source amount is sized at the current rate
 *  ("move $1,000 CAD into USD" → acquire ~US$X, spend ~$1,000 CAD). */
function legsFor(inputCurrency: Ccy, inputAmountCents: number, fx: number): { usdCents: number; cadCents: number } {
  if (inputCurrency === "USD") {
    const usdCents = inputAmountCents;
    return { usdCents, cadCents: Math.round(usdCents * fx) };
  }
  const cadCents = inputAmountCents;
  return { usdCents: Math.round(cadCents / fx), cadCents };
}

/** Raise a PENDING conversion request. Direction defaults to CAD→USD (the agent's only
 *  use). `amountUsdCents` is always the USD leg — USD acquired (CAD→USD) or USD spent
 *  (USD→CAD); `estCadCents` is the CAD leg. Uncapped on amount (a member is the gate);
 *  deduped per symbol; bounded only by MAX_PENDING. */
export async function createFxRequest(args: {
  amountUsdCents: number;
  estCadCents?: number;
  reason: string;
  symbol?: string | null;
  requestedBy?: string;
  fromCurrency?: Ccy;
  toCurrency?: Ccy;
}): Promise<FxCreateResult> {
  const amountUsdCents = Math.round(args.amountUsdCents);
  if (!Number.isInteger(amountUsdCents) || amountUsdCents <= 0) return { ok: false, reason: "Amount must be a positive whole number of USD cents." };
  const fromCurrency: Ccy = args.fromCurrency ?? "CAD";
  const toCurrency: Ccy = args.toCurrency ?? "USD";
  if (fromCurrency === toCurrency) return { ok: false, reason: "From and to currencies must differ." };
  const symbol = args.symbol?.toUpperCase() ?? null;

  if (symbol) {
    const dup = await prisma.fxRequest.findFirst({ where: { status: "PENDING", symbol } });
    if (dup) return { ok: false, reason: `A conversion to fund ${symbol} is already pending a member's approval (request #${dup.id}).` };
  }
  const pending = await prisma.fxRequest.count({ where: { status: "PENDING" } });
  if (pending >= MAX_PENDING) return { ok: false, reason: `${pending} FX requests already awaiting approval (cap ${MAX_PENDING}). Wait for a member to clear them.` };

  const estCadCents = args.estCadCents != null && args.estCadCents > 0 ? Math.round(args.estCadCents) : await estCadForUsd(amountUsdCents, null);
  const r = await prisma.fxRequest.create({
    data: {
      fromCurrency,
      toCurrency,
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

/** Source-funds guard — refuses a conversion that would overdraw the from-currency.
 *  No margin: the fund only converts cash it actually holds (the mirrored broker
 *  balances). Returns null if clear, else the reason. */
async function checkFunds(fromCurrency: Ccy, amountUsdCents: number, estCadCents: number): Promise<string | null> {
  const account = await prisma.account.findUnique({ where: { id: 1 } });
  if (fromCurrency === "CAD") {
    const need = estCadCents + FEE_CAD; // CAD spent to acquire USD
    const have = account?.cashCents ?? 0;
    if (need > have) return `Insufficient CAD: need ~$${(need / 100).toFixed(2)}, hold $${(have / 100).toFixed(2)}. No margin — convert less or add CAD.`;
  } else {
    const need = amountUsdCents + 200; // USD spent (the USD leg) + ~US$2 fee buffer
    const have = account?.usdCashCents ?? 0;
    if (need > have) return `Insufficient USD: need ~US$${(need / 100).toFixed(2)}, hold US$${(have / 100).toFixed(2)}.`;
  }
  return null;
}

const fmtCcy = (ccy: Ccy, cents: number) => (ccy === "USD" ? `US$${(cents / 100).toFixed(2)}` : `$${(cents / 100).toFixed(2)} CAD`);

/** Execute a request through the broker FX path, mark it EXECUTED/FAILED, journal it.
 *  Shared by member approval and the manual-convert escape hatch. Bidirectional. */
async function executeRequest(id: number, decidedBy: string, note?: string | null): Promise<FxExecuteResult> {
  const req = await prisma.fxRequest.findUnique({ where: { id } });
  if (!req) return { ok: false, reason: `FX request #${id} not found.` };
  if (req.status !== "PENDING" && req.status !== "APPROVED") return { ok: false, reason: `FX request #${id} is ${req.status}, not actionable.` };
  const fromCurrency = req.fromCurrency as Ccy;
  const toCurrency = req.toCurrency as Ccy;

  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  if (settings?.killSwitch) return { ok: false, reason: "Kill switch is engaged — no conversions while halted." };

  // Never overdraw the source currency (the bug that let CAD go negative on IBKR paper).
  const fundsBlock = await checkFunds(fromCurrency, req.amountUsdCents, req.estCadCents);
  if (fundsBlock) {
    await prisma.fxRequest.update({ where: { id }, data: { status: "FAILED", decidedBy, decidedAt: new Date(), note: note ?? undefined, failReason: fundsBlock } });
    return { ok: false, reason: fundsBlock };
  }

  // The allocation/size dials only gate ADDING USD (CAD→USD). USD→CAD de-risks → cap-free.
  if (toCurrency === "USD") {
    const capBlock = await checkCaps(req.amountUsdCents, req.estCadCents);
    if (capBlock) return { ok: false, reason: capBlock };
  }

  // The broker takes the TO-currency amount to acquire: USD for CAD→USD, CAD for USD→CAD.
  const amountToCents = toCurrency === "USD" ? req.amountUsdCents : req.estCadCents;
  const result = await getBroker().convertCurrency({ fromCurrency, toCurrency, amountToCents });
  if (!result.ok) {
    await prisma.fxRequest.update({ where: { id }, data: { status: "FAILED", decidedBy, decidedAt: new Date(), note: note ?? undefined, failReason: result.error } });
    return { ok: false, reason: result.error };
  }

  // Map the realized legs back to fixed CAD/USD columns regardless of direction.
  const executedCadCents = toCurrency === "CAD" ? result.toCreditedCents : result.fromDebitedCents;
  const executedUsdCents = toCurrency === "USD" ? result.toCreditedCents : result.fromDebitedCents;

  await prisma.fxRequest.update({
    where: { id },
    data: {
      status: "EXECUTED",
      decidedBy,
      decidedAt: new Date(),
      note: note ?? undefined,
      executedRate: result.rate,
      executedCadCents,
      executedUsdCents,
      commissionCents: result.commissionCents,
    },
  });
  const line = `${fmtCcy(fromCurrency, result.fromDebitedCents)} → ${fmtCcy(toCurrency, result.toCreditedCents)}`;
  await prisma.journalEntry.create({
    data: {
      kind: "SYSTEM",
      symbol: req.symbol ?? undefined,
      title: `FX: converted ${line}`,
      body:
        `${decidedBy} ${req.requestedBy === "agent" ? "approved the agent's request" : "converted"}${req.symbol ? ` (${req.symbol})` : ""} @ ${result.rate.toFixed(4)} USD/CAD.\n\n` +
        `**Reason:** ${req.reason}` +
        (note ? `\n\n**Note:** ${note}` : ""),
    },
  });
  return { ok: true, id, fromCurrency, toCurrency, fromDebitedCents: result.fromDebitedCents, toCreditedCents: result.toCreditedCents, rate: result.rate };
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

/** Member escape hatch: convert immediately (no agent request), either direction, with the
 *  amount typed in EITHER currency. `inputCurrency` says which side `inputAmountCents` is
 *  denominated in — it must be one of the two sides. The destination amount is exact when the
 *  member typed the TO currency; the source amount is sized at the current rate otherwise.
 *  Subject to the same funds guard + kill switch (and, for CAD→USD, the caps) as an approval. */
export async function manualConvert(
  args: { inputCurrency: Ccy; inputAmountCents: number; fromCurrency: Ccy; toCurrency: Ccy },
  memberEmail: string,
  note?: string | null,
): Promise<FxExecuteResult> {
  const { fromCurrency, toCurrency, inputCurrency } = args;
  const inputAmountCents = Math.round(args.inputAmountCents);
  if (fromCurrency === toCurrency) return { ok: false, reason: "From and to currencies must differ." };
  if (inputCurrency !== fromCurrency && inputCurrency !== toCurrency) return { ok: false, reason: "The amount must be in one of the two currencies." };
  if (!Number.isInteger(inputAmountCents) || inputAmountCents <= 0) return { ok: false, reason: "Amount must be a positive whole number of cents." };
  const rate = await usdCadRate();
  if (!rate || rate <= 0) return { ok: false, reason: "No USD/CAD rate available (BoC) — can't size the conversion." };
  const { usdCents, cadCents } = legsFor(inputCurrency, inputAmountCents, rate);

  const created = await createFxRequest({
    amountUsdCents: usdCents,
    estCadCents: cadCents,
    reason: `Manual ${fromCurrency}→${toCurrency} conversion by a member.`,
    requestedBy: memberEmail,
    fromCurrency,
    toCurrency,
  });
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
