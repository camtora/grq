import { prisma } from "./db";
import { getBroker } from "./broker";
import { liveAgentVersion } from "./broker/sim";
import { isMarketOpen, isMarketDay, etDateStr } from "@/agent/calendar";
import { notifyOut } from "@/agent/alerts";
import { planFlatten, flattenRefusal, flattenNote, flattenLesson, RESET_PAUSE_REASON, isResetPause, RESET_TAG } from "./reset";

// The reset day's I/O (D138, 2026-10-22): the pause, the status the panel polls, and the flatten
// job. The pure parts (guards, order plan, note text) live in lib/reset.ts and are tested; this
// file owns the database, the broker and the alerts. The job runs inside the web process: a
// member's click starts it, the panel polls /api/reset/status while it sells one name at a time
// (each market sell waits for its fill and for the mirror to absorb it — about 20 s a name), and
// the truth of progress is the DB (positions left, tagged fills), not this process's memory, so a
// restart mid-way loses nothing: pressing the button again sells only what is still held.

// ----- the pause -----

export async function pauseState(): Promise<{ paused: boolean; until: Date | null; reason: string | null; isReset: boolean }> {
  const s = await prisma.agentState.findUnique({ where: { id: 1 }, select: { limitQuietUntil: true, limitQuietReason: true } });
  const until = s?.limitQuietUntil ?? null;
  const paused = !!until && until.getTime() > Date.now();
  return { paused, until: paused ? until : null, reason: paused ? (s?.limitQuietReason ?? null) : null, isReset: paused && isResetPause(s?.limitQuietReason) };
}

/** Pause the agent for the reset: no Claude session until `until` (default: the next market day at 08:00 ET, before
 *  the 9:00 plan), through the limit-quiet skip under its own named reason. The running agent image
 *  honours the field within 30 s (its cache). A SYSTEM row records who and why; the other member is
 *  pinged. */
export async function pauseAgentForReset(by: string, email: string, until?: Date): Promise<Date> {
  const to = until ?? defaultPauseUntil();
  await prisma.agentState.upsert({
    where: { id: 1 },
    update: { limitQuietUntil: to, limitQuietReason: RESET_PAUSE_REASON },
    create: { id: 1, limitQuietUntil: to, limitQuietReason: RESET_PAUSE_REASON },
  });
  await prisma.journalEntry.create({
    data: {
      kind: "SYSTEM",
      title: `Alfred paused for the paper-account reset by ${by}`,
      body: `No Claude session (check-ins, dossiers, race, desk, chat) until ${fmtEt(to)} or until a member lifts it on Settings → Reset rehearsal. The tick keeps running: quotes, reconcile, fills, the safety stops. The order path stays open for the members' tagged sells; the kill switch goes on after the flatten. (D138)`,
      agentVersion: (await liveAgentVersion()) ?? undefined,
    },
  });
  await notifyOut("warning", `Alfred paused for the reset by ${by}`, `No agent sessions until ${fmtEt(to)} or until lifted. The book is about to be sold flat for the restart (D138).`, { category: "system", actorEmail: email });
  return to;
}

export async function liftResetPause(by: string, email: string): Promise<void> {
  await prisma.agentState.update({ where: { id: 1 }, data: { limitQuietUntil: null, limitQuietReason: null } });
  await prisma.journalEntry.create({
    data: {
      kind: "SYSTEM",
      title: `Alfred's reset pause lifted by ${by}`,
      body: "Claude sessions resume on the next slot. (D138)",
      agentVersion: (await liveAgentVersion()) ?? undefined,
    },
  });
  await notifyOut("info", `Alfred's pause lifted by ${by}`, "Sessions resume on the next scheduled slot.", { category: "system", actorEmail: email });
}

/** 08:00 ET on the next market day after today — a Friday pause runs to Monday morning (day 1),
 *  before the 9:00 plan. Built from the ET date string so DST can't skew it. */
export function defaultPauseUntil(now = new Date()): Date {
  let d = new Date(now.getTime() + 24 * 60 * 60_000);
  for (let i = 0; i < 10 && !isMarketDay(d); i++) d = new Date(d.getTime() + 24 * 60 * 60_000);
  const ymd = etDateStr(d); // YYYY-MM-DD in ET
  // 08:00 ET = 12:00Z under EDT (until Nov 1) / 13:00Z under EST.
  const probe = new Date(`${ymd}T12:00:00Z`);
  const hourEt = Number(probe.toLocaleString("en-US", { timeZone: "America/Toronto", hour: "numeric", hour12: false }));
  return hourEt === 8 ? probe : new Date(`${ymd}T13:00:00Z`);
}

function fmtEt(d: Date): string {
  return d.toLocaleString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " ET";
}

// ----- the flatten job -----

export type FlattenStep = { symbol: string; qty: number; ok: boolean; status?: "FILLED" | "PENDING"; fillPriceCents?: number; reason?: string; at: string };
export type FlattenJob = { startedAt: string; by: string; day: string; total: number; steps: FlattenStep[]; finishedAt: string | null; error: string | null };

let job: FlattenJob | null = null;

export function currentJob(): FlattenJob | null {
  return job;
}

const running = () => !!job && job.finishedAt === null;

export type ResetStatus = {
  day: string;
  marketOpen: boolean;
  killSwitch: boolean;
  killSwitchBy: string | null;
  pause: { paused: boolean; until: string | null; isReset: boolean };
  positions: { symbol: string; qty: number; currency: string }[];
  resetFillsToday: { symbol: string; qty: number; priceCents: number; at: string }[];
  cash: { cadCents: number; usdCents: number };
  job: FlattenJob | null;
  canFlatten: string | null; // null = may start; else the reason it may not
};

export async function resetStatus(): Promise<ResetStatus> {
  const day = etDateStr();
  const [settings, pause, positions, account, fills] = await Promise.all([
    prisma.settings.findUnique({ where: { id: 1 }, select: { killSwitch: true, killSwitchBy: true } }),
    pauseState(),
    prisma.position.findMany({ where: { qty: { gt: 0 } }, orderBy: { symbol: "asc" }, select: { symbol: true, qty: true, currency: true } }),
    prisma.account.findUnique({ where: { id: 1 }, select: { cashCents: true, usdCashCents: true } }),
    prisma.order.findMany({
      where: { tag: RESET_TAG, status: "FILLED", createdAt: { gte: new Date(Date.now() - 36 * 60 * 60_000) } },
      orderBy: { createdAt: "asc" },
      select: { symbol: true, filledQty: true, avgFillPriceCents: true, createdAt: true },
    }),
  ]);
  const marketOpen = isMarketOpen();
  const killSwitch = settings?.killSwitch ?? false;
  return {
    day,
    marketOpen,
    killSwitch,
    killSwitchBy: settings?.killSwitchBy ?? null,
    pause: { paused: pause.paused, until: pause.until?.toISOString() ?? null, isReset: pause.isReset },
    positions,
    resetFillsToday: fills.map((f) => ({ symbol: f.symbol, qty: f.filledQty ?? 0, priceCents: f.avgFillPriceCents ?? 0, at: f.createdAt.toISOString() })),
    cash: { cadCents: account?.cashCents ?? 0, usdCents: account?.usdCashCents ?? 0 },
    job,
    canFlatten: flattenRefusal({ killSwitch, paused: pause.paused, marketOpen, running: running(), openPositions: positions.length }),
  };
}

/** Start the flatten (a member's click). Throws with the guard's reason when it may not start. */
export async function startFlatten(email: string, by: string): Promise<FlattenJob> {
  const st = await resetStatus();
  if (st.canFlatten) throw new Error(st.canFlatten);
  const day = st.day;
  const orders = planFlatten(st.positions, email, day);
  job = { startedAt: new Date().toISOString(), by, day, total: orders.length, steps: [], finishedAt: null, error: null };
  void runFlatten(orders, email, by, day).catch((e) => {
    if (job) {
      job.error = e instanceof Error ? e.message : String(e);
      job.finishedAt = new Date().toISOString();
    }
  });
  return job;
}

async function runFlatten(orders: ReturnType<typeof planFlatten>, email: string, by: string, day: string): Promise<void> {
  const broker = getBroker();
  const version = (await liveAgentVersion()) ?? undefined;
  const sold: string[] = [];
  for (const o of orders) {
    const pos = await prisma.position.findUnique({ where: { symbol: o.symbol } });
    // Re-check the two gates that can change mid-run: a member may have thrown the kill switch, and
    // the mirror may have absorbed a stop that already closed this name.
    const settings = await prisma.settings.findUnique({ where: { id: 1 }, select: { killSwitch: true } });
    if (settings?.killSwitch) {
      job!.steps.push({ symbol: o.symbol, qty: o.qty, ok: false, reason: "Kill switch engaged mid-flatten — stopped here.", at: new Date().toISOString() });
      break;
    }
    if (!pos || pos.qty <= 0) {
      job!.steps.push({ symbol: o.symbol, qty: o.qty, ok: false, reason: "No longer held — skipped.", at: new Date().toISOString() });
      continue;
    }
    const qty = Math.min(o.qty, pos.qty);
    const res = await broker.placeOrder({ ...o, qty });
    if (res.ok) {
      sold.push(o.symbol);
      job!.steps.push({ symbol: o.symbol, qty, ok: true, status: res.status, fillPriceCents: res.fillPriceCents, at: new Date().toISOString() });
      const note = flattenNote({ symbol: o.symbol, qty, avgCostCents: pos.avgCostCents, currency: pos.currency, fillPriceCents: res.fillPriceCents ?? null, day, by });
      await prisma.journalEntry.create({ data: { kind: "SYSTEM", symbol: o.symbol, title: note.title, body: note.body, agentVersion: version } }).catch(() => {});
    } else {
      job!.steps.push({ symbol: o.symbol, qty, ok: false, reason: res.rejectReason, at: new Date().toISOString() });
    }
  }
  if (sold.length) {
    const lesson = flattenLesson(day, sold, by);
    await prisma.journalEntry.create({ data: { kind: "LESSON", title: lesson.title, body: lesson.body, permanent: true, agentVersion: version } }).catch(() => {});
  }
  const failed = job!.steps.filter((s) => !s.ok);
  const left = await prisma.position.count({ where: { qty: { gt: 0 } } });
  job!.finishedAt = new Date().toISOString();
  await notifyOut(
    failed.length ? "warning" : "info",
    `Reset flatten by ${by}: ${sold.length} of ${orders.length} sold${left ? `, ${left} still held` : ", the book is flat"}`,
    [
      ...job!.steps.map((s) => (s.ok ? `SOLD ${s.qty} ${s.symbol}${s.fillPriceCents ? ` @ ${(s.fillPriceCents / 100).toFixed(2)}` : " (pending)"}` : `✗ ${s.symbol}: ${s.reason}`)),
      left === 0 ? "Next: engage the kill switch (step 3), then the portal balance reset after the close." : "Check the names still held before engaging the kill switch.",
    ].join("\n").slice(0, 1500),
    { category: "trades", actorEmail: email },
  );
}
