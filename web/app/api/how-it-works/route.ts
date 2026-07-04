import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { memberFromRequest } from "@/lib/session";
import { isOwner } from "@/lib/users";
import { getPortfolio } from "@/lib/portfolio";
import { usdCadRate } from "@/lib/fx";
import { DIALS, HARD, CHECKIN_TIMES_ET, OPERATING_COST_USD_CENTS_PER_MONTH, SELF_INVEST, MODELS } from "@/agent/policy";
import { PERSONA } from "@/agent/persona";
import { CHANGELOG } from "@/lib/changelog";
import { getDecisions } from "@/lib/decisions";

// "How GRQ works" for GRQ Go (web /how-it-works parity — the About GRQ page under
// More ▸ Learning). Owner-only, like the web page. ?tab=manual (default) returns the
// live operating manual — the numbers come from the same policy the agent obeys, so
// the page can't drift; ?tab=decisions pages the engineering decision record
// (?offset=&limit=, newest first — the file is ~276KB, so it ships in slices).
export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET(req: Request) {
  const session = memberFromRequest(req);
  if (!session || !isOwner(session.email)) {
    return NextResponse.json({ error: "Owners only." }, { status: 403 });
  }

  const sp = new URL(req.url).searchParams;
  if (sp.get("tab") === "decisions") {
    const offset = Math.max(0, Number(sp.get("offset")) || 0);
    const limit = Math.min(60, Math.max(1, Number(sp.get("limit")) || 30));
    const all = await getDecisions();
    return NextResponse.json({
      total: all.length,
      offset,
      decisions: all.slice(offset, offset + limit).map((d) => ({ n: d.n, title: d.title, meta: d.meta ?? null, body: d.body })),
    });
  }

  const [settings, pf, fx] = await Promise.all([
    prisma.settings.findUnique({ where: { id: 1 } }),
    getPortfolio(),
    usdCadRate(),
  ]);
  const riskLevel = (settings?.riskLevel ?? "BALANCED") as keyof typeof DIALS;
  const dial = DIALS[riskLevel];
  const rate = fx ?? 1.42;
  const costCadYr = OPERATING_COST_USD_CENTS_PER_MONTH * 12 * rate;
  const hurdlePct = pf.navCents > 0 ? (costCadYr / pf.navCents) * 100 : 0;

  return NextResponse.json({
    navCents: pf.navCents,
    costUsdCentsPerMonth: OPERATING_COST_USD_CENTS_PER_MONTH,
    hurdlePct,
    riskLevel,
    dials: [
      { k: "Most in one stock", v: `${dial.maxPositionPct}% of the fund`, gloss: "No single position can grow past this share of the whole fund." },
      { k: "Cash band (each currency)", v: `${dial.cashFloorPct}%–${dial.cashCeilingPct}%`, gloss: "CAD and USD are kept separate. Below the floor it must hold dry powder; above the ceiling it must put money to work (a real stock, or a parked index ETF)." },
      { k: "Auto-sell (stop)", v: `${dial.stopPct}% below cost`, gloss: "If a holding falls this far below what we paid, it's sold automatically — no waiting." },
      { k: "Auto-take-profit", v: `${dial.takeProfitPct}% above cost`, gloss: "If a holding rises this far above cost, the gain is taken automatically." },
      { k: "New buys per week", v: `≤ ${dial.maxNewTradesPerWeek}`, gloss: "A ceiling on how many new positions it can open in a rolling 7 days." },
      { k: "Conviction bar", v: `≥ ${HARD.minBuyConfidence}%`, gloss: "It won't buy anything it isn't at least this confident in. This is the single biggest brake on activity." },
      { k: "Daily-loss pause", v: `${HARD.dailyLossPauseBps / 100}% in a day`, gloss: "If the fund drops this much in one day, it stops opening new positions for the rest of the day." },
      { k: "Drawdown auto-halt", v: `${HARD.drawdownKillBps / 100}% from the high`, gloss: "If the fund falls this far from its high-water mark, all trading halts automatically (the kill switch engages)." },
      { k: "Order pace", v: `${HARD.maxOrdersPerDay}/day · ${HARD.maxOrdersPerHour}/hour`, gloss: "Hard limits on how fast it can fire orders — no runaway trading." },
      { k: "Fee-worth-it test", v: `≥ ${HARD.feeEdgeMultiple}× costs`, gloss: "A trade's expected gain must clear at least this multiple of its round-trip commissions, or it's rejected." },
    ],
    guardrails: [
      "Never shorts, never borrows on margin, never trades options. (Shorting is an off-by-default switch only a human can ever flip.)",
      "Either owner can flip the kill switch at any time — nothing trades while it's engaged.",
      "The agent only proposes orders; deterministic code approves or rejects every single one. It cannot change its own limits — only Cam & Graham can, by editing the code.",
      "Moving money between currencies (CAD↔USD) needs an owner's explicit approval — the agent can request it, never do it.",
      "No real money trades until the soak gate passes: at least 4 clean weeks total, of which 2+ on the live broker's paper account.",
      "Everything is whole shares and integer cents — no fractional-share or floating-point fuzziness, anywhere.",
    ],
    rhythm: [
      { t: "~6:00 ET", d: "Pre-morning read — a quick scan of the overnight tape; refreshes research it'll want before the open." },
      { t: "9:00 ET", d: "Game plan — the day's hypothesis, written before the bell." },
      { t: `${CHECKIN_TIMES_ET.join(" · ")} ET`, d: "Check-ins every 30 minutes — each one rebuilds the plan from scratch, acts on what's live, and must widen the net by vetting 12–18 fresh names (dossiering only the promising few). It can also schedule itself a near-term return to act once a queued dossier lands." },
      { t: "12:30 ET", d: "Midday brief — a readable lunchtime summary (no trading decisions)." },
      { t: "16:15 ET", d: "End-of-day report — what happened, why, and tomorrow's watch list." },
      { t: "Saturday", d: "Weekly review — grades closed theses, banks lessons, and gives a contribute/hold/withdraw recommendation." },
    ],
    learns: [
      "Every trade carries a falsifiable thesis at entry — a price target, a stop, a time horizon, and what would prove it wrong.",
      "At exit, it writes a retro: did the thesis play out, and was it right for the right reasons or just lucky?",
      "Durable patterns become lessons that are re-read before every future decision.",
      "It grades its information sources by hit-rate — the fund learns whose signals to trust.",
    ],
    changelog: CHANGELOG.map((c) => ({ date: c.date, title: c.title, what: c.what, why: c.why, tag: c.tag, dRef: c.dRef ?? null })),
    persona: PERSONA,
    ruleNumbers: JSON.stringify(
      { dials: DIALS, hardLimits: HARD, selfInvest: SELF_INVEST, models: MODELS, operatingCostUsdCentsPerMonth: OPERATING_COST_USD_CENTS_PER_MONTH },
      null,
      2,
    ),
  });
}
