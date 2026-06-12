import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sessionFromRequest, displayName } from "@/lib/session";
import {
  universeEntry,
  invalidateUniverseCache,
  BENCHMARK,
  CANDIDATE_CAP,
  ON_DEMAND_RESEARCH_PER_DAY,
} from "@/lib/universe";
import { probeYahooSymbol } from "@/lib/broker/yahoo";
import { refreshQuotesFor, getQuote } from "@/lib/broker/quotes";
import { refreshBars } from "@/lib/bars";
import { sendDiscord } from "@/agent/alerts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TIERS = ["etf", "large", "mid"] as const;

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

async function journal(symbol: string, title: string, body: string) {
  await prisma.journalEntry.create({ data: { kind: "SYSTEM", symbol, title, body } });
}

/** The automated promotion screen: price ≥ $2, 20d ADV ≥ 100k sh, ≥30 bars. */
async function promotionScreen(symbol: string): Promise<string[]> {
  const failures: string[] = [];
  const quote = await getQuote(symbol);
  if (!quote) failures.push("no quote available");
  else if (quote.midCents < 200) failures.push(`price $${(quote.midCents / 100).toFixed(2)} < $2.00 floor`);
  const bars = await prisma.bar.findMany({ where: { symbol }, orderBy: { date: "desc" }, take: 20 });
  if (bars.length < 20) {
    const total = await prisma.bar.count({ where: { symbol } });
    if (total < 30) failures.push(`insufficient bar history (${total} days; need 30)`);
  }
  if (bars.length > 0) {
    const adv = bars.reduce((s, b) => s + b.volume, 0) / bars.length;
    if (adv < 100_000) failures.push(`20d avg volume ${Math.round(adv).toLocaleString()} < 100,000 sh`);
  }
  return failures;
}

export async function POST(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return bad("Not a member.", 403);
  const who = displayName(session);

  let body: { action?: unknown; symbol?: unknown; tier?: unknown; note?: unknown };
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON.");
  }
  if (typeof body.symbol !== "string" || !/^[A-Za-z0-9.\-]{1,8}$/.test(body.symbol.trim())) {
    return bad("Invalid symbol.");
  }
  const symbol = body.symbol.trim().toUpperCase();
  const action = body.action;
  const entry = await universeEntry(symbol);

  // ---------- add (or revive a retired name) ----------
  if (action === "add") {
    if (entry && entry.status !== "RETIRED") return bad(`${symbol} is already tracked (${entry.status}).`);
    if (!entry) {
      const candidates = await prisma.universeMember.count({ where: { status: "CANDIDATE" } });
      if (candidates >= CANDIDATE_CAP) return bad(`Candidate cap reached (${CANDIDATE_CAP}) — retire something first.`);
      // TSX / TSX-V only until Phase 5 (US market).
      const base = symbol.replace(/\./g, "-");
      let resolved: { yahoo: string; priceCents: number; name: string | null } | null = null;
      for (const yahoo of [`${base}.TO`, `${base}.V`]) {
        const probe = await probeYahooSymbol(yahoo);
        if (probe) {
          resolved = { yahoo, ...probe };
          break;
        }
      }
      if (!resolved) return bad(`Couldn't find ${symbol} on TSX or TSX-V (US names wait for Phase 5).`, 404);
      await prisma.universeMember.create({
        data: {
          symbol,
          yahoo: resolved.yahoo,
          name: resolved.name ?? symbol,
          status: "CANDIDATE",
          addedBy: who,
          note: typeof body.note === "string" ? body.note.slice(0, 200) : null,
        },
      });
      invalidateUniverseCache();
      await refreshQuotesFor([symbol]).catch(() => 0);
      await refreshBars([symbol], "1y").catch(() => 0);
      await prisma.researchRequest.create({ data: { symbol, requestedBy: who } });
      await journal(symbol, `${who} added ${symbol} to research`, `${resolved.name ?? symbol} (${resolved.yahoo}) is now a CANDIDATE — researched, not tradeable. Dossier queued. Promotion to the universe requires both members + the automated screen.`);
      await sendDiscord("info", `${who} added ${symbol} to research`, `${resolved.name ?? ""} — dossier queued.`);
      return NextResponse.json({ ok: true, status: "CANDIDATE", yahoo: resolved.yahoo, name: resolved.name });
    }
    // revive
    await prisma.universeMember.update({ where: { symbol }, data: { status: "CANDIDATE", addedBy: who } });
    invalidateUniverseCache();
    await journal(symbol, `${who} re-opened research on ${symbol}`, "Back to CANDIDATE — history was kept.");
    await sendDiscord("info", `${who} re-opened research on ${symbol}`);
    return NextResponse.json({ ok: true, status: "CANDIDATE" });
  }

  if (!entry) return bad(`${symbol} is not tracked — add it first.`, 404);

  // ---------- on-demand research ----------
  if (action === "research") {
    if (entry.status === "RETIRED") return bad(`${symbol} is retired — re-add it first.`);
    const pending = await prisma.researchRequest.count({ where: { symbol, status: { in: ["QUEUED", "RUNNING"] } } });
    if (pending > 0) return bad(`${symbol} already has research in flight.`);
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const usedToday = await prisma.researchRequest.count({
      where: { requestedBy: { not: "rotation" }, at: { gte: dayStart } },
    });
    if (usedToday >= ON_DEMAND_RESEARCH_PER_DAY) {
      return bad(`On-demand research budget used (${ON_DEMAND_RESEARCH_PER_DAY}/day) — the rotation will get to it.`);
    }
    await prisma.researchRequest.create({ data: { symbol, requestedBy: who } });
    await sendDiscord("info", `${who} queued research on ${symbol}`);
    return NextResponse.json({ ok: true, queued: true });
  }

  // ---------- promote: two-person rule ----------
  if (action === "promote") {
    if (entry.status !== "CANDIDATE") return bad(`${symbol} is ${entry.status} — only candidates get promoted.`);
    const tier = typeof body.tier === "string" && (TIERS as readonly string[]).includes(body.tier) ? body.tier : entry.proposedTier;
    if (!tier) return bad("Pick a tier (etf | large | mid).");

    if (!entry.promotionRequestedBy) {
      await prisma.universeMember.update({
        where: { symbol },
        data: { promotionRequestedBy: who, promotionRequestedAt: new Date(), proposedTier: tier },
      });
      invalidateUniverseCache();
      await journal(symbol, `${who} requested promotion of ${symbol}`, `Proposed tier: ${tier}. Awaiting the other member's approval — universe additions take both of you.`);
      await sendDiscord("info", `${who} wants ${symbol} in the universe (${tier})`, "Needs the other member's approval on the Research tab.");
      return NextResponse.json({ ok: true, pending: who });
    }
    if (entry.promotionRequestedBy === who) {
      return bad(`You already requested this — it needs the other member's approval.`);
    }
    const failures = await promotionScreen(symbol);
    if (failures.length > 0) return bad(`Screen failed: ${failures.join("; ")}.`, 422);
    await prisma.universeMember.update({
      where: { symbol },
      data: { status: "ACTIVE", tier, promotionRequestedBy: null, promotionRequestedAt: null, proposedTier: null },
    });
    invalidateUniverseCache();
    await journal(symbol, `${symbol} promoted to the universe`, `Approved by ${entry.promotionRequestedBy} + ${who} (tier: ${tier}). Screen passed. The agent may now trade it within all guardrails.`);
    await sendDiscord("info", `🟢 ${symbol} joined the universe (${tier})`, `${entry.promotionRequestedBy} + ${who} — screen passed.`);
    return NextResponse.json({ ok: true, status: "ACTIVE" });
  }

  // ---------- demote (single member — risk reduction) ----------
  if (action === "demote") {
    if (entry.status !== "ACTIVE") return bad(`${symbol} is not ACTIVE.`);
    if (symbol === BENCHMARK) return bad("XIC is the benchmark — it stays.");
    await prisma.universeMember.update({
      where: { symbol },
      data: { status: "CANDIDATE", promotionRequestedBy: null, promotionRequestedAt: null, proposedTier: null },
    });
    invalidateUniverseCache();
    const held = await prisma.position.findUnique({ where: { symbol } });
    await journal(symbol, `${who} demoted ${symbol} from the universe`, `Back to CANDIDATE: no new buys.${held ? ` The current ${held.qty}-share position may be held or sold normally — exits are never trapped.` : ""}`);
    await sendDiscord("warning", `${who} demoted ${symbol} from the universe`, held ? `Position of ${held.qty} sh unaffected; no new buys.` : "No new buys.");
    return NextResponse.json({ ok: true, status: "CANDIDATE" });
  }

  // ---------- retire (stop researching; history kept) ----------
  if (action === "retire") {
    if (entry.status !== "CANDIDATE") return bad(`Only candidates retire — demote ${symbol} first.`);
    if (symbol === BENCHMARK) return bad("XIC is the benchmark — it stays.");
    await prisma.universeMember.update({ where: { symbol }, data: { status: "RETIRED" } });
    await prisma.watchlist.deleteMany({ where: { symbol } });
    invalidateUniverseCache();
    await journal(symbol, `${who} retired ${symbol}`, "Research stops (quotes/bars/dossiers). All history is kept; re-add any time.");
    await sendDiscord("info", `${who} retired ${symbol} from research`);
    return NextResponse.json({ ok: true, status: "RETIRED" });
  }

  return bad("action must be add | research | promote | demote | retire.");
}
