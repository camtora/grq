# Alfred Options — live options trading for the fund agent (D99)

**Status:** building (2026-06-30). Foundation + the real "no options" guardrail land first;
the gate/fill/NAV wiring + the IBKR options adapter follow. **Options cannot trade until a member
flips `Settings.allowOptions` AND the IBKR paper account has options permission + OPRA market data.**
Default is OFF — the equities soak is untouched.

> This is the LIVE fund (Alfred). It is **not** the Options Desk *experiment*
> (`web/agent/options-desk/`, `docs/THE-OPTIONS-DESK.md`), which stays exactly as-is — a sandboxed
> Opus-stock-only vs Opus+options bake-off that never touches the broker or the §6 gate. This doc is
> about teaching the real money path to trade options through the same guardrails as stocks.

---

## 1. Goal & scope

Give Alfred the ability to **buy-to-open long calls and puts** on US underlyings it already trades,
as a defined-risk instrument it weighs alongside stock — gated by the same §6 machinery and a new,
member-only kill toggle.

**In scope (the only thing enabled):**
- **Buy-to-open** long **calls** and **puts**. Max loss = premium paid. That's the whole risk surface.
- **Sell-to-close** an option position the fund already holds (never opens a short leg).

**Hard out of scope (unchanged guardrails — rule #3):**
- ❌ **Writing/selling options to open** (naked or covered) — no short option legs, ever. A SELL is
  only ever a *close* of a long position the fund holds, enforced the same way the no-shorting share
  check is (you can't sell what you don't hold).
- ❌ Spreads / multi-leg / combos. One long leg at a time.
- ❌ Margin, assignment exposure, exercise. Long options only; we let them ride or close them.
- ❌ CA-listed options — the CBOE feed is US-only, so CA names stay dark (leads, not trades).

**Why buy-to-open only:** it is the one option structure whose maximum loss is known and bounded at
order time (the premium), so it slots into the existing premium-at-risk sizing cap cleanly and can
never produce an unbounded or margin loss. Everything riskier stays a humans-only future decision.

---

## 2. The design in one picture

```
Alfred → propose_option_order(symbol, right=CALL|PUT, action=BUY_TO_OPEN, bias=ATM|SLIGHTLY_OTM, contracts, thesis…)
  → validateAndPlaceOption()           [§6 gate — option branch]
       1.  allowOptions toggle OFF  → reject            (the new real guardrail; humans-only)
       2.  OPTIONS.enabled env kill → reject            (env hard-disable, no deploy)
       3.  warm-up · market hours · no first/last 15m   (reused)
       4.  thesis + ≥1 source                           (reused)
       5.  conviction ≥ 70                               (reused)
       6.  underlying ACTIVE in the universe + in dial   (reused — options only on names we trade)
       7.  underlying not BLOCKED by a member            (reused)
       8.  US-only · contract resolved from live CBOE chain within DTE window  (new)
       9.  BUY_TO_OPEN only; a SELL must close a held OptionPosition (new — option no-shorting)
       10. premium-at-risk ≤ maxPremiumPctNav of NAV    (new sizing math)
       11. ≤ maxOpenPerWeek new opens / rolling 7d        (new)
       12. premium funded by USD cash, no margin          (reused funding/no-margin check)
       13. order-rate caps (orders/day · /hour)           (reused — shared with stock flow)
  → broker.placeOrder({ …, option:{right,strikeCents,expiry,multiplier} })
       • SimBroker:  option fill → OptionPosition + Desk-style premium accounting, NAV marks the leg
       • IBKRBroker: OPT conid resolution + option order ticket  ⚠️ VERIFY-LIVE (needs Graham's perms)
```

Defined-risk is **structural**: buy-to-open ⇒ max loss = premium ⇒ the premium-at-risk cap (#10) is
also the real loss cap. Notional is irrelevant and never sized against.

---

## 3. The "no options" guardrail becomes real-in-code

Today there is **no `if (option) reject` anywhere** — options are forbidden only because
`PlaceOrderInput` has no field to express one (verified across `validator.ts`, `sim.ts`,
`guardrails.ts`). CLAUDE.md rule #3 describes a "config toggle that is OFF" — **that toggle did not
exist in code.** D99 creates it:

- **`Settings.allowOptions Boolean @default(false)`** — the real, enforced switch. Member-only
  (the same write-guard tier as the kill switch / settings); **Alfred can never write it** (rule #1:
  guardrails are humans-only).
- **`GRQ_OPTIONS_ENABLED`** env kill (defaults `true`, but harmless while `allowOptions` is `false`)
  — lets us hard-disable without a deploy, the same pattern as `GRQ_DESK_ENABLED` / `GRQ_RACE_ENABLED`.
- **Both** must be true for an option order to clear, and the check is the **first line** of the
  option branch in the validator AND re-asserted at the broker seam (`sim.ts` / `ibkr.ts`) — defense
  in depth, mirroring how the kill switch is re-checked inside every `placeOrder`.

Net: the moment this ships, "no options" stops being *implicit* (unrepresentable) and becomes
*explicit and enforced*. Flipping it on is a deliberate, logged, member-only act.

---

## 4. Data model (additive — the equities path is byte-for-byte unchanged)

The real `Position` is keyed by `symbol` (its primary key), so it **cannot** hold multiple contracts
on one underlying. Options get their own table, mirroring the proven sandbox `DeskPosition` shape.
Everything else is additive nullable columns with `secType` defaulting to `"STK"`, so existing rows
and the entire stock path are untouched.

| Model | Change |
|---|---|
| `Settings` | `+ allowOptions Boolean @default(false)` |
| `Order` | `+ secType String @default("STK")` · `+ right/strikeCents/expiry/multiplier/optionConid` (all nullable). For an OPT order **qty = contracts**, `*PriceCents` = **per-share premium** |
| `Trade` | `+ secType String @default("STK")` · `+ right/strikeCents/expiry/multiplier`. OPT: qty = contracts, `priceCents` = per-share premium, `realizedPnlCents` = realized on close |
| `OptionPosition` (new) | `id`, `symbol` (underlying), `right` CALL\|PUT, `strikeCents`, `expiry`, `multiplier @default(100)`, `qty` (contracts), `avgCostCents` (per-share premium ACB, incl. commission), `currency @default("USD")`, `conid?`, `openedAt`, `updatedAt`. `@@unique([symbol,right,strikeCents,expiry])` |

**Units (locked, no floats — rule #4):** money is integer cents, quantities are whole contracts.
A position's dollar premium = `qty × multiplier × perSharePremiumCents`. Per-share premium is stored
the same way stock prices are (cents), so the desk's `lib/options/price.ts` math reuses directly.

Schema changes are **additive + nullable** → safe to `prisma db push` mid-soak (the expand/contract
rule only bites on DROPs; the running container's baked client ignores columns it doesn't know).

---

## 5. Contract selection — deterministic, agent picks a bias not a strike

Alfred provides `right` (CALL/PUT) + a coarse `bias` (`ATM` | `SLIGHTLY_OTM`) + `contracts`. The
system resolves the **one** concrete contract deterministically via the sandbox's proven
`pickContract(chain, right, bias, now, OPTIONS.minDte, OPTIONS.maxDte)` against the **live CBOE
chain** (`fetchOptionChain(bareTicker)`):
- nearest monthly expiry in `[minDte, maxDte]` (default **30–60 DTE** — keeps theta/gamma noise down),
- strike nearest the bias target (ATM ≈ 0.50Δ, SLIGHTLY_OTM ≈ 0.35Δ; falls back to strike distance).

The agent never hand-picks an illiquid strike. Premium marks via `markContractCents` (CBOE mid →
last → Black-Scholes), the same path the desk uses. Closing references an existing `OptionPosition`.

---

## 6. Sizing & risk caps (`agent/policy.ts → OPTIONS`, humans-only)

```
OPTIONS = {
  enabled:          GRQ_OPTIONS_ENABLED ?? true     // env hard-kill (no deploy)
  maxPremiumPctNav: GRQ_OPT_PREMIUM_PCT ?? 4        // per-position premium-at-risk, % of NAV
  maxOpenPerWeek:   GRQ_OPT_PER_WEEK    ?? 3        // new opens / rolling 7d
  minDte: 30, maxDte: 60                             // contract-selection window
  usOnly: true                                       // CBOE is US-only
}
```

- **4% premium-at-risk** per position (deliberately tighter than the sandbox's 8% — this is the real
  book). Because it's buy-to-open, that 4% IS the max loss on the leg.
- **3 new opens / rolling 7 days.** Options open does **not** consume the stock weekly-BUY cap (and
  vice versa) — separate counters so neither crowds the other. The shared `orders/day` (10) and
  `orders/hour` (4) pace guards DO count options (total order-flow throttle).
- Premium is debited from **USD cash**; a shortfall routes to the existing member FX approval
  (`request_fx`) — no auto-FX, no margin (rule #3), identical to a US stock buy.

`breachesOptionPremiumCap(premiumCadCents, navCents, maxPremiumPct)` lives in
`lib/broker/guardrails.ts` next to the other §6 math and is regression-locked by unit tests.

---

## 7. NAV, marking & reporting

Held option positions must appear in NAV or the books lie (the premium left cash on open and must
come back as position value). `writeNavSnapshot` (sim) and `getPortfolio` add
`Σ OptionPosition (qty × multiplier × markPerShareCents)` valued in CAD. Marking uses the live CBOE
chain via `lib/options`; when the chain is unavailable it falls back to `avgCostCents` (then
intrinsic past expiry) — the same defensive fallback stocks use (`midCents ?? avgCostCents`). **With
zero option positions the helper returns 0 and fetches nothing — the stock NAV path is identical.**

Expiry handling (sim): a contract past expiry settles to **intrinsic value** and the position closes
(realized P&L booked), reusing `intrinsicCents`. IBKR handles expiry/exercise broker-side; reconcile
mirrors the result.

UI/reporting (later slice): surface option positions + trades on the dashboard and per-stock page,
in plain English (a call = a bullish bet with a deadline; a put = the bearish bet the stock fund
can't otherwise make), consistent with the literacy pillar.

---

## 8. IBKR adapter (Phase C) — ⚠️ blocked on a human step

`web/lib/broker/ibkr.ts` is equities-only: `conidFor` hardcodes `secType=STK` and the order body has
no contract fields. The OPT path adds:
- contract resolution via `/iserver/secdef/strikes` + `/iserver/secdef/info` (month/strike/right →
  the specific option conid), cached;
- an option order ticket (`secType:"OPT"`, the option conid, quantity in **contracts**);
- reconcile/`getPositions` mapping option conids back to `OptionPosition` rows.

**Human dependency (Graham):** the paper account `DUQ779121` needs **options trading permission** +
the **OPRA US options market-data** agreement enabled in the IBKR portal. Same approval class that
gated stock perms (D33) and FX perms (D62). Until then the adapter's OPT path can't be verified —
it stays VERIFY-LIVE, exactly like the FX path was before its perms landed. **Nothing about this is
blocked for the sim**, which is fully testable today.

---

## 9. Guardrails that are explicitly UNCHANGED

- Rule #1 — the §6 order gate and these rules are **humans-only**; Alfred proposes, the deterministic
  gate disposes. Alfred never writes `allowOptions`, the caps, or the gate.
- Rule #2 — the **kill switch** is checked before every order, options included (re-asserted in the
  broker seam).
- Rule #3 — **no shorting, no margin, no naked/written options.** Buy-to-open long calls/puts is the
  *only* relaxation, behind the toggle; short option legs remain impossible (the close-only SELL check).
- Rule #4 — integer cents, whole contracts. No floats.
- Rule #6 — **real money still never trades until the soak gate passes.** This ships against IBKR
  *paper* behind the OFF toggle; real-money options are a *separate, later, humans-only* flip after
  the soak, never auto-enabled by this work.

---

## 10. Build status / sequence

- **Phase A — foundation (soak-safe, additive):** `Settings.allowOptions` toggle + broker-seam
  enforcement (the real guardrail), `OptionPosition` model + `Order`/`Trade` option columns,
  `PlaceOrderInput.option`, `OPTIONS` policy, `breachesOptionPremiumCap` + unit tests.
- **Phase B — sim end-to-end (DONE — `tsc` clean + 52/52 tests):** `validateAndPlaceOption` gate
  branch (`agent/validator.ts`) · `SimBroker.fillOption` (open/close on the real `OptionPosition`
  ledger, USD-funded, no-margin + close-only SELL enforced) · NAV valuation (`getPortfolio` +
  `writeNavSnapshot` add held-option premium via `lib/options/order.ts valueOptionPositionsCad`) +
  the option commission helper. Soak-safe: zero positions ⇒ no CBOE fetch + NAV identical; toggle OFF
  ⇒ the sim rejects before any fill. **Deferred to Phase D's runner wiring** (only matters once options
  actually trade, so not dead-coded into the live runner now): tick-level mark refresh (cache a
  `lastMarkCents` so the hot NAV path reads a stored mark instead of fetching CBOE per call) + expiry
  settlement to intrinsic (sim) / reconcile-mirrored (IBKR). Until then `valueOptionPositionsCad`
  marks live (correct, just unoptimized) and is exercised only when positions exist.
- **Phase C — IBKR adapter:** OPT conid + order ticket + reconcile. ⚠️ blocked on Graham enabling
  options perms + OPRA market data on `DUQ779121`.
- **Phase D — Alfred's surface:** `propose_option_order` tool + context lines (options enabled, the
  rules, buy-to-open only) + the runner mark-refresh/expiry tick + dashboard/stock-page surfacing.

**Deploy reminders (when we ship):** bump `AGENT_VERSION` in the same build (D77); never redeploy
the agent within 10 min of a check-in slot; one batched build, watch `/var` disk.

---

## 11. Decision

Logged as **D99** in `docs/DECISIONS.md`. Owner: Cam (greenlit 2026-06-30, buy-to-open only, build
now against IBKR paper behind the OFF toggle; real-money options a later separate flip). Graham owns
the IBKR portal perms step.
