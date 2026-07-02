// Day-Trading Lab mark tick (docs/DAY-TRADE-LAB.md) — pure math + quotes, NO model tokens. Marks each
// OPEN lab's Trader + Holder equity to the live mid so the two curves fill in even when nobody's
// clicking (like the Short Lab tick). Market-hours + env-kill gated. Throttled to ~3 min/lab.
import { isMarketOpen } from "../calendar";
import { prisma } from "../../lib/db";
import { markDayLab } from "../../lib/day/lab";

const THROTTLE_MS = 3 * 60 * 1000;
let running = false;

export async function runDayLabTick(): Promise<void> {
  if (running || process.env.GRQ_DAYLAB_ENABLED === "0" || !isMarketOpen()) return;
  running = true;
  try {
    const labs = await prisma.dayLab.findMany({ where: { status: "OPEN" }, select: { id: true, marks: { orderBy: { at: "desc" }, take: 1, select: { at: true } } } });
    const now = Date.now();
    for (const l of labs) {
      if (now - (l.marks[0]?.at.getTime() ?? 0) < THROTTLE_MS) continue;
      await markDayLab(l.id).catch((e) => console.error("[daylab] mark error", e instanceof Error ? e.message : e));
    }
  } finally {
    running = false;
  }
}
