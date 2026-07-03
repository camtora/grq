import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cashCentsFromBalances } from "@/lib/external/store";

// SnapTrade's balances endpoint returns per-currency rows: { currency: { code }, cash, buying_power }.
// The account object itself has NO cash field — this helper is the only path to real cash.

const usd = (cash: number) => ({ currency: { code: "USD" }, cash, buying_power: cash });
const cad = (cash: number) => ({ currency: { code: "CAD" }, cash, buying_power: cash });

describe("cashCentsFromBalances", () => {
  it("picks the entry matching the account currency, dollars → integer cents", () => {
    assert.equal(cashCentsFromBalances([usd(6861.55)], "USD"), 686155);
    assert.equal(cashCentsFromBalances([cad(30.19)], "CAD"), 3019);
  });

  it("zero cash is a real value, not unknown", () => {
    assert.equal(cashCentsFromBalances([usd(0)], "USD"), 0);
  });

  it("matches currency case-insensitively", () => {
    assert.equal(cashCentsFromBalances([{ currency: { code: "usd" }, cash: 22.08 }], "USD"), 2208);
  });

  it("ignores other currencies rather than guessing across them", () => {
    assert.equal(cashCentsFromBalances([cad(100), usd(22.08)], "USD"), 2208);
    assert.equal(cashCentsFromBalances([usd(22.08)], "CAD"), null);
  });

  it("null (unknown) on empty or malformed rows so the caller keeps the last stored value", () => {
    assert.equal(cashCentsFromBalances([], "CAD"), null);
    assert.equal(cashCentsFromBalances([{ cash: 5 }, null, "junk"], "CAD"), null);
  });

  it("rounds once at ingest (float dollars never leak downstream)", () => {
    assert.equal(cashCentsFromBalances([usd(0.1 + 0.2)], "USD"), 30);
  });
});
