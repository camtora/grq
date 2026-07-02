import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buyFillCents, sellFillCents, spreadCostCents, equityCents, sellRealizedCents, newAvgCostCents, bottomLineCents } from "@/lib/day/mechanics";
import { ibkrFixedCommissionCents } from "@/lib/broker/sim";

// All cents / whole shares. Educational, modeled — the fund can't day-trade (§6). These lock the drag
// math that makes the "day-trade vs buy-and-hold" lesson honest (docs/DAY-TRADE-LAB.md).

describe("fills cross the spread", () => {
  it("buys at the ask, sells at the bid", () => {
    assert.equal(buyFillCents(10050, 10025), 10050); // ask
    assert.equal(sellFillCents(10000, 10025), 10000); // bid
  });
  it("falls back to mid when a side is missing", () => {
    assert.equal(buyFillCents(0, 10025), 10025);
    assert.equal(sellFillCents(0, 10025), 10025);
  });
  it("spread cost is |fill − mid| × shares, never negative", () => {
    assert.equal(spreadCostCents(10050, 10025, 100), 2500); // 25¢ × 100 = $25
    assert.equal(spreadCostCents(10025, 10025, 100), 0);
  });
});

describe("equity + avg cost", () => {
  it("equity = cash + shares × mid", () => {
    assert.equal(equityCents(500000, 50, 10025), 500000 + 50 * 10025);
  });
  it("weighted average cost blends fills", () => {
    assert.equal(newAvgCostCents(100, 10000, 100, 11000), 10500);
    assert.equal(newAvgCostCents(0, 0, 50, 9800), 9800); // first buy
  });
});

describe("the drag: churning loses to holding, all else equal", () => {
  // Stock dead flat all day: bid 99.90 / mid 100.00 / ask 100.10. Both start with $25,000.
  const START = 2_500_000;
  const bid = 9990, mid = 10000, ask = 10010;

  it("the Holder (buy once, hold) is only down its single entry spread + commission", () => {
    const shares = 100;
    const buyC = ibkrFixedCommissionCents(shares, ask);
    const holderCash = START - (shares * ask + buyC);
    const holderEquity = equityCents(holderCash, shares, mid);
    const holderPL = bottomLineCents(holderEquity, START);
    // paid the ask (10010) but marks at mid (10000): −$10 spread on 100 sh − commission
    assert.ok(holderPL < 0 && holderPL >= -(1000 + buyC + 5), `holder ${holderPL}`);
  });

  it("a Trader who round-trips 3× on the flat stock bleeds far more (spread + 6 commissions)", () => {
    const shares = 100;
    let cash = START;
    let fees = 0;
    // 3 round trips: buy@ask, sell@bid, each way a commission. Flat stock → no directional P&L.
    for (let i = 0; i < 3; i++) {
      const buyC = ibkrFixedCommissionCents(shares, ask);
      cash -= shares * ask + buyC;
      fees += buyC;
      const sellC = ibkrFixedCommissionCents(shares, bid);
      cash += shares * bid - sellC;
      fees += sellC;
    }
    const traderEquity = equityCents(cash, 0, mid); // flat at end
    const traderPL = bottomLineCents(traderEquity, START);
    // each round trip loses the full spread (ask−bid=20¢ ×100 = $20) + 2 commissions
    assert.ok(traderPL < 0, `trader ${traderPL}`);
    assert.ok(fees >= 6 * 100, "paid at least 6 commissions"); // ≥ $1 min each
    // and the Trader is worse off than a Holder on the identical flat tape
    const holderCash = START - (shares * ask + ibkrFixedCommissionCents(shares, ask));
    const holderPL = bottomLineCents(equityCents(holderCash, shares, mid), START);
    assert.ok(traderPL < holderPL, `trader ${traderPL} should trail holder ${holderPL}`);
  });
});

describe("realized P&L on a sell nets the commission", () => {
  it("sell 100 @ bid 110 from avg 100, minus commission", () => {
    const c = ibkrFixedCommissionCents(100, 11000);
    assert.equal(sellRealizedCents(100, 10000, 11000, c), 100 * (11000 - 10000) - c);
  });
});
