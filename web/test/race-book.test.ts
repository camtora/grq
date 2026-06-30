import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { replayBook } from "@/lib/race/book";
import type { ShadowRow } from "@/lib/race/standings";

let _id = 0;
// Build a minimal ShadowRow — replayBook only reads action, symbol, qty, entry price/ccy, sessionAt.
function row(p: Partial<ShadowRow> & { sessionAt: Date }): ShadowRow {
  return {
    id: ++_id,
    sessionKind: "checkin",
    label: "",
    reason: "",
    model: "test",
    role: "challenger",
    text: "",
    action: null,
    symbol: null,
    qty: null,
    confidence: null,
    thesis: null,
    entryPriceCents: null,
    entryCurrency: "CAD",
    ...p,
  };
}
const D = (s: string) => new Date(s);
const CAD = (sym: string, cents: number) => new Map([[sym, cents]]);

describe("replayBook — the bounded virtual book (D90)", () => {
  it("re-proposing a held name is a no-op: 10 + 649 TSM stays 10, never 659", () => {
    const stake = 5_000_000; // $50k
    const rows: ShadowRow[] = [
      row({ sessionAt: D("2026-06-01"), action: "BUY", symbol: "TSM", qty: 10, entryPriceCents: 43000 }),
      row({ sessionAt: D("2026-06-02"), action: "BUY", symbol: "TSM", qty: 649, entryPriceCents: 43000 }),
    ];
    const book = replayBook(rows, CAD("TSM", 43000), null, stake);
    assert.equal(book.positions.length, 1);
    assert.equal(book.positions[0].symbol, "TSM");
    assert.equal(book.positions[0].qty, 10); // NOT 659 — the phantom this fix kills
    assert.ok(book.navCadCents <= stake, "re-proposing must not inflate NAV past the stake");
  });

  it("caps a BUY to the cash on hand — the book can never exceed the stake", () => {
    const stake = 500_000; // $5k, 1000 shares @ $430 is unaffordable
    const rows = [row({ sessionAt: D("2026-06-01"), action: "BUY", symbol: "AAA", qty: 1000, entryPriceCents: 43000 })];
    const book = replayBook(rows, CAD("AAA", 43000), null, stake);
    assert.equal(book.positions.length, 1);
    assert.ok(book.positions[0].qty >= 1 && book.positions[0].qty <= 11);
    assert.ok(book.cashCents >= 0, "cash must never go negative");
    assert.ok(book.navCadCents <= stake);
  });

  it("ignores a SELL of an unheld name (no shorting)", () => {
    const stake = 1_000_000;
    const rows = [row({ sessionAt: D("2026-06-01"), action: "SELL", symbol: "BBB", qty: 5, entryPriceCents: 10000 })];
    const book = replayBook(rows, new Map(), null, stake);
    assert.equal(book.positions.length, 0);
    assert.equal(book.cashCents, stake); // untouched — no phantom short proceeds
    assert.equal(book.navCadCents, stake);
  });

  it("a SELL of a held name returns proceeds to cash and closes the position", () => {
    const stake = 1_000_000;
    const rows = [
      row({ sessionAt: D("2026-06-01"), action: "BUY", symbol: "CCC", qty: 10, entryPriceCents: 10000 }),
      row({ sessionAt: D("2026-06-02"), action: "SELL", symbol: "CCC", qty: 10, entryPriceCents: 12000 }),
    ];
    const book = replayBook(rows, new Map(), null, stake);
    assert.equal(book.positions.length, 0);
    assert.ok(book.cashCents > stake - 1000, "sold higher than bought → cash above stake, minus commissions");
    assert.equal(book.navCadCents, book.cashCents); // nothing left to mark
  });

  it("replays in chronological order regardless of input order", () => {
    const stake = 1_000_000;
    // The SELL is listed first but dated AFTER the BUY — it must apply second, closing the position.
    const rows = [
      row({ sessionAt: D("2026-06-05"), action: "SELL", symbol: "DDD", qty: 10, entryPriceCents: 11000 }),
      row({ sessionAt: D("2026-06-01"), action: "BUY", symbol: "DDD", qty: 10, entryPriceCents: 10000 }),
    ];
    const book = replayBook(rows, new Map(), null, stake);
    assert.equal(book.positions.length, 0); // buy → sell, fully closed (not an ignored early sell)
  });

  it("marks positions to the live quote and falls back to ACB when unmarked", () => {
    const stake = 1_000_000;
    const rows = [row({ sessionAt: D("2026-06-01"), action: "BUY", symbol: "EEE", qty: 10, entryPriceCents: 10000 })];
    const marked = replayBook(rows, CAD("EEE", 12000), null, stake); // +20%
    const unmarked = replayBook(rows, new Map(), null, stake); // no quote → cost basis
    assert.ok(marked.navCadCents > unmarked.navCadCents);
    assert.ok(marked.positions[0].pnlCadCents > 0);
    assert.equal(unmarked.navCadCents, stake); // valued at cost → NAV back to stake
  });
});
