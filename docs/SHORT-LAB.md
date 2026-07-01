# The Short Lab — study shorting in a sandbox before it's ever real (D101)

**Status:** planned (2026-06-30). A standalone, fully isolated sandbox for Cam & Graham to *study and
learn* short selling — the one bet the fund can't make, and the only one with genuinely **unbounded
loss**. Hands-on first (you place modeled shorts and watch them evolve), an agent-driven A/B arm later.
**Modeled, never executable.** It touches none of the §6 gate, the broker, or the live fund.

> This does NOT change the guardrail. Rule #3 — *no shorting, no margin, no options* — stays exactly as
> written and code-enforced. The Short Lab is a learning surface, not a loosening. Shorting the real
> book remains a deliberate, humans-only flip after the soak, and this changes nothing about that.

**Decisions locked (Cam, 2026-06-30):** **both** (build the interactive human lab now, add an
autonomous long-only-vs-long+short agent arm later) · model the **full mechanics** (borrow fee, margin
+ forced-cover margin call, short-interest/squeeze context, dividends) — because those *are* the lessons
· a **standalone "Short Lab"** destination (in the Experiments menu, like the Options Desk), not folded
into the options portal.

---

## 1. Why shorting earns its own lab

Everything in the options portal was *defined-risk*. Shorting is the opposite, and that's the whole
point of studying it:

- **Unbounded loss.** You borrow shares, sell them, and must buy them back. If the price rises, your
  loss grows without limit — a payoff line that never flattens on the upside. The headline lesson.
- **You're on margin.** Shorting *requires* posted collateral; a move against you eats your equity and
  can trigger a **margin call** — a forced buy-back at the worst possible time. Modeling that call *is*
  the lesson (and, incidentally, what stops one runaway short from posting an infinite loss in the sim).
- **It costs carry.** Borrowing shares isn't free — hard-to-borrow names charge a real annualized fee,
  and you pay any **dividend** while short. Time is against you even if you're right eventually.
- **Squeezes.** A crowded short that rallies forces shorts to cover, which feeds the rally — the
  reflexive risk (short interest / days-to-cover) that has no long-side equivalent.

A short and a long put are the two ways to bet a stock falls; the lab teaches the trade-off directly —
**short: unbounded loss, needs margin, pays carry** vs **put: capped loss, defined risk** (the portal we
just shipped). We show them side by side.

## 2. Reuse — this leans on what we just built

- The **payoff engine** (`lib/options/payoff.ts`) already models a short as a `STOCK / SELL` leg, so the
  **short payoff diagram (the never-flattening loss line) and the short-vs-put comparison are nearly free.**
- **Live quotes** (`lib/broker/quotes.ts`) mark positions; **`Term`/glossary** carry the literacy layer;
  the **Options Desk** is the proven blueprint for an isolated, modeled, teaching-card sandbox with a
  book + a NAV-over-time chart + plain-English cards.

## 3. The mechanics — the math (`lib/short/mechanics.ts`, pure, integer cents, no floats)

Short accounting (per position): opening a short **credits proceeds to cash** and creates a **liability**
to buy the shares back.
```
proceedsCents     = qty × avgShortCents                 // cash received at open
liabilityCents    = qty × markCents                     // cost to buy back now
unrealizedCents   = qty × (avgShortCents − markCents) − accruedBorrowCents   // profit when price falls
accruedBorrowCents = Σ  notional × borrowBps/10000 × (days/365)              // daily carry
bookEquityCents   = cash − Σ liability − Σ accruedBorrow                     // the collateral that can vanish
maintenanceReqCents = maintPct × Σ liability            // e.g. 30% of short market value
```
**Margin call:** when `bookEquity < maintenanceReq`, the lab **force-covers** the worst position(s) at
the live quote until equity clears the requirement — booked as a `MARGIN_CALL` trade with a teaching card
("your short ran against you; you were bought in at $X for a $Y loss — this is why shorts blow up").
**Borrow rate** is *modeled* (a tier by liquidity/short-interest; honest "modeled cost-to-borrow"),
upgradeable to a real feed later. **Squeeze/short-interest** is surfaced as context (real data where we
have it), never a faked price path — the lab always marks to the *real* quote.

## 4. Data model (own `Short*` tables — additive, never touches the fund's tables)

| Model | What |
|---|---|
| `ShortLab` | the sandbox book: `owner String?` (null = shared house lab), `startingCashCents` (virtual, e.g. $100k), `cashCents`, `maintMarginPct` (default 30), `status`, timestamps |
| `ShortPosition` | one open short: `labId`, `symbol`, `companyName?`, `currency`, `qty` (shares), `avgShortCents` (sold-at), `borrowBps` (modeled at open), `lastMarkCents?`, `accruedBorrowCents`, `openedAt`, `status` (OPEN\|COVERED\|CALLED) |
| `ShortPositionMark` | per-position time series (the "watch it evolve" curve): `at`, `markCents`, `unrealCents`, `accruedBorrowCents` |
| `ShortTrade` | the ledger: `SHORT_OPEN \| COVER \| MARGIN_CALL \| DIVIDEND`, `qty`, `priceCents`, `borrowCostCents`, `realizedPnlCents?`, `note`, `card?` |
| `ShortLabSnapshot` | book equity over time: `at`, `equityCents`, `cashCents`, `shortMktValCents`, `marginUsedPct` |

## 5. Marking (no LLM cost — this is why "lab first" is cheap)

Positions mark to the live quote + accrue borrow + run the margin check on **page view** AND on a
**lightweight scheduled tick** in the agent runner. That tick is **pure math + quotes — zero Opus tokens**
(exactly like the desk's `snapshotDeskNavAll`), so the interactive lab never touches Cam's Max quota. Only
Phase 2's autonomous arm spends model tokens, and that's opt-in and gated (`GRQ_SHORTLAB_AGENT`).

## 6. The page — `/short-lab` (Experiments menu)

Book equity over time (chart) · open shorts as cards (P&L, the modeled borrow accruing, **margin
health bar**, days held, the unbounded-loss mini payoff diagram, a short-vs-put toggle) · a member
**"Open short"** form (pick a real name, size by shares or $ notional) and **"Cover"** buttons ·
covered/called history as plain-English **punchline cards** · the education panel (unbounded loss,
borrow, the margin call, squeezes, short vs put). Server page + `"use client"` controls, guarded by
`memberFromRequest` (viewers read-only). A permanent "modeled · never executable · the fund never shorts"
banner. Design per `docs/DESIGN.md`.

## 7. Phasing

- **Phase 1 — the interactive human lab. ✅ BUILT + DEPLOYED (2026-06-30, not committed).** The 5 `Short*`
  tables (pushed to prod), `lib/short/mechanics.ts` (12 tests — locks the margin call), `lib/short/lab.ts`
  (engine + read), the `runShortLabTick` no-LLM mark tick wired into the runner, `/short-lab` page +
  open/cover/reset controls + teaching cards + the unbounded-loss payoff diagram + short-vs-put link +
  explainers, the Experiments nav entry, 5 glossary terms. Agent redeploy: `AGENT_VERSION` v2.33→v2.34-phase4;
  startup scan suppressed (markets closed). **86/86 tests, `tsc` clean.** Verified end-to-end: short 17 AAPL →
  equity held at $100k at open, cover + reset clean.
- **Phase 2 — the agent A/B arm. ✅ BUILT + DEPLOYED 2026-06-30 (OFF, not committed).** A control Opus
  (long-only) vs a treatment Opus (long + may short), same $100k stake — which compounds better, and does
  shorting help or hurt? Mirrors the Options Desk: 6 `ShortDesk*` tables (pushed to prod), the engine
  (`agent/short-lab/desk-engine.ts` — value/BUY/SELL/SHORT/COVER fills, mark + force-cover margin call,
  session, cadence tick) + `desk-context.ts` + `desk-parse.ts` (BUY/SELL/SHORT/COVER grammar), the
  `SHORTDESK` policy caps, `lib/short/desk.ts` (auto-seeds a control+treatment contest, PAUSED), the
  `/short-lab` Agent-A/B panel + start/pause/reset controls, `runShortDeskTick` wired into the runner
  (`AGENT_VERSION` v2.35-phase4). **This is the part that spends Opus tokens, so it's behind
  `GRQ_SHORTLAB_AGENT` (off) AND ships PAUSED** — a member must Start it *and* the env flag must be on for
  any session to run. Sandbox — never the §6 gate/broker/fund. Single-currency (no FX).
- **Phase 3 — grow. ◐ MOSTLY BUILT + DEPLOYED 2026-06-30 (not committed).** ✅ **Shadow-short-our-sells**
  (the centerpiece) — every real-fund stock SELL is mirrored as a modeled short at the sell price in a
  dedicated shadow lab (`lib/short/shadow.ts` `syncShadowShorts`, idempotent via `ShortPosition.sourceTradeId`),
  marked over time; a `/short-lab` panel shows "what if we'd shorted our exits?" with avg return + win-rate,
  and a one-line lesson feeds the LIVE agent's `buildContext` (informs "do my exits keep falling?", never an
  action — the fund still can't short). ✅ **Dividend debits** — a short OWES dividends to the lender;
  `fmpDividends` (cached 12h) folds any ex-date crossed into the short's carry (`lib/short/dividends.ts`), booked
  as a `DIVIDEND` trade. ⏸ **Real cost-to-borrow / short-interest / days-to-cover + squeeze: DEFERRED** — FMP's
  short-interest endpoint returns empty (no free source wired), so borrow stays MODELED (honest); the squeeze
  signal waits on a real feed. Agent redeploy: `AGENT_VERSION` v2.36-phase4; scan suppressed.

## 8. Guardrails that stay UNCHANGED

Rule #1 (guardrails are humans-only, the §6 gate is untouchable), rule #2 (kill switch), rule #3 (**no
shorting / no margin / no options** on the real book), rule #4 (integer cents, whole shares), rule #6 (the
soak gate before real money). The Short Lab is a **permanently sandboxed** study surface — it never trades
a real short, and enabling real shorting stays a separate, deliberate, humans-only decision after the soak.

## 9. Decision

Logged as **D101** in `docs/DECISIONS.md`. Owner: Cam. Greenlit 2026-06-30 — standalone Short Lab,
interactive human lab first + an agent arm later, full mechanics, permanently sandboxed.
