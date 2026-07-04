import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePalette, F, type Palette } from '../../constants/theme';
import { money, signedMoney, pnlColor } from '../../lib/format';
import { useGlossary } from '../../store/glossary';

const tabular = { fontVariant: ['tabular-nums' as const] };

/** The toy exchange (web components/learn/OrderBookSim, D110 Phase 2) — a cartoon
 * limit-order book: two prices always exist, market orders cross the spread (and
 * slip in thin names), limit orders wait in line and may never fill. Pure client,
 * integer cents, whole shares — the sim LOGIC is the web's, verbatim. */

type Level = { p: number; size: number; user: number };
type Mode = 'liquid' | 'thin';
type Book = { asks: Level[]; bids: Level[] };

const CFG: Record<Mode, { step: number; sizeMin: number; sizeMax: number; extMin: number; extMax: number }> = {
  liquid: { step: 1, sizeMin: 300, sizeMax: 800, extMin: 100, extMax: 400 },
  thin: { step: 10, sizeMin: 40, sizeMax: 140, extMin: 30, extMax: 120 },
};
const DEPTH = 6;
const QTY = 100;
const START_CASH = 1_000_000;
const START_SHARES = 200;

const rnd = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));

function freshBook(mode: Mode): Book {
  const { step, sizeMin, sizeMax } = CFG[mode];
  const mid = 2000;
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

type Sim = { mode: Mode; book: Book; cash: number; shares: number; toll: number; log: string[]; initialEquity: number };

function freshSim(mode: Mode): Sim {
  const book = freshBook(mode);
  return { mode, book, cash: START_CASH, shares: START_SHARES, toll: 0, log: [], initialEquity: START_CASH + START_SHARES * midOf(book) };
}

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
  if (book.asks.length && book.bids.length && bestAsk(book) - bestBid(book) > 2 * step) {
    if (Math.random() < 0.7) book.asks.unshift({ p: bestAsk(book) - step, size: rnd(sizeMin, sizeMax), user: 0 });
    if (bestAsk(book) - bestBid(book) > 2 * step && Math.random() < 0.7)
      book.bids.unshift({ p: bestBid(book) + step, size: rnd(sizeMin, sizeMax), user: 0 });
  }
  while (book.asks.length < DEPTH) book.asks.push({ p: (book.asks[book.asks.length - 1]?.p ?? 2001) + step, size: rnd(sizeMin, sizeMax), user: 0 });
  while (book.bids.length < DEPTH) book.bids.push({ p: (book.bids[book.bids.length - 1]?.p ?? 1999) - step, size: rnd(sizeMin, sizeMax), user: 0 });
  book.asks = book.asks.slice(0, DEPTH + 2);
  book.bids = book.bids.slice(0, DEPTH + 2);
}

const clone = (s: Sim): Sim => JSON.parse(JSON.stringify(s)) as Sim;

export default function OrderBookSim() {
  const { p } = usePalette();
  const [sim, setSim] = useState<Sim>(() => freshSim('liquid'));

  const update = (fn: (s: Sim) => Sim) => setSim((s) => fn(clone(s)));
  const pushLog = (s: Sim, line: string) => {
    s.log = [line, ...s.log].slice(0, 5);
  };
  const restingBuyCents = (b: Book) => b.bids.reduce((n, l) => n + l.user * l.p, 0);
  const restingSellQty = (b: Book) => b.asks.reduce((n, l) => n + l.user, 0);

  const marketOrder = (side: 'buy' | 'sell') =>
    update((s) => {
      const mid = midOf(s.book);
      const { filled, cost } = walk(side === 'buy' ? s.book.asks : s.book.bids, QTY);
      if (filled === 0) return s;
      if (side === 'buy' && cost > s.cash) {
        pushLog(s, 'Not enough cash for a market buy.');
        return s;
      }
      if (side === 'sell' && filled > s.shares - restingSellQty(s.book)) {
        pushLog(s, 'Not enough free shares (some are reserved by your resting sells).');
        return s;
      }
      const avg = Math.round(cost / filled);
      const tollPaid = Math.abs(cost - filled * mid);
      s.toll += tollPaid;
      if (side === 'buy') {
        s.cash -= cost;
        s.shares += filled;
      } else {
        s.cash += cost;
        s.shares -= filled;
      }
      pushLog(
        s,
        `Market ${side} ${filled} filled @ ${money(avg)} avg — ${money(tollPaid)} ${side === 'buy' ? 'above' : 'below'} mid (the toll for “now”).${filled < QTY ? ` Only ${filled}/${QTY} available!` : ''}`,
      );
      tidy(s.book, s.mode);
      return s;
    });

  const placeLimit = (side: 'buy' | 'sell', where: 'join' | 'inside') =>
    update((s) => {
      const step = CFG[s.mode].step;
      const price =
        side === 'buy'
          ? where === 'join'
            ? bestBid(s.book)
            : bestBid(s.book) + step
          : where === 'join'
            ? bestAsk(s.book)
            : bestAsk(s.book) - step;
      if (side === 'buy' && restingBuyCents(s.book) + price * QTY > s.cash) {
        pushLog(s, 'Not enough cash to reserve for that limit buy.');
        return s;
      }
      if (side === 'sell' && restingSellQty(s.book) + QTY > s.shares) {
        pushLog(s, 'Not enough shares to back that limit sell.');
        return s;
      }
      const ladder = side === 'buy' ? s.book.bids : s.book.asks;
      let lv = ladder.find((l) => l.p === price);
      if (!lv) {
        lv = { p: price, size: 0, user: 0 };
        ladder.push(lv);
        ladder.sort((a, b) => (side === 'buy' ? b.p - a.p : a.p - b.p));
      }
      lv.user += QTY;
      pushLog(
        s,
        `Limit ${side} ${QTY} resting @ ${money(price)} — ${where === 'join' ? `behind ${lv.size} shares already in line` : 'alone at a better price for the other side'}. Now you wait.`,
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
      pushLog(s, n ? `Cancelled ${n} resting shares — the queue forgets you instantly.` : 'Nothing resting to cancel.');
      tidy(s.book, s.mode);
      return s;
    });

  const step = () =>
    update((s) => {
      const { extMin, extMax } = CFG[s.mode];
      for (let i = 0; i < 3; i++) {
        const side = Math.random() < 0.5 ? 'buy' : 'sell';
        const q = rnd(extMin, extMax);
        const { userFills } = walkExternal(side === 'buy' ? s.book.asks : s.book.bids, q);
        for (const f of userFills) {
          if (side === 'buy') {
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

  const { book } = sim;
  const mid = midOf(book);
  const spread = bestAsk(book) - bestBid(book);
  const equity = sim.cash + sim.shares * mid;
  const maxSize = Math.max(...book.asks.map((l) => l.size + l.user), ...book.bids.map((l) => l.size + l.user), 1);

  const Row = ({ lv, side }: { lv: Level; side: 'ask' | 'bid' }) => {
    const c = side === 'ask' ? p.warn : p.pos;
    return (
      <View style={s2.levelRow}>
        <View style={[s2.depth, { backgroundColor: c + '1a', width: `${Math.min(100, ((lv.size + lv.user) / maxSize) * 100)}%` }]} />
        <Text style={[s2.levelPrice, tabular, { color: c }]}>{money(lv.p)}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginLeft: 'auto' }}>
          {lv.user > 0 && (
            <Text style={[s2.youPill, { color: p.accentText, borderColor: p.accent + '66', backgroundColor: p.accent + '26' }]}>
              you {lv.user}
            </Text>
          )}
          <Text style={[s2.levelSize, tabular, { color: p.textMuted }]}>{lv.size + lv.user}</Text>
        </View>
      </View>
    );
  };

  const Btn = ({ label, onPress, tone }: { label: string; onPress: () => void; tone?: string }) => (
    <Pressable onPress={onPress} style={[s2.btn, { backgroundColor: (tone ?? p.accent) + '1f', borderColor: (tone ?? p.accent) + '55' }]}>
      <Text style={[s2.btnText, { color: tone ?? p.accentText }]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={[s2.box, { borderColor: p.cardBorder, backgroundColor: p.cardHi + '33' }]}>
      <View style={s2.headRow}>
        <Text style={[s2.title, { color: p.accentText }]}>THE TOY EXCHANGE</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {(['liquid', 'thin'] as Mode[]).map((m) => (
            <Pressable
              key={m}
              onPress={() => setSim(freshSim(m))}
              style={[s2.modeChip, { borderColor: sim.mode === m ? p.accent + '88' : p.cardBorder, backgroundColor: sim.mode === m ? p.accent + '26' : 'transparent' }]}
            >
              <Text style={{ color: sim.mode === m ? p.accentText : p.textMuted, fontFamily: F.semi, fontSize: 10.5 }}>
                {m === 'liquid' ? 'Liquid' : 'Thin'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* the ladder */}
      <View style={[s2.ladder, { borderColor: p.cardBorder }]}>
        <Text style={[s2.sideLabel, { color: p.warn }]}>ASKS — SELLERS</Text>
        {[...book.asks.slice(0, DEPTH)].reverse().map((lv) => (
          <Row key={`a-${lv.p}`} lv={lv} side="ask" />
        ))}
        <View style={[s2.midRow, { borderColor: p.cardBorder, backgroundColor: p.cardHi }]}>
          <Text onPress={() => useGlossary.getState().open('bid-ask-spread')} style={[s2.midText, tabular, { color: p.accentText, textDecorationLine: 'underline', textDecorationStyle: 'dotted' }]}>
            spread {money(spread)}
          </Text>
          <Text style={[s2.midText, tabular, { color: p.textMuted }]}>mid {money(mid)}</Text>
        </View>
        {book.bids.slice(0, DEPTH).map((lv) => (
          <Row key={`b-${lv.p}`} lv={lv} side="bid" />
        ))}
        <Text style={[s2.sideLabel, { color: p.pos }]}>BIDS — BUYERS</Text>
      </View>

      {/* the ledger */}
      <View style={s2.ledgerRow}>
        <Text style={[s2.ledger, tabular, { color: p.textMuted }]}>
          cash <Text style={{ color: p.textPrimary, fontFamily: F.semi }}>{money(sim.cash)}</Text> · shares{' '}
          <Text style={{ color: p.textPrimary, fontFamily: F.semi }}>{sim.shares}</Text> · P&L{' '}
          <Text style={{ color: pnlColor(equity - sim.initialEquity, p), fontFamily: F.semi }}>{signedMoney(equity - sim.initialEquity)}</Text>
        </Text>
        <Text style={[s2.ledger, tabular, { color: p.textMuted }]}>
          spread toll paid <Text style={{ color: p.warn, fontFamily: F.semi }}>{money(sim.toll)}</Text> — what “fill me now” has
          cost you versus the mid
        </Text>
      </View>

      {/* the controls */}
      <View style={s2.btnWrap}>
        <Btn label={`Market buy ${QTY}`} onPress={() => marketOrder('buy')} tone={p.pos} />
        <Btn label={`Market sell ${QTY}`} onPress={() => marketOrder('sell')} tone={p.warn} />
        <Btn label={`Limit buy · join ${money(bestBid(book))}`} onPress={() => placeLimit('buy', 'join')} />
        <Btn label={`Limit buy · inside ${money(bestBid(book) + CFG[sim.mode].step)}`} onPress={() => placeLimit('buy', 'inside')} />
        <Btn label={`Limit sell · join ${money(bestAsk(book))}`} onPress={() => placeLimit('sell', 'join')} />
        <Btn label={`Limit sell · inside ${money(bestAsk(book) - CFG[sim.mode].step)}`} onPress={() => placeLimit('sell', 'inside')} />
        <Btn label="Cancel resting" onPress={cancelResting} />
        <Btn label="Let the market trade ▸" onPress={step} />
      </View>

      {sim.log.length ? (
        <View style={{ gap: 3, marginTop: 8 }}>
          {sim.log.map((l, i) => (
            <Text key={i} style={[s2.logLine, { color: i === 0 ? p.textPrimary : p.textMuted }]}>
              {l}
            </Text>
          ))}
        </View>
      ) : (
        <Text style={[s2.logLine, { color: p.textMuted, marginTop: 8 }]}>
          Try it: market-buy on the liquid stock, then flip to the thin one and do it again — watch the average
          fill and the toll. Then rest a limit order and let the market trade until it fills you (or doesn&apos;t).
        </Text>
      )}

      <Text style={[s2.foot, { color: p.textMuted }]}>
        A cartoon: real books run thousands of levels across a dozen venues with price-time priority in
        microseconds. The tolls, the queues, and the trade-offs are exactly the same.
      </Text>
    </View>
  );
}

const s2 = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 12 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { fontFamily: F.bold, fontSize: 9.5, letterSpacing: 1.5 },
  modeChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  ladder: { borderWidth: 1, borderRadius: 10, marginTop: 10, overflow: 'hidden' },
  sideLabel: { fontFamily: F.semi, fontSize: 8, letterSpacing: 1, paddingHorizontal: 8, paddingVertical: 4 },
  levelRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 2.5, overflow: 'hidden' },
  depth: { position: 'absolute', right: 0, top: 0, bottom: 0 },
  levelPrice: { fontFamily: F.semi, fontSize: 11.5 },
  levelSize: { fontFamily: F.reg, fontSize: 11 },
  youPill: {
    fontFamily: F.bold,
    fontSize: 8,
    letterSpacing: 0.5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 5,
    paddingVertical: 0.5,
    overflow: 'hidden',
  },
  midRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderBottomWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  midText: { fontFamily: F.semi, fontSize: 10.5 },
  ledgerRow: { gap: 3, marginTop: 10 },
  ledger: { fontFamily: F.reg, fontSize: 11, lineHeight: 16 },
  btnWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  btn: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 6 },
  btnText: { fontFamily: F.semi, fontSize: 10.5 },
  logLine: { fontFamily: F.reg, fontSize: 10.5, lineHeight: 15 },
  foot: { fontFamily: F.reg, fontSize: 9.5, lineHeight: 13, marginTop: 10 },
});
