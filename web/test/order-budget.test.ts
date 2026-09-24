import { test } from "node:test";
import assert from "node:assert/strict";
import { limitExpiry, isExpiredAgentLimit, orderBudgetBlock, formatJournal, type BudgetOrder } from "../agent/order-budget";

// 2026-09-24 (Opus 5.5 day 1): the agent could see the order caps but not how many it had used, and it
// wrote an expiry ("lapses ~Oct 8") that nothing enforced. These pin the arithmetic both now rest on.

const et = (s: string) => new Date(s); // ISO with explicit offset

test("limitExpiry: placed Thu 9/24 → close of Thu 10/1 (5 trading days)", () => {
  assert.equal(limitExpiry(et("2026-09-24T11:31:45-04:00"), 5).toISOString(), et("2026-10-01T16:00:00-04:00").toISOString());
});

test("limitExpiry: placed on a Friday skips the weekend", () => {
  assert.equal(limitExpiry(et("2026-09-25T10:00:00-04:00"), 5).toISOString(), et("2026-10-02T16:00:00-04:00").toISOString());
});

test("limitExpiry: a both-exchange holiday doesn't count (Christmas 2026, Fri)", () => {
  // Wed 12/23 → Thu 24(1), Fri 25 closed, Mon 28(2), Tue 29(3), Wed 30(4), Thu 31(5)
  assert.equal(limitExpiry(et("2026-12-23T10:00:00-05:00"), 5).toISOString(), et("2026-12-31T16:00:00-05:00").toISOString());
});

test("isExpiredAgentLimit: only agent LIMIT PENDING orders, only at/after the close", () => {
  const o = { placedBy: "agent", type: "LIMIT", status: "PENDING", createdAt: et("2026-09-24T11:31:45-04:00") };
  assert.equal(isExpiredAgentLimit(o, et("2026-10-01T15:59:00-04:00")), false);
  assert.equal(isExpiredAgentLimit(o, et("2026-10-01T16:00:00-04:00")), true);
  assert.equal(isExpiredAgentLimit({ ...o, placedBy: "member" }, et("2026-12-01T12:00:00-05:00")), false);
  assert.equal(isExpiredAgentLimit({ ...o, placedBy: "system-takeprofit" }, et("2026-12-01T12:00:00-05:00")), false);
  assert.equal(isExpiredAgentLimit({ ...o, type: "MARKET" }, et("2026-12-01T12:00:00-05:00")), false);
  assert.equal(isExpiredAgentLimit({ ...o, status: "FILLED" }, et("2026-12-01T12:00:00-05:00")), false);
});

let nextId = 100;
const ord = (at: string, over: Partial<BudgetOrder> = {}): BudgetOrder => ({
  id: nextId++, createdAt: et(at), symbol: "XYZ", side: "BUY", type: "MARKET", qty: 1, limitPriceCents: null,
  status: "FILLED", filledQty: 1, avgFillPriceCents: 10_000, placedBy: "agent", rejectReason: null, ...over,
});

test("orderBudgetBlock: the 9/24 MSFT moment — 4 in the hour, so 0 left and when the slot frees", () => {
  const today = [
    ord("2026-09-24T10:02:17-04:00", { symbol: "GD", side: "SELL" }),
    ord("2026-09-24T10:04:12-04:00", { symbol: "BNY", side: "SELL" }),
    ord("2026-09-24T10:04:38-04:00", { symbol: "TDY" }),
    ord("2026-09-24T10:30:43-04:00", { symbol: "NVDA" }),
    ord("2026-09-24T11:03:40-04:00", { symbol: "SPGI", side: "SELL" }),
    ord("2026-09-24T11:31:45-04:00", { symbol: "ADI", type: "LIMIT", limitPriceCents: 36_700, status: "PENDING", filledQty: 0, avgFillPriceCents: null }),
    ord("2026-09-24T11:32:54-04:00", { symbol: "VRTX" }),
    ord("2026-09-24T12:03:21-04:00", { symbol: "BNY", side: "SELL" }),
  ];
  const b = orderBudgetBlock(today, today.filter((o) => o.status === "PENDING"), et("2026-09-24T12:03:30-04:00"));
  assert.match(b, /Used today: 8\/10 \(2 left\)/);
  assert.match(b, /last 60 min: 4\/4 \(0 left — next hourly slot frees at 12:03 ET\)/);
  assert.match(b, /You can place 0 more orders right now/);
  assert.match(b, /ADI LMT \$367\.00 .*RESTING, auto-cancels at the close Thu, Oct\. 1|ADI LMT \$367\.00 .*RESTING, auto-cancels at the close .*Oct.*1/);
});

test("orderBudgetBlock: rejected orders are listed but don't use a slot (matches the gate)", () => {
  const today = [ord("2026-09-24T13:03:00-04:00", { symbol: "CASY", status: "REJECTED", rejectReason: "Daily order limit reached (10).", filledQty: 0 })];
  const b = orderBudgetBlock(today, [], et("2026-09-24T13:05:00-04:00"));
  assert.match(b, /Used today: 0\/10/);
  assert.match(b, /CASY .*REJECTED, did not use a slot: Daily order limit/);
});

test("orderBudgetBlock: member orders are shown when resting but never count against the agent", () => {
  const member = ord("2026-09-22T10:00:00-04:00", { placedBy: "member", type: "LIMIT", limitPriceCents: 16_500, status: "PENDING", filledQty: 0 });
  const b = orderBudgetBlock([], [member], et("2026-09-24T10:00:00-04:00"));
  assert.match(b, /Used today: 0\/10/);
  assert.match(b, /Still resting from earlier days:[\s\S]*placed by member/);
});

test("formatJournal: trims long bodies with a pointer to the full entry, and caps the total", () => {
  const rows = Array.from({ length: 50 }, (_, i) => ({ id: i + 1, at: new Date(0), kind: "RESEARCH", symbol: "X", title: `t${i}`, body: "a".repeat(5000) }));
  const out = formatJournal(rows);
  assert.ok(out.length < 45_000, `got ${out.length}`);
  assert.match(out, /get_journal_entry id=1 for the full text/);
  assert.match(out, /older entries omitted/);
  assert.equal(formatJournal([]), "(no entries)");
  assert.equal(formatJournal([{ id: 7, at: new Date(0), kind: "LESSON", symbol: null, title: "short", body: "fine" }]).includes("trimmed"), false);
});
