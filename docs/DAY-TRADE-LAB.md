# The Day-Trading Lab — prove it vs. buy-and-hold (D103)

**Status:** building (2026-07-01). A standalone, permanently sandboxed lab to *learn how day trading
works* and *prove to ourselves whether it beats just holding*. **Modeled, never executable.** The live
fund is unaffected — it's code-blocked from same-day round trips (a §6 hard limit) and that stays.

> Not a trading path. Touches none of the §6 gate, the broker, or the fund. Same family as the Options
> Desk (D91) and the Short Lab (D101): an isolated, modeled learning surface in the Experiments menu.

**Decisions (Cam, 2026-07-01):** the lab's point is **"prove it vs buy-and-hold"** (a Trader arm vs a
Holder arm on the same name) · **live paper** (mark against today's live ~15-min-delayed quotes; no new
data source). Hands-on first; a rule-based auto-trader arm is a possible Phase 2 (deliberately NOT an
Opus arm — frontier reasoning is too slow/expensive per trade, which is itself part of why the fund
isn't a day-trader).

---

## 1. The idea

Two virtual books, same starting cash, **same single stock, same day**:

- **The Trader (you):** open/close intraday positions by hand. **Every fill crosses the bid/ask spread**
  (buy at the ask, sell at the bid) **and pays a commission** — so each round trip starts underwater.
- **The Holder (automatic):** mirrors your **first buy** (same shares, same fill, one commission) and
  then does nothing.

A scoreboard compares **Trader P&L vs Holder P&L**, the number of round trips, and the **total fees +
spread the Trader paid** while the Holder paid it once. The lesson: net of costs, churn rarely beats
patience — and you watch it happen on a real name.

**Honest caveat (on the page):** with ~15-min-delayed quotes we can't model real scalping edge or
realistic fills. So this isn't "can you *win* at day trading" — it's an honest demonstration of the
**structural drag** (spread + commissions + churn) a day-trader fights on every trade and a holder
doesn't. That is exactly the "vs buy-and-hold" point.

## 2. Mechanics (`lib/day/mechanics.ts`, pure, integer cents, whole shares — rule #4)

- **Fills:** buy at `askCents`, sell at `bidCents` (fall back to `midCents` if a side is missing). The
  spread is real (delayed) from the quote.
- **Commission:** reuse `ibkrFixedCommissionCents(shares, priceCents)` (the sim's IBKR model).
- **Spread cost** (teaching stat): `|fill − mid| × shares`, accumulated per fill.
- **Equity** (both books, marked at **mid** — neutral): `cash + shares × mid`. The fill-time spread
  already penalized the Trader; marking at mid keeps the ongoing curve unbiased.
- **Bottom line** = `equity − startingCash` for each book — inherently nets ALL fees + spread, so it's
  the honest verdict. "Realized" and "fees paid" are supporting detail.
- The **Holder mirrors only the first buy** — buy once, hold. Subsequent Trader activity is pure added cost.

## 3. Data model (own `Day*` tables — additive, never touches the fund's tables)

| Model | What |
|---|---|
| `DayLab` | one symbol on one ET day: `owner?`, `symbol`, `companyName?`, `currency`, `tradingDate`, `startingCashCents` ($25k default), `status` (OPEN\|CLOSED); Trader book (`traderCashCents`, `traderShares`, `traderAvgCents`); Holder book (`holderShares`, `holderCashCents`, `holderEntryCents?`); running `realizedCents`, `feesCents`, `spreadCents`, `roundTrips` |
| `DayTrade` | the ledger: `side` (BUY\|SELL\|FLATTEN), `shares`, `priceCents` (fill), `midCents`, `commissionCents`, `spreadCostCents`, `realizedPnlCents?`, `card?` |
| `DayMark` | the two equity curves over time: `at`, `traderEquityCents`, `holderEquityCents` |

## 4. Marking (no LLM — zero token cost)

Open labs mark to the live quote on **page view** AND a **market-hours `runDayLabTick`** in the runner
(pure math + quotes, like the Short Lab's tick), so the Trader-vs-Holder equity curves fill in even when
you're not clicking. No Opus, no quota.

## 5. The page — `/day-lab` (Experiments menu)

Start a lab (pick a US/CA ticker) · Buy / Sell / Flatten controls · the **Trader vs Holder equity
chart** · the **scoreboard** (each book's P&L, round trips, fees + spread paid, "your churn cost you $X")
· the trade log · an education panel (bid/ask spread as the silent killer, slippage, PDT, cash
settlement, the tax hit, why most day traders lose). Server page + `"use client"` controls,
member-guarded (viewers read-only). Permanent "modeled · never executable · the fund can't day-trade" banner.

## 6. Phasing

- **Phase 1** — the hands-on Trader-vs-Holder lab above. Web + one no-LLM tick (agent rebuild,
  `AGENT_VERSION` bump; boot-scan suppressed).
- **Phase 2 (optional)** — a rule-based auto-trader arm (momentum / mean-reversion) so a mechanical
  strategy can churn vs. hold without manual clicking. Not an Opus arm.

## 7. Guardrails unchanged

Rule #1 (gate is humans-only), #2 (kill switch), #3 (no shorting/margin/options), #4 (int cents/whole
shares), #6 (soak) — all untouched. The live fund's **"no same-day round trips"** §6 limit stays; this
lab never trades a real order and is permanently sandboxed.

## 8. Decision

Logged as **D103** in `docs/DECISIONS.md`. Owner: Cam. Greenlit 2026-07-01 — prove-it-vs-buy-and-hold,
live paper, standalone lab.
