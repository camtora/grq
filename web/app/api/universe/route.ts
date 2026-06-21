import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { memberFromRequest, displayName } from "@/lib/session";
import {
  universeEntry,
  invalidateUniverseCache,
  BENCHMARK,
  CANDIDATE_CAP,
  yahooForListing,
  bareTicker,
  isTradeable,
} from "@/lib/universe";
import { promotionScreen } from "@/lib/screen";
import { probeYahooSymbol } from "@/lib/broker/yahoo";
import { refreshQuotesFor } from "@/lib/broker/quotes";
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

/** Best-effort country from the picked listing (powers the stock filters). */
function inferCountry(currency: string | null, exchange: string | null): string | null {
  const c = (currency ?? "").toUpperCase();
  if (c === "CAD") return "CA";
  if (c === "USD") return "US";
  const e = (exchange ?? "").toUpperCase();
  if (["TSX", "TSE", "TSXV", "NEO", "CSE", "CNSX"].includes(e)) return "CA";
  if (["NYSE", "NASDAQ", "AMEX", "NYSEARCA", "BATS"].includes(e)) return "US";
  return null;
}

export async function POST(req: Request) {
  const session = memberFromRequest(req);
  if (!session) return bad("Members only — read-only access.", 403);
  const who = displayName(session);

  let body: {
    action?: unknown; symbol?: unknown; tier?: unknown; note?: unknown;
    exchange?: unknown; currency?: unknown; name?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON.");
  }
  if (typeof body.symbol !== "string" || !/^[A-Za-z0-9.\-]{1,10}$/.test(body.symbol.trim())) {
    return bad("Invalid symbol.");
  }
  const symbol = body.symbol.trim().toUpperCase();
  const action = body.action;
  const entry = await universeEntry(symbol);

  // ---------- add (or revive a retired name) ----------
  if (action === "add") {
    // Listing-aware (D24): the search/browse pick carries the exchange + currency,
    // so we resolve the EXACT listing chosen — no blind ".TO" guessing — and never
    // collide a US listing with its CDR on one bare ticker (the SPCX bug).
    const pickExchange = typeof body.exchange === "string" ? body.exchange : null;
    const pickCurrency = typeof body.currency === "string" ? body.currency.toUpperCase() : null;
    const pickName = typeof body.name === "string" ? body.name.slice(0, 120) : null;
    const explicit = !!(pickExchange || symbol.includes("."));
    const intendedYahoo = explicit ? yahooForListing(symbol, pickExchange) : null;
    const bare = bareTicker(symbol);

    // Storage key: the bare ticker if free (or it's already this same listing),
    // else the exchange-qualified symbol so two listings of one ticker coexist.
    let key = bare;
    if (intendedYahoo) {
      const atBare = await universeEntry(bare);
      if (atBare && atBare.yahoo.toUpperCase() !== intendedYahoo.toUpperCase()) {
        key = intendedYahoo.toUpperCase() === bare ? `${bare}.US` : intendedYahoo.toUpperCase();
      }
    }
    const keyed = await universeEntry(key);
    if (keyed && keyed.status !== "RETIRED") return bad(`${keyed.name} (${keyed.yahoo}) is already tracked (${keyed.status}).`);

    if (!keyed) {
      const candidates = await prisma.universeMember.count({ where: { status: "CANDIDATE" } });
      if (candidates >= CANDIDATE_CAP) return bad(`Candidate cap reached (${CANDIDATE_CAP}) — retire something first.`);
      // With an explicit pick, probe ONLY that listing; else fall back to the
      // legacy try-order for a bare ticker (US, then TSX/TSX-V). US names are
      // RESEARCH candidates — tradeable only once they're CAD or we trade USD.
      const tries = intendedYahoo ? [intendedYahoo] : symbol.includes(".") ? [symbol] : [symbol, `${symbol}.TO`, `${symbol}.V`];
      let resolved: { yahoo: string; priceCents: number; name: string | null } | null = null;
      for (const yahoo of tries) {
        const probe = await probeYahooSymbol(yahoo);
        if (probe) {
          resolved = { yahoo, ...probe };
          break;
        }
      }
      if (!resolved) return bad(`Couldn't find a live quote for ${symbol} (tried: ${tries.join(", ")}).`, 404);
      await prisma.universeMember.create({
        data: {
          symbol: key,
          yahoo: resolved.yahoo,
          name: pickName ?? resolved.name ?? bare,
          status: "CANDIDATE",
          addedBy: who,
          currency: pickCurrency,
          exchange: pickExchange,
          country: inferCountry(pickCurrency, pickExchange),
          note: typeof body.note === "string" ? body.note.slice(0, 200) : null,
        },
      });
      invalidateUniverseCache();
      await refreshQuotesFor([key]).catch(() => 0);
      await refreshBars([key], "1y").catch(() => 0);
      await prisma.researchRequest.create({ data: { symbol: key, requestedBy: who } });
      await journal(key, `${who} added ${key} to research`, `${pickName ?? resolved.name ?? bare} (${resolved.yahoo}${pickCurrency ? `, ${pickCurrency}` : ""}) is now a CANDIDATE — researched, not tradeable. Dossier queued. Promotion to the universe requires both members + the automated screen.`);
      await sendDiscord("info", `${who} added ${key} to research`, `${pickName ?? resolved.name ?? ""} — dossier queued.`);
      return NextResponse.json({ ok: true, status: "CANDIDATE", symbol: key, yahoo: resolved.yahoo, name: pickName ?? resolved.name });
    }
    // revive (same listing, was retired)
    await prisma.universeMember.update({ where: { symbol: key }, data: { status: "CANDIDATE", addedBy: who } });
    invalidateUniverseCache();
    await journal(key, `${who} re-opened research on ${key}`, "Back to CANDIDATE — history was kept.");
    await sendDiscord("info", `${who} re-opened research on ${key}`);
    return NextResponse.json({ ok: true, status: "CANDIDATE", symbol: key });
  }

  // ---------- dismiss (a hunt proposal we don't want → RETIRED so it can't resurface) ----------
  if (action === "dismiss") {
    if (entry) {
      if (entry.status !== "RETIRED") {
        await prisma.universeMember.update({ where: { symbol }, data: { status: "RETIRED" } });
        invalidateUniverseCache();
        await journal(symbol, `${who} dismissed ${symbol}`, "Marked RETIRED — out of the hunt and the watchlist; re-add any time.");
      }
      return NextResponse.json({ ok: true, status: "RETIRED" });
    }
    // A hunt name isn't a UniverseMember yet — record it RETIRED so the hunt's
    // "already tracked" list skips it and it lands in Retired research.
    await prisma.universeMember.create({
      data: {
        symbol,
        yahoo: `${bareTicker(symbol)}.TO`,
        name: typeof body.name === "string" ? body.name.slice(0, 120) : symbol,
        status: "RETIRED",
        addedBy: who,
      },
    });
    invalidateUniverseCache();
    await journal(symbol, `${who} dismissed ${symbol} from the hunt`, "Marked RETIRED — the hunt won't resurface it. Re-add from the watchlist any time.");
    await sendDiscord("info", `${who} dismissed ${symbol} from the hunt`);
    return NextResponse.json({ ok: true, status: "RETIRED" });
  }

  // ---------- on-demand research ----------
  // Works for an untracked Browse/search name too: queues a dossier WITHOUT adding it
  // to the universe (exactly like a hunt find) — the stock page renders the dossier
  // when it lands, and the member watches it separately if they want to track it.
  // Tracked names keep the existing behavior.
  if (action === "research") {
    const key = entry ? symbol : bareTicker(symbol);
    if (entry?.status === "RETIRED") return bad(`${symbol} is retired — re-add it first.`);
    const pending = await prisma.researchRequest.count({ where: { symbol: key, status: { in: ["QUEUED", "RUNNING"] } } });
    if (pending > 0) return bad(`${key} already has research in flight.`);
    // No daily cap — Cam lifted it 2026-06-15 (research as much as we want).
    await prisma.researchRequest.create({ data: { symbol: key, requestedBy: who } });
    await sendDiscord("info", `${who} queued research on ${key}`);
    return NextResponse.json({ ok: true, queued: true, symbol: key });
  }

  if (!entry) return bad(`${symbol} is not tracked — add it first.`, 404);

  // ---------- promote: two-person rule ----------
  if (action === "promote") {
    if (entry.status !== "CANDIDATE") return bad(`${symbol} is ${entry.status} — only candidates get promoted.`);
    // Tradeable only in a currency the fund holds — CAD or USD (D34; IBKR carries
    // both). Other currencies stay research-only. Ties the gate to the actual money
    // constraint, not the exchange suffix (D24).
    if (!isTradeable(entry.currency, entry.yahoo)) {
      return bad(`${symbol} is a ${entry.currency ?? "non-CAD/USD"} listing (${entry.yahoo}) — the fund trades CAD and USD only. It stays on the watchlist.`, 422);
    }
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
    invalidateUniverseCache();
    await journal(symbol, `${who} retired ${symbol}`, "Research stops (quotes/bars/dossiers). All history is kept; re-add any time.");
    await sendDiscord("info", `${who} retired ${symbol} from research`);
    return NextResponse.json({ ok: true, status: "RETIRED" });
  }

  return bad("action must be add | dismiss | research | promote | demote | retire.");
}
