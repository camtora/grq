import { toCadCents } from "@/lib/fx";
import { ibkrFixedCommissionCents } from "@/lib/broker/sim";
import type { ShadowRow } from "./standings";

// The shadow virtual book (D68) — replays one model's chronological BUY/SELL calls through a FIXED
// virtual portfolio so the /race tiles show a bounded, honest book instead of a naive sum of every
// share-qty the model ever blurted. That naive sum let a model "hold" 659 TSM ≈ $250k on what is
// meant to be a $50k account (10 + 649 from two separate BUY calls). Read-time only: no schema, no
// fills, no §6 gate — the real money lives behind the gate in sim.ts and never touches this.
//
// Rules (deliberately simple; Bull-Race-flavoured, no shorting):
//   • Start with `stakeCents` in cash (CAD board — USD calls convert at the BoC rate).
//   • BUY a NEW name: spend up to available cash — if the requested qty costs more than the cash on
//     hand, the qty is capped so the order just fits (commission included, sim.ts parity). The book
//     can never exceed the stake.
//   • BUY a name already HELD: no-op. A re-proposed buy is the model re-stating conviction at the
//     next check-in, not a fresh purchase — this is what stops 10 + 649 TSM accreting to 659.
//   • SELL a held name: close min(qty, held) at the call price; proceeds (less commission) return to
//     cash. SELL of an unheld name is ignored (no shorting).
//   • NAV = cash + Σ(positions marked to the live quote, falling back to ACB). P&L = NAV − stake.

export type BookPosition = {
  symbol: string;
  qty: number;
  avgPriceCents: number; // native ACB per share (commission folded in)
  currency: string | null;
  marketValueCadCents: number;
  pnlCadCents: number; // unrealized, CAD
};

export type Book = {
  cashCents: number; // CAD
  positions: BookPosition[];
  navCadCents: number;
  pnlCadCents: number; // NAV − stake (realized, baked into cash, + unrealized)
  spark: number[]; // running (NAV − stake) after each call, CAD — a marked-to-now equity curve
};

type Held = { qty: number; costNativeCents: number; currency: string | null };

/** Replay a single model's decision rows (already filtered to BUY/SELL-bearing sessions) into a
 *  bounded virtual book. `marks` maps UPPERCASE symbol → live native-ccy cents. */
export function replayBook(rows: ShadowRow[], marks: Map<string, number>, fx: number | null, stakeCents: number): Book {
  let cash = stakeCents;
  const held = new Map<string, Held>();

  const markFor = (sym: string, fallbackNative: number) => {
    const m = marks.get(sym.toUpperCase());
    return m && m > 0 ? m : fallbackNative;
  };
  const runningPnl = () => {
    let posCad = 0;
    for (const [sym, p] of held) posCad += toCadCents(p.qty * markFor(sym, Math.round(p.costNativeCents / p.qty)), p.currency, fx);
    return cash + posCad - stakeCents;
  };

  const spark: number[] = [];
  const sorted = [...rows].sort((a, b) => a.sessionAt.getTime() - b.sessionAt.getTime());
  for (const r of sorted) {
    const sym = r.symbol ? r.symbol.toUpperCase() : null;
    const price = r.entryPriceCents;
    const ccy = r.entryCurrency;

    if (r.action === "BUY" && sym && price != null && price > 0 && r.qty != null && r.qty > 0) {
      if (!held.has(sym)) {
        // Cap the qty so the (commission-inclusive) cost fits available cash.
        let qty = r.qty;
        if (toCadCents(qty * price + ibkrFixedCommissionCents(qty, price), ccy, fx) > cash) {
          const perShareCad = toCadCents(price, ccy, fx);
          qty = perShareCad > 0 ? Math.floor(cash / perShareCad) : 0;
          while (qty > 0 && toCadCents(qty * price + ibkrFixedCommissionCents(qty, price), ccy, fx) > cash) qty--;
        }
        if (qty > 0) {
          const grossNative = qty * price + ibkrFixedCommissionCents(qty, price);
          cash -= toCadCents(grossNative, ccy, fx);
          held.set(sym, { qty, costNativeCents: grossNative, currency: ccy });
        }
      }
      // else: already held → no-op (re-proposed conviction, not a new buy)
    } else if (r.action === "SELL" && sym && price != null && price > 0) {
      const p = held.get(sym);
      if (p) {
        const sellQty = r.qty != null && r.qty > 0 ? Math.min(r.qty, p.qty) : p.qty;
        const comm = ibkrFixedCommissionCents(sellQty, price);
        cash += toCadCents(sellQty * price - comm, p.currency, fx);
        const remaining = p.qty - sellQty;
        if (remaining <= 0) held.delete(sym);
        else held.set(sym, { qty: remaining, costNativeCents: Math.round(p.costNativeCents / p.qty) * remaining, currency: p.currency });
      }
      // else: no position → ignore (no shorting)
    }
    spark.push(runningPnl());
  }

  const positions: BookPosition[] = [...held.entries()].map(([symbol, p]) => {
    const marketValueCadCents = toCadCents(p.qty * markFor(symbol, Math.round(p.costNativeCents / p.qty)), p.currency, fx);
    return {
      symbol,
      qty: p.qty,
      avgPriceCents: Math.round(p.costNativeCents / p.qty),
      currency: p.currency,
      marketValueCadCents,
      pnlCadCents: marketValueCadCents - toCadCents(p.costNativeCents, p.currency, fx),
    };
  });

  const navCadCents = cash + positions.reduce((s, p) => s + p.marketValueCadCents, 0);
  return { cashCents: cash, positions, navCadCents, pnlCadCents: navCadCents - stakeCents, spark };
}
