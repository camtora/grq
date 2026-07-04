"use client";

import { useState } from "react";
import { money } from "@/lib/money";
import { Button, Pnl } from "@/components/ui";
import Term from "@/components/Term";

// The Learn portal's toy exchange (docs/LEARN-PORTAL.md, D110 Phase 2) — a cartoon limit-order
// book for Course 2: two prices always exist, market orders cross the spread (and slip in thin
// names), limit orders wait in line and may never fill. Pure client, integer cents, whole shares.
// Colour semantics per docs/DESIGN.md: emerald = bid/buy side, amber = ask/sell side — with
// explicit text labels so the sides are never colour-alone.

type Level = { p: number; size: number; user: number }; // cents · public qty · your resting qty (back of the queue)
type Mode = "liquid" | "thin";
type Book = { asks: Level[]; bids: Level[] }; // asks ascending, bids descending

const CFG: Record<Mode, { step: number; sizeMin: number; sizeMax: number; extMin: number; extMax: number }> = {
  liquid: { step: 1, sizeMin: 300, sizeMax: 800, extMin: 100, extMax: 400 },
  thin: { step: 10, sizeMin: 40, sizeMax: 140, extMin: 30, extMax: 120 },
};
const DEPTH = 6;
const QTY = 100;
const START_CASH = 1_000_000; // $10,000
const START_SHARES = 200;

const rnd = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));

function freshBook(mode: Mode): Book {
  const { step, sizeMin, sizeMax } = CFG[mode];
  const mid = 2000; // $20.00
  const asks: Level[] = [];
  const bids: Level[] = [];
  for (let i = 0; i < DEPTH; i++) {
    asks.push({ p: mid + step * (i + 1), size: rnd(sizeMin, sizeMax), user: 0 });
    bids.push({ p: mid - step * (i + 1), size: rnd(sizeMin, sizeMax), user: 0 });
  }
  return { asks, bids };
}

const bestAsk = (b: Book) => b.asks[0]?.p ?? 0;
const bestBid = (b: Book) => b.bids[0]?.p ?? 0;
const midOf = (b: Book) => Math.round((bestAsk(b) + bestBid(b)) / 2);

type Sim = {
  mode: Mode;
  book: Book;
  cash: number;
  shares: number;
  toll: number; // cumulative cents paid crossing the spread (vs mid at order time)
  log: string[];
  initialEquity: number;
};

function freshSim(mode: Mode): Sim {
  const book = freshBook(mode);
  return { mode, book, cash: START_CASH, shares: START_SHARES, toll: 0, log: [], initialEquity: START_CASH + START_SHARES * midOf(book) };
}

// Walk one side of the book with a market order for `qty` PUBLIC shares (your own resting
// orders can't fill yourself). Returns filled qty + total cost; mutates the levels.
function walk(levels: Level[], qty: number): { filled: number; cost: number } {
  let filled = 0;
  let cost = 0;
  for (const lv of levels) {
    if (filled >= qty) break;
    const take = Math.min(lv.size, qty - filled);
    lv.size -= take;
    filled += take;
    cost += take * lv.p;
  }
  return { filled, cost };
}

// External flow walks public size FIRST, then your resting qty — you joined the back of the
// line (price-time priority, the honest version). Returns your fills for the ledger.
function walkExternal(levels: Level[], qty: number): { userFills: { p: number; q: number }[] } {
  let left = qty;
  const userFills: { p: number; q: number }[] = [];
  for (const lv of levels) {
    if (left <= 0) break;
    const pub = Math.min(lv.size, left);
    lv.size -= pub;
    left -= pub;
    if (left > 0 && lv.user > 0) {
      const u = Math.min(lv.user, left);
      lv.user -= u;
      left -= u;
      userFills.push({ p: lv.p, q: u });
    }
  }
  return { userFills };
}

function tidy(book: Book, mode: Mode) {
  const { step, sizeMin, sizeMax } = CFG[mode];
  book.asks = book.asks.filter((l) => l.size > 0 || l.user > 0);
  book.bids = book.bids.filter((l) => l.size > 0 || l.user > 0);
  // Market makers drift back in: if the spread has gapped past 2 steps, sometimes quote inside it.
  if (book.asks.length && book.bids.length && bestAsk(book) - bestBid(book) > 2 * step) {
    if (Math.random() < 0.7) book.asks.unshift({ p: bestAsk(book) - step, size: rnd(sizeMin, sizeMax), user: 0 });
    if (bestAsk(book) - bestBid(book) > 2 * step && Math.random() < 0.7)
      book.bids.unshift({ p: bestBid(book) + step, size: rnd(sizeMin, sizeMax), user: 0 });
  }
  // Keep the ladder DEPTH deep on both tails.
  while (book.asks.length < DEPTH) book.asks.push({ p: (book.asks[book.asks.length - 1]?.p ?? 2001) + step, size: rnd(sizeMin, sizeMax), user: 0 });
  while (book.bids.length < DEPTH) book.bids.push({ p: (book.bids[book.bids.length - 1]?.p ?? 1999) - step, size: rnd(sizeMin, sizeMax), user: 0 });
  book.asks = book.asks.slice(0, DEPTH + 2);
  book.bids = book.bids.slice(0, DEPTH + 2);
}

export default function OrderBookSim() {
  const [sim, setSim] = useState<Sim>(() => freshSim("liquid"));

  const update = (fn: (s: Sim) => Sim) => setSim((s) => fn(structuredClone(s)));
  const pushLog = (s: Sim, line: string) => {
    s.log = [line, ...s.log].slice(0, 6);
  };

  const marketOrder = (side: "buy" | "sell") =>
    update((s) => {
      const mid = midOf(s.book);
      const { filled, cost } = walk(side === "buy" ? s.book.asks : s.book.bids, QTY);
      if (filled === 0) return s;
      if (side === "buy" && cost > s.cash) {
        pushLog(s, "Not enough cash for a market buy.");
        return s;
      }
      if (side === "sell" && filled > s.shares - restingSellQty(s.book)) {
        pushLog(s, "Not enough free shares (some are reserved by your resting sells).");
        return s;
      }
      const avg = Math.round(cost / filled);
      const tollPaid = Math.abs(cost - filled * mid);
      s.toll += tollPaid;
      if (side === "buy") {
        s.cash -= cost;
        s.shares += filled;
      } else {
        s.cash += cost;
        s.shares -= filled;
      }
      pushLog(
        s,
        `Market ${side} ${filled} filled @ ${money(avg)} avg — ${money(tollPaid)} ${side === "buy" ? "above" : "below"} mid (the toll for “now”).${filled < QTY ? ` Only ${filled}/${QTY} available!` : ""}`,
      );
      tidy(s.book, s.mode);
      return s;
    });

  const restingBuyCents = (b: Book) => b.bids.reduce((n, l) => n + l.user * l.p, 0);
  const restingSellQty = (b: Book) => b.asks.reduce((n, l) => n + l.user, 0);

  const placeLimit = (side: "buy" | "sell", where: "join" | "inside") =>
    update((s) => {
      const step = CFG[s.mode].step;
      const p =
        side === "buy"
          ? where === "join"
            ? bestBid(s.book)
            : bestBid(s.book) + step
          : where === "join"
            ? bestAsk(s.book)
            : bestAsk(s.book) - step;
      if (side === "buy" && restingBuyCents(s.book) + p * QTY > s.cash) {
        pushLog(s, "Not enough cash to reserve for that limit buy.");
        return s;
      }
      if (side === "sell" && restingSellQty(s.book) + QTY > s.shares) {
        pushLog(s, "Not enough shares to back that limit sell.");
        return s;
      }
      const ladder = side === "buy" ? s.book.bids : s.book.asks;
      let lv = ladder.find((l) => l.p === p);
      if (!lv) {
        lv = { p, size: 0, user: 0 };
        ladder.push(lv);
        ladder.sort((a, b) => (side === "buy" ? b.p - a.p : a.p - b.p));
      }
      lv.user += QTY;
      pushLog(
        s,
        `Limit ${side} ${QTY} resting @ ${money(p)} — ${where === "join" ? `behind ${lv.size} shares already in line` : "alone at a better price for the other side"}. Now you wait.`,
      );
      return s;
    });

  const cancelResting = () =>
    update((s) => {
      let n = 0;
      for (const l of [...s.book.bids, ...s.book.asks]) {
        n += l.user;
        l.user = 0;
      }
      pushLog(s, n ? `Cancelled ${n} resting shares — the queue forgets you instantly.` : "Nothing resting to cancel.");
      tidy(s.book, s.mode);
      return s;
    });

  const step = () =>
    update((s) => {
      const { extMin, extMax } = CFG[s.mode];
      for (let i = 0; i < 3; i++) {
        const side = Math.random() < 0.5 ? "buy" : "sell";
        const q = rnd(extMin, extMax);
        const { userFills } = walkExternal(side === "buy" ? s.book.asks : s.book.bids, q);
        for (const f of userFills) {
          if (side === "buy") {
            // an external buyer lifted YOUR resting sell
            s.cash += f.q * f.p;
            s.shares -= f.q;
            pushLog(s, `Your limit sell filled: ${f.q} @ ${money(f.p)} — the market came to you. No toll.`);
          } else {
            s.cash -= f.q * f.p;
            s.shares += f.q;
            pushLog(s, `Your limit buy filled: ${f.q} @ ${money(f.p)} — the market came to you. No toll.`);
          }
        }
        tidy(s.book, s.mode);
      }
      return s;
    });

  const reset = (mode: Mode) => setSim(freshSim(mode));

  const { book } = sim;
  const mid = midOf(book);
  const spread = bestAsk(book) - bestBid(book);
  const equity = sim.cash + sim.shares * mid;
  const maxSize = Math.max(...book.asks.map((l) => l.size + l.user), ...book.bids.map((l) => l.size + l.user), 1);

  const row = (lv: Level, side: "ask" | "bid") => (
    <div key={`${side}-${lv.p}`} className="relative flex items-center justify-between gap-2 px-2 py-0.5 text-xs tabular-nums">
      <div
        className={`absolute inset-y-0 right-0 ${side === "ask" ? "bg-amber-400/10" : "bg-emerald-400/10"}`}
        style={{ width: `${Math.min(100, ((lv.size + lv.user) / maxSize) * 100)}%` }}
      />
      <span className={`relative font-mono ${side === "ask" ? "text-amber-300/90" : "text-emerald-300/90"}`}>{money(lv.p)}</span>
      <span className="relative flex items-center gap-1.5 text-teal-100/70">
        {lv.user > 0 ? (
          <span className="rounded-full border border-teal-400/40 bg-teal-400/15 px-1.5 text-[9px] font-bold uppercase tracking-wider text-teal-200">
            you {lv.user}
          </span>
        ) : null}
        {lv.size + lv.user}
      </span>
    </div>
  );

  return (
    <div className="mt-4 rounded-xl border border-teal-400/10 bg-teal-400/[0.02] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-teal-300/70">The toy exchange</div>
        <div className="flex items-center gap-1.5">
          {(["liquid", "thin"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => reset(m)}
              className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                sim.mode === m ? "border-teal-400/40 bg-teal-400/10 text-teal-100" : "border-teal-400/10 text-teal-300/60 hover:bg-teal-400/10"
              }`}
            >
              {m === "liquid" ? "Liquid stock" : "Thin stock"}
            </button>
          ))}
          <Button variant="ghost" onClick={() => reset(sim.mode)}>
            Reset
          </Button>
        </div>
      </div>

      <div className="mt-3 grid gap-4 sm:grid-cols-[minmax(0,240px)_1fr]">
        {/* The ladder — asks stacked above the spread, bids below. */}
        <div className="rounded-lg border border-teal-400/10">
          <div className="flex items-center justify-between px-2 py-1 text-[10px] uppercase tracking-wider text-amber-300/70">
            <span>Asks — sellers</span>
            <span>size</span>
          </div>
          <div>{[...book.asks.slice(0, DEPTH)].reverse().map((l) => row(l, "ask"))}</div>
          <div className="flex items-center justify-between border-y border-teal-400/15 bg-teal-400/[0.04] px-2 py-1 text-[10px] text-teal-200/60">
            <span>
              <Term k="bid-ask-spread">spread</Term> {money(spread)}
            </span>
            <span>mid {money(mid)}</span>
          </div>
          <div>{book.bids.slice(0, DEPTH).map((l) => row(l, "bid"))}</div>
          <div className="flex items-center justify-between px-2 py-1 text-[10px] uppercase tracking-wider text-emerald-300/70">
            <span>Bids — buyers</span>
            <span>size</span>
          </div>
        </div>

        <div className="min-w-0 space-y-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs tabular-nums text-teal-100/75 sm:grid-cols-3">
            <div>
              cash <span className="font-semibold text-teal-50">{money(sim.cash)}</span>
            </div>
            <div>
              shares <span className="font-semibold text-teal-50">{sim.shares}</span>
            </div>
            <div>
              P&L <Pnl cents={equity - sim.initialEquity} />
            </div>
            <div className="col-span-2 sm:col-span-3">
              spread toll paid <span className="font-semibold text-amber-300">{money(sim.toll)}</span>
              <span className="text-teal-200/40"> — what “fill me now” has cost you versus the mid</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Button onClick={() => marketOrder("buy")}>Market buy {QTY}</Button>
            <Button onClick={() => marketOrder("sell")}>Market sell {QTY}</Button>
            <Button variant="ghost" onClick={() => placeLimit("buy", "join")}>
              Limit buy · join {money(bestBid(book))}
            </Button>
            <Button variant="ghost" onClick={() => placeLimit("buy", "inside")}>
              Limit buy · inside {money(bestBid(book) + CFG[sim.mode].step)}
            </Button>
            <Button variant="ghost" onClick={() => placeLimit("sell", "join")}>
              Limit sell · join {money(bestAsk(book))}
            </Button>
            <Button variant="ghost" onClick={() => placeLimit("sell", "inside")}>
              Limit sell · inside {money(bestAsk(book) - CFG[sim.mode].step)}
            </Button>
            <Button variant="ghost" onClick={cancelResting}>
              Cancel resting
            </Button>
            <Button onClick={step}>Let the market trade ▸</Button>
          </div>

          {sim.log.length ? (
            <ul className="space-y-1 text-[11px] leading-relaxed text-teal-200/60">
              {sim.log.map((l, i) => (
                <li key={i} className={i === 0 ? "text-teal-100/80" : undefined}>
                  {l}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-teal-200/40">
              Try it: market-buy on the liquid stock, then flip to the thin one and do it again — watch the average fill and the toll. Then
              rest a limit order and let the market trade until it fills you (or doesn&apos;t).
            </p>
          )}
        </div>
      </div>

      <p className="mt-3 text-[10px] text-teal-200/35">
        A cartoon: real books run thousands of levels across a dozen venues with price-time priority in microseconds. The tolls, the queues,
        and the trade-offs are exactly the same.
      </p>
    </div>
  );
}
