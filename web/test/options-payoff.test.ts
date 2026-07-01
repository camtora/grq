import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pnlAt, payoffStats, netDebitCents, breakevensCents, reservedCashCents, type Leg } from "@/lib/options/payoff";
import { bsGreeks, netGreeks } from "@/lib/options/greeks";
import { probAbove, probOfProfit } from "@/lib/options/probability";
import { STRATEGIES, buildStrategyLegs, seedLegs, optionTemplates, type LegValue } from "@/lib/options/strategies";

// All cents. Educational/modeled engine — these lock the payoff + greeks + probability math and the
// strategy-leg builder (docs/OPTIONS-PORTAL.md).
const near = (a: number, b: number, tol = 25) => assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);
const build = (key: keyof typeof STRATEGIES, base: { spotCents: number; ivFrac: number; dte: number; contracts: number }, legs: LegValue[]) =>
  buildStrategyLegs(STRATEGIES[key], { ...base, legs });
const B = { ivFrac: 0.4, dte: 45, contracts: 1 };

describe("long call payoff", () => {
  const legs = build("long-call", { spotCents: 10000, ...B }, [{ strikeCents: 10500, premiumCents: 300 }]);
  it("loses exactly the premium below the strike at expiry", () => {
    assert.equal(pnlAt(legs, 10000, 0), -30000); // -$3.00 × 100
    assert.equal(pnlAt(legs, 9000, 0), -30000);
  });
  it("pays intrinsic minus premium above the strike", () => {
    assert.equal(pnlAt(legs, 11000, 0), 20000); // ($5.00 − $3.00) × 100 = +$200
  });
  it("breaks even at strike + premium", () => {
    const be = breakevensCents(legs, 10000);
    assert.equal(be.length, 1);
    near(be[0], 10800);
  });
  it("has defined max loss (premium) and unlimited max profit", () => {
    const s = payoffStats(legs, 10000);
    assert.equal(s.maxLossCents, -30000);
    assert.equal(s.maxProfitCents, null);
    assert.equal(s.netDebitCents, 30000); // a debit
  });
});

describe("long put payoff", () => {
  const legs = build("long-put", { spotCents: 10000, ...B }, [{ strikeCents: 9500, premiumCents: 300 }]);
  it("breaks even at strike − premium", () => near(breakevensCents(legs, 10000)[0], 9200));
  it("max profit is (strike − premium) at spot 0, max loss is the premium", () => {
    const s = payoffStats(legs, 10000);
    assert.equal(s.maxLossCents, -30000);
    assert.equal(s.maxProfitCents, 920000); // ($95 − $3) × 100
  });
});

describe("covered call caps upside", () => {
  const legs = build("covered-call", { spotCents: 10000, ...B }, [{ strikeCents: 11000, premiumCents: 200 }]);
  it("net debit = stock cost − premium received", () => {
    assert.equal(netDebitCents(legs), 10000 * 100 - 200 * 100); // $10,000 − $200 = $9,800
  });
  it("profit is capped at (strike − spot + premium); upside is bounded", () => {
    const s = payoffStats(legs, 10000);
    assert.equal(s.maxProfitCents, 120000); // ($110−$100+$2)×100
    assert.notEqual(s.maxProfitCents, null);
    assert.equal(pnlAt(legs, 13000, 0), 120000); // still capped far above the strike
  });
});

describe("cash-secured put", () => {
  const legs = build("cash-secured-put", { spotCents: 10000, ...B }, [{ strikeCents: 9500, premiumCents: 250 }]);
  it("max profit is the premium; reserved cash is strike × 100", () => {
    const s = payoffStats(legs, 10000);
    assert.equal(s.maxProfitCents, 25000);
    assert.equal(s.netDebitCents, -25000); // a credit
    assert.equal(reservedCashCents(legs), 9500 * 100);
  });
});

describe("multi-leg: bull call spread", () => {
  // Buy $100 call @ $4.00, sell $108 call @ $1.50 → net debit $2.50.
  const legs = build("bull-call-spread", { spotCents: 10000, ...B }, [
    { strikeCents: 10000, premiumCents: 400 },
    { strikeCents: 10800, premiumCents: 150 },
  ]);
  it("builds two option legs (buy + sell call)", () => {
    assert.equal(legs.length, 2);
    assert.deepEqual(legs.map((l) => (l as { action: string }).action), ["BUY", "SELL"]);
  });
  it("net debit and defined, bounded reward", () => {
    const s = payoffStats(legs, 10000);
    assert.equal(s.netDebitCents, 25000); // ($4.00 − $1.50) × 100
    assert.equal(s.maxLossCents, -25000); // lose the net debit below the long strike
    assert.equal(s.maxProfitCents, 55000); // ($8 gap − $2.50) × 100, capped above the short strike
    near(breakevensCents(legs, 10000)[0], 10250); // long strike + net debit
  });
});

describe("multi-leg: long straddle wins on a big move either way", () => {
  const legs = build("long-straddle", { spotCents: 10000, ...B }, [
    { strikeCents: 10000, premiumCents: 350 }, // call
    { strikeCents: 10000, premiumCents: 330 }, // put
  ]);
  it("has two break-evens straddling the strike, max loss = both premiums", () => {
    const be = breakevensCents(legs, 10000);
    assert.equal(be.length, 2);
    near(be[0], 10000 - 680); // strike − total premium
    near(be[1], 10000 + 680); // strike + total premium
    assert.equal(payoffStats(legs, 10000).maxLossCents, -68000); // both premiums at the strike
  });
});

describe("seedLegs", () => {
  it("seeds one value per option leg with a positive premium", () => {
    const seeded = seedLegs(STRATEGIES["bull-call-spread"], 10000, 0.4, 45);
    assert.equal(seeded.length, optionTemplates(STRATEGIES["bull-call-spread"]).length);
    assert.ok(seeded.every((v) => v.premiumCents > 0 && v.strikeCents > 0));
    assert.ok(seeded[1].strikeCents > seeded[0].strikeCents); // short call above the long call
  });
});

describe("Black-Scholes greeks sanity", () => {
  it("an ATM call has delta near 0.5, positive gamma/vega, negative theta", () => {
    const g = bsGreeks("CALL", 10000, 10000, 0.4, 45 / 365);
    assert.ok(g.delta > 0.45 && g.delta < 0.65, `delta ${g.delta}`);
    assert.ok(g.gamma > 0 && g.vega > 0 && g.theta < 0);
  });
  it("an ATM put delta is roughly call delta − 1 (negative)", () => {
    const c = bsGreeks("CALL", 10000, 10000, 0.4, 45 / 365);
    const p = bsGreeks("PUT", 10000, 10000, 0.4, 45 / 365);
    near(Math.round((p.delta - (c.delta - 1)) * 1000), 0, 5);
  });
  it("at/after expiry collapses to the intrinsic step (no NaNs)", () => {
    const g = bsGreeks("CALL", 11000, 10000, 0.4, 0);
    assert.equal(g.delta, 1);
    assert.equal(g.gamma, 0);
  });
  it("net position delta of one long call is positive share-equivalent", () => {
    const net = netGreeks([{ kind: "CALL", action: "BUY", qty: 1, strikeCents: 10000, multiplier: 100, ivFrac: 0.4, daysLeft: 45 }], 10000);
    assert.ok(net.delta > 40 && net.delta < 70, `net delta ${net.delta}`);
  });
});

describe("lognormal probabilities", () => {
  it("P(≥) is ~0.5 at the money, higher below spot, lower above", () => {
    const atm = probAbove(10000, 10000, 0.4, 45 / 365);
    assert.ok(atm > 0.4 && atm < 0.5, `atm ${atm}`);
    assert.ok(probAbove(10000, 8000, 0.4, 45 / 365) > atm);
    assert.ok(probAbove(10000, 12000, 0.4, 45 / 365) < atm);
  });
  it("at zero time it's a hard step at spot", () => {
    assert.equal(probAbove(10000, 9000, 0.4, 0), 1);
    assert.equal(probAbove(10000, 11000, 0.4, 0), 0);
  });
  it("a long call needing a big up-move has prob-of-profit well under 50%", () => {
    const legs = build("long-call", { spotCents: 10000, ...B }, [{ strikeCents: 10500, premiumCents: 300 }]);
    const pop = probOfProfit(legs, 10000, 0.4, 45 / 365);
    assert.ok(pop > 0.1 && pop < 0.45, `pop ${pop}`);
  });
  it("a cash-secured put profits unless the stock drops past break-even (>50%)", () => {
    const legs = build("cash-secured-put", { spotCents: 10000, ...B }, [{ strikeCents: 9500, premiumCents: 250 }]);
    assert.ok(probOfProfit(legs, 10000, 0.4, 45 / 365) > 0.5);
  });
});

describe("mixed legs", () => {
  it("covered call = long 100 shares × contracts + short call", () => {
    const legs: Leg[] = build("covered-call", { spotCents: 5000, ivFrac: 0.3, dte: 30, contracts: 2 }, [{ strikeCents: 5500, premiumCents: 100 }]);
    assert.equal(legs.length, 2);
    const stock = legs.find((l) => l.kind === "STOCK");
    assert.ok(stock && stock.kind === "STOCK" && stock.qty === 200);
  });
});
