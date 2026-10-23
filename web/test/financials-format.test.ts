// D140 — financials display formatting (lib/financials/format.ts).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bigMoney, signedBigMoney, epsMoney, growthText, bpsText, ptsText, currencySymbol, nmReason } from "../lib/financials/format";

describe("currency follows the house rule (D24)", () => {
  it("CAD is bare, others carry their own symbol", () => {
    assert.equal(currencySymbol("CAD"), "$");
    assert.equal(currencySymbol("USD"), "US$");
    assert.equal(currencySymbol("EUR"), "€");
    assert.equal(currencySymbol("TWD"), "NT$");
    assert.equal(currencySymbol(null), "$");
  });
});

describe("compact money", () => {
  it("three significant figures, at most one decimal", () => {
    assert.equal(bigMoney(30296900000000, "USD"), "US$303B"); // NVDA TTM revenue
    assert.equal(bigMoney(9622100000000, "USD"), "US$96.2B");
    assert.equal(bigMoney(34400000000, "CAD"), "$344M");
    assert.equal(bigMoney(494400000000000, "TWD"), "NT$4.9T");
    assert.equal(bigMoney(500000000, "CAD"), "$5M");
    assert.equal(bigMoney(-410000000, "USD"), "−US$4.1M");
    assert.equal(bigMoney(null, "USD"), "—");
  });
  it("signed change", () => {
    assert.equal(signedBigMoney(4950000000000, "USD"), "+US$49.5B");
    assert.equal(signedBigMoney(-120000000, "CAD"), "−$1.2M");
  });
});

describe("EPS keeps small-cap precision (P0 R8)", () => {
  it("two decimals normally, four under a dime", () => {
    assert.equal(epsMoney(24600, "USD"), "US$2.46");
    assert.equal(epsMoney(579, "CAD"), "$0.0579");
    assert.equal(epsMoney(-22, "CAD"), "−$0.0022");
  });
});

describe("growth and margins", () => {
  it("signed percentages, n/m, and the reason", () => {
    assert.equal(growthText({ kind: "ok", bps: 2289 }), "+22.9%");
    assert.equal(growthText({ kind: "ok", bps: -4570 }), "−45.7%");
    assert.equal(growthText({ kind: "ok", bps: 150000 }), "+1500%");
    assert.equal(growthText({ kind: "nm", reason: "negative-base" }), "n/m");
    assert.match(nmReason({ kind: "nm", reason: "basis-changed" })!, /changed how it books/);
    assert.equal(nmReason({ kind: "ok", bps: 5 }), null);
  });
  it("bps and points", () => {
    assert.equal(bpsText(6624), "66.2%");
    assert.equal(ptsText(350), "+3.5 pts");
    assert.equal(ptsText(-761), "−7.6 pts");
  });
});
