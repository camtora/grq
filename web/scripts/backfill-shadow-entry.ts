// One-time backfill of The Race entry-price snapshots (Cam 2026-06-25). Existing ShadowRun rows
// predate the entryPriceCents column, so history can't be scored until they're priced:
//   • challenger BUY/SELL rows  → priced at the daily CLOSE on the call's ET date (approximate;
//     live snapshots going forward are exact intraday mids).
//   • champion rows (no action) → their call is derived from the session's TradeProposal, priced
//     at the proposal's quoted ask/bid (priceCents); no proposal ⇒ a NONE/stand-down call.
// Idempotent: only touches rows still missing the data. Run: `npx tsx scripts/backfill-shadow-entry.ts`.
import { prisma } from "../lib/db";
import { getCloses, refreshBars } from "../lib/bars";
import { currencyForSymbol } from "../lib/universe";
import { etDateStr } from "../agent/calendar";

const DECISION = new Set(["morning", "checkin", "position"]);
const utcDay = (d: Date) => d.toISOString().slice(0, 10); // bars are stored as `${etDate}T00:00:00Z`

async function backfillChallengers() {
  const rows = await prisma.shadowRun.findMany({
    where: { role: "challenger", action: { in: ["BUY", "SELL"] }, entryPriceCents: null, symbol: { not: null } },
    select: { id: true, symbol: true, sessionAt: true },
  });
  console.log(`[backfill] ${rows.length} challenger calls to price`);

  // Fetch each symbol's closes once (backfilling bars if we have none).
  const closesBySym = new Map<string, { date: Date; closeCents: number }[]>();
  for (const s of [...new Set(rows.map((r) => (r.symbol as string).toUpperCase()))]) {
    let closes = await getCloses(s, 400).catch(() => [] as { date: Date; closeCents: number }[]);
    if (closes.length === 0) {
      await refreshBars([s], "1y").catch(() => 0);
      closes = await getCloses(s, 400).catch(() => [] as { date: Date; closeCents: number }[]);
    }
    closesBySym.set(s, closes);
  }

  let priced = 0;
  let unpriced = 0;
  for (const r of rows) {
    const sym = (r.symbol as string).toUpperCase();
    const closes = closesBySym.get(sym) ?? [];
    const cd = etDateStr(r.sessionAt);
    let close = closes.find((c) => utcDay(c.date) === cd);
    if (!close) {
      const prior = closes.filter((c) => utcDay(c.date) <= cd); // last close on/before the call date
      close = prior[prior.length - 1];
    }
    if (close && close.closeCents > 0) {
      const entryCurrency = await currencyForSymbol(sym).catch(() => null);
      await prisma.shadowRun.update({ where: { id: r.id }, data: { entryPriceCents: close.closeCents, entryCurrency } });
      priced++;
    } else {
      unpriced++;
      console.log(`[backfill]   unpriced challenger #${r.id} ${sym} @ ${cd} (no bar)`);
    }
  }
  console.log(`[backfill] challenger: ${priced} priced, ${unpriced} left unpriced`);
}

async function backfillChampions() {
  // Re-derive ALL champion decision rows (not just null ones) so a prior buggy run is corrected.
  // A proposal belongs to exactly ONE session: the window is [sessionAt, NEXT champion session's
  // sessionAt) — bounding by the next session (not a fixed +6h) stops a late proposal being
  // stamped onto every earlier session.
  const rows = await prisma.shadowRun.findMany({
    where: { role: "champion", sessionKind: { in: [...DECISION] } },
    select: { id: true, sessionAt: true, sessionKind: true },
    orderBy: { sessionAt: "asc" },
  });
  console.log(`[backfill] ${rows.length} champion decision rows to (re)derive`);

  let derived = 0;
  let none = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    // Window upper bound = the next champion session, or +6h for the final row of the set.
    const next = rows[i + 1]?.sessionAt ?? new Date(r.sessionAt.getTime() + 6 * 60 * 60 * 1000);
    const props = await prisma.tradeProposal.findMany({
      where: { at: { gte: r.sessionAt, lt: next } },
      select: { symbol: true, side: true, qty: true, tradeConfidence: true, priceCents: true, at: true },
    });
    if (props.length === 0) {
      await prisma.shadowRun.update({
        where: { id: r.id },
        data: { action: "NONE", symbol: null, qty: null, confidence: null, entryPriceCents: null, entryCurrency: null },
      });
      none++;
      continue;
    }
    props.sort((a, b) => (b.tradeConfidence ?? -1) - (a.tradeConfidence ?? -1) || b.at.getTime() - a.at.getTime());
    const pick = props[0];
    const entryCurrency = pick.priceCents != null ? await currencyForSymbol(pick.symbol).catch(() => null) : null;
    await prisma.shadowRun.update({
      where: { id: r.id },
      data: {
        action: pick.side === "SELL" ? "SELL" : "BUY",
        symbol: pick.symbol,
        qty: pick.qty,
        confidence: pick.tradeConfidence ?? null,
        entryPriceCents: pick.priceCents ?? null,
        entryCurrency,
      },
    });
    derived++;
  }
  console.log(`[backfill] champion: ${derived} derived, ${none} stand-down(NONE)`);
}

async function main() {
  await backfillChallengers();
  await backfillChampions();
  console.log("[backfill] done");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
