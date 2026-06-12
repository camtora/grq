# SimBroker Engine Spec (as implemented, Phase 1)

Code: `web/lib/broker/sim.ts` (engine) · `web/lib/broker/quotes.ts` (synthetic data) ·
`web/lib/broker/types.ts` (the seam). Everything here is deterministic, transactional, and
identical for human and (future) agent orders — there is exactly one order path.

## Gate order (every `placeOrder` call, in sequence)

1. **Kill switch** — `Settings.killSwitch` → reject `"Kill switch is engaged — all trading halted."`
2. **Quantity** — positive integer shares.
3. **Symbol** — must price in the active quote source.
4. **Marketability** — MARKET always fills; LIMIT fills only if it crosses (BUY limit ≥ ask /
   SELL limit ≤ bid), else persists as a **PENDING** resting order (no fill, no cash moves).
5. **Commission** computed (below).
6. **Sufficiency** — BUY: `qty·price + commission ≤ cash` (no margin borrowing);
   SELL: `qty ≤ position.qty` (no shorting).
7. **Fee budget** — `month-to-date commissions + this ≤ Settings.feeBudgetCentsMonth`.

Failures short-circuit and are **recorded as REJECTED orders with `rejectReason`** — the
audit trail includes what the gate refused and why. Rejections are visible on /activity.

## Fill prices

- MARKET: BUY fills at **ask**, SELL at **bid** (the spread is the haircut — no extra
  slippage model in v1).
- Marketable LIMIT: fills at the touch (ask/bid), not at the limit — conservative-realistic.
- No partial fills in v1 (sim assumes our sizes are small vs liquidity screens). `Trade` is
  1:N-ready if partial fills arrive with IBKR in Phase 3.

## Commission model — IBKR Fixed, CAD stocks

`max(1¢, min( max($1.00, qty × $0.01), 0.5% × trade value ))`

i.e. $0.01/share with a $1.00 minimum, capped at 0.5% of trade value (the cap may undercut
the minimum on tiny orders — that's IBKR's actual schedule). Examples:
- 5 × $41.96 = $209.80 → per-share $0.05 → min $1.00 → cap $1.05 → **$1.00**
- 40 × $42.00 = $1,680 → per-share $0.40 → min $1.00 → cap $8.40 → **$1.00**
- 300 × $90.00 = $27,000 → per-share $3.00 → cap $135 → **$3.00**

## Accounting (inside one Prisma transaction per fill)

- **BUY:** `totalCost = qty·price + commission`; position ACB-averaged **including
  commission** (`newAvg = (oldQty·oldAvg + totalCost) / newQty`, rounded); cash −= totalCost.
- **SELL:** `realizedPnl = qty·(price − avgCost) − commission`; qty reduced (position row
  deleted at 0; ACB per remaining share unchanged); cash += `qty·price − commission`.
- A `Trade` row records the fill; a `JournalEntry(kind=TRADE)` records the human-readable
  story (thesis text + commission / realized P&L); a `NavSnapshot` is written post-commit.

CRA alignment: commissions in ACB on the way in, net of proceeds on the way out.

## Synthetic quotes (Phase 1 only)

10 plausible TSX symbols (RY, TD, BNS, ENB, SU, CNR, BCE, T, SHOP, XIC) random-walking from
realistic base prices: one step per ~5s elapsed, per-symbol volatility (6–22 bps/step) and
spread (3–8 bps), gentle mean reversion to base so long uptimes stay plausible. Module-level
singleton → consistent prices across requests in one server process; container restart
restarts the walk. **Phase 2 replaces this with Yahoo delayed quotes behind the same
`QuoteSource` interface — the engine and gate do not change.**

## Resting (PENDING) orders

Persisted, visible on /activity, currently swept by nothing — the Phase 2 orchestrator adds
the sweep-on-tick loop. (Known v1 gap, accepted: nobody is placing non-marketable limits
except deliberately via the manual ticket.)

## Known v1 simplifications (accepted, documented)

No partial fills · no slippage beyond spread · no halts/circuit breakers · fills any time
the server is up (market-hours enforcement arrives with the Phase 2 orchestrator — the gate
itself stays time-agnostic so backtests can replay) · single currency (CAD) · single account.

## Operating the sim

- **Reset (DESTRUCTIVE):** `source ~/.nvm/nvm.sh && cd web && npx tsx prisma/seed.ts`
  — wipes everything, reseeds $5,000 + settings + 7-day flat NAV baseline + 3 `[DEMO]`
  trades placed through the real engine.
- **Manual order (UI):** Portfolio page ticket ("dev tool — retires when the agent takes
  over"). **API:**

```bash
curl -s -X POST localhost:3012/api/sim/order \
  -H "X-Forwarded-Email: cameron.tora@gmail.com" -H "content-type: application/json" \
  -d '{"symbol":"XIC","side":"BUY","type":"MARKET","qty":5}'
# → {"ok":true,"orderId":5,"status":"FILLED","fillPriceCents":4196,"commissionCents":100}
```

- Kill switch: `/api/killswitch {"engaged":true|false}` — journaled with who flipped it.
