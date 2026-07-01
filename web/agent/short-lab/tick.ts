// The Short Lab mark tick (docs/SHORT-LAB.md) — pure math + quotes, NO model tokens. Called from the
// runner loop like runDeskTick. Marks each RUNNING lab that holds an open short to the live quote,
// accrues borrow, runs the margin check, and snapshots equity — throttled to ~one snapshot / 4 min so
// the equity curve stays readable. Gated to market hours + an env kill (GRQ_SHORTLAB_ENABLED).
import { isMarketOpen } from "../calendar";
import { prisma } from "../../lib/db";
import { markLab } from "../../lib/short/lab";
import { syncShadowShorts } from "../../lib/short/shadow";

const SNAPSHOT_THROTTLE_MS = 4 * 60 * 1000;
let running = false;

export async function runShortLabTick(): Promise<void> {
  if (running || process.env.GRQ_SHORTLAB_ENABLED === "0" || !isMarketOpen()) return;
  running = true;
  try {
    await syncShadowShorts().catch((e) => console.error("[shortlab] shadow sync error", e instanceof Error ? e.message : e));
    const labs = await prisma.shortLab.findMany({
      where: { status: "RUNNING", positions: { some: { status: "OPEN" } } },
      select: { id: true, snapshots: { orderBy: { at: "desc" }, take: 1, select: { at: true } } },
    });
    const now = Date.now();
    for (const l of labs) {
      const lastAt = l.snapshots[0]?.at.getTime() ?? 0;
      if (now - lastAt < SNAPSHOT_THROTTLE_MS) continue;
      await markLab(l.id).catch((e) => console.error("[shortlab] mark error", e instanceof Error ? e.message : e));
    }
  } finally {
    running = false;
  }
}
