# Options Education Portal — learn / play / watch / ask (D100)

**Status:** planned (2026-06-30). A new top-level **`/options`** hub for Cam & Graham to *learn* how
options work, *play* with an interactive payoff calculator (the optionsprofitcalculator.com
equivalent), *watch* the Options Desk experiment's real fake positions decay over time, and *ask*
chat about any of it. Education-first, modeled-only, **never executable**. Grows over time —
content modules and strategy presets are additive.

> This is a **learning surface**, not a trading path. It touches none of the §6 order gate, the
> broker, or the live fund. It is distinct from:
> - **The Options Desk** (`/options-desk`, `docs/THE-OPTIONS-DESK.md`) — the Opus stock-only vs
>   Opus+options A/B sandbox. The portal *surfaces* its positions in a teaching-first view but does
>   not change it.
> - **Alfred Options** (`docs/ALFRED-OPTIONS.md`, D99) — giving the *real fund* the power to buy-to-open
>   calls/puts behind an OFF toggle. Unrelated to this portal.

---

## 1. Goal & scope

Teach two non-experts (Cam & Graham) options four ways, in one place, in GRQ's voice:

1. **Learn** — structured lessons + tap-to-explain glossary (the literacy pillar).
2. **Calculator** — pick a strategy, set inputs, see the profit/loss diagram, break-evens, greeks,
   and a price×date P/L table. Prefill from real, live option chains.
3. **Experiment** — the Options Desk's *actual* open contracts, their plain-English cards, and their
   value/decay over time; one click loads any of them into the calculator.
4. **Ask** — chat that understands options, can show what the experiment holds, and can suggest
   contracts to play with (educational, never advice).

**Decisions locked (Cam, 2026-06-30):**
- **Placement:** a new **top-level `/options`** destination (7th primary nav tab), not the Experiments
  dropdown. The existing `/options-desk` stays as-is and is linked as the Experiment tab.
- **v1 strategy set (4):** **long call · long put · covered call · cash-secured put** — the buy-side
  the fund/experiment actually use, plus the two everyone meets first. (Teaching the two *short*-leg
  strategies is deliberate contrast: the fund only ever *buys* options; covered call / CSP show what
  selling looks like and why it's a different risk animal. Modeled only — the fund never writes options.)
- **Live data in v1:** yes — wire the live CBOE chain so you can type a real ticker and load real
  strikes/premiums/IV, and load the experiment's actual contracts.

**Out of scope (for now):** multi-leg spreads / straddles / condors (Phase 5), mobile parity,
real Greeks term-structure, anything executable.

---

## 2. The big lever: most of the engine already exists

| Need | Already in repo | Gap to build |
|---|---|---|
| Option pricing | `web/lib/options/price.ts` — Black-Scholes, intrinsic, `daysToExpiry`, `markContract`. **Pure, no I/O, client-safe** (type-only imports). | — reuse directly |
| Live chains | `web/lib/options/cboe.ts` — `fetchOptionChain(ticker)`: free, keyless, US chains **with greeks/IV/OI/bid-ask**. | a read-only API route to expose it to the client |
| Experiment positions + value-over-time | `loadDesk()` returns each option holding with `strikeCents`/`expiry`/`breakevenCents`/`maxLossCadCents`/`daysLeft`/plain-English `card`/**`decay` series** (per-session premium history, `DeskPositionMark` table). | a teaching-first view + "load into calculator" |
| Literacy | `Term` + `/api/explain` + `web/lib/glossary.ts` (already has `call-option`, `put-option`, `implied-volatility`, `gamma-exposure`, …). | add ~10 option glossary keys |
| Chat | Opus 4.8, tool-enabled, read-only; already sees the CBOE positioning *signal*. | persona + experiment-positions context + one tool |
| Design primitives | `ui.tsx` (`PageHeader`/`Card`/`PanelHeader`/`Button`/`Chip`/`StatCard`/`EmptyState`), themed CSS vars. | — reuse |

**Must build fresh:** a payoff-diagram chart (none exists today), a Black-Scholes **greeks** module
(we currently only *read* greeks from CBOE, never compute them), a multi-leg **payoff/P&L engine**,
the portal page, and chat options-awareness.

---

## 3. Information architecture

```
/options  (new top-level hub; light sub-tab switcher, server component swaps sections)
├─ Learn        structured lessons + glossary
├─ Calculator   the interactive payoff tool          ← the centerpiece
├─ Experiment   Options Desk live positions + value-over-time + "load into calculator"
└─ Ask          options-aware chat entry
```

Tabs are a query param (`?tab=calculator`) so chat / the experiment can deep-link pre-filled
(`/options?tab=calculator&sym=NVDA&strat=long-call&strike=…&exp=…`). `/options-desk` is unchanged
and linked from the Experiment tab.

---

## 4. The calculator engine (the core build)

### 4.1 Payoff engine — `web/lib/options/payoff.ts` (new, pure, integer cents, no floats)

A strategy is a list of **legs**:
```
Leg =
  | { kind: "STOCK",        action: "BUY"|"SELL", qty, entryCents }
  | { kind: "CALL"|"PUT",   action: "BUY"|"SELL", qty, strikeCents, premiumCents, multiplier=100 }
```
P/L (cents) at a given spot:
- stock BUY  `qty·(spot − entry)`     · stock SELL `qty·(entry − spot)`
- option BUY `qty·mult·(intrinsic(spot) − premium)` · option SELL `qty·mult·(premium − intrinsic(spot))`

(`intrinsic` from `price.ts`.) This covers all four v1 strategies (covered call = long stock + short
call; CSP = short put + reserved cash). Engine also returns **break-even(s)** (where total P/L crosses
0, found by scanning the strike-segmented payoff), **max profit / max loss**, and **net debit/credit**.

### 4.2 Greeks — `web/lib/options/greeks.ts` (new, pure)

Black-Scholes **delta / gamma / theta / vega** (reusing `normCdf` + `RISK_FREE` from `price.ts`), so
the calculator shows greeks even on a contract CBOE doesn't quote and can roll the "today / +N days"
theoretical premium curves (hold IV fixed — the OPC assumption, stated honestly in the UI).

### 4.3 Payoff chart — `web/components/options/PayoffChart.tsx` (new, `"use client"`)

Inline SVG, **no charting lib**. Modeled on:
- **`BullChart`** — for labeled axes + the bold **break-even baseline** it already draws at y=0.
- **`PriceChart`** — for the **hover-crosshair readout** (`onMove`/`hoverIdx` pattern, HTML dot overlay).

Renders: an **at-expiry** P/L line + a draggable **"as-of date"** line (theoretical, via greeks),
profit region shaded `var(--spark-up)` / loss `var(--spark-down)`, a vertical marker at the current
spot, break-even dots, max-profit/loss annotations. Theme via CSS vars — **no hardcoded hex** (the
`components/race/Sparkline.tsx` hex is the anti-pattern; don't copy it).

### 4.4 P/L table (OPC's signature view)

Price **rows** × date **columns** (today → expiry), each cell the P/L shaded green/red, plus an
optional **probability** column derived from IV (lognormal terminal-price distribution). Reuses the
payoff + greeks engines; pure render.

### 4.5 Strategy presets

`web/lib/options/strategies.ts` (new): the 4 presets as leg-builders + a one-line plain-English
thesis + which inputs they expose. Adding Phase-5 strategies = adding entries here.

---

## 5. Live data wiring

- **`web/app/api/options/chain/[symbol]/route.ts`** (new, read-only, viewer-readable): wraps
  `fetchOptionChain(bareUsTicker(symbol))` → returns spot + expiries + per-strike {mid, IV, greeks,
  OI} for the client to populate the strike/expiry pickers and prefill premium/IV from a **real**
  contract. Lightly cached (the chain is ~15-min delayed anyway); US-only → CA names return "no
  listed options," same honest empty state the stock-page `OptionsPanel` uses.
- Underlying spot also available via the existing quotes path for the chart's "current price" marker.

---

## 6. The Experiment bridge ("see the values of fake options over time")

The **Experiment** tab reads `loadDesk()` and renders, for both arms:
- each **open option** holding: the existing plain-English `card`, breakeven, max-loss, `daysLeft`,
  and the **`decay`** series (from `DeskPositionMark`) as a fuller value-over-time chart — not just
  the tiny sparkline the desk row shows;
- a **"Load into calculator"** button on every contract → deep-links to the Calculator tab pre-filled
  with that strike/expiry/premium so you can scrub its payoff and watch modeled decay;
- the **resolved** options (the "punchline" cards — expired worthless / closed +X%).

**Known data caveat (from the desk model):** `DeskPositionMark` rows cascade-delete when a position
closes/expires, so *resolved* options keep only the final `realizedPnlCents`/`returnPct`, not a value
curve. Open positions have the full decay series. The calculator fills the forward view with the
Black-Scholes model regardless, so this is cosmetic; a durable per-contract mark history is a Phase-5
nicety if we want decay curves on closed contracts too.

---

## 7. Chat understands options

Files: `web/agent/chat-server.ts`, `web/agent/tools.ts`, `web/agent/context.ts`.

- **Persona** (`CHAT_PERSONA`, chat-server.ts:19): relax the blanket "the fund never trades options"
  framing to allow *explaining* and *suggesting* options as **education** — still read-only, still
  "I can't and won't place trades," still clearly "modeled, not advice."
- **Context block:** inject the experiment's current desk option positions (chat already sees the CBOE
  positioning signal via `context.ts:308`; it does **not** see `DeskPosition`s today).
- **Tool:** add one read-only tool `get_options_desk` to `makeReadOnlyServer()` /
  `GRQ_READONLY_TOOL_NAMES` (tools.ts:648-661) that returns `loadDesk()` standings + holdings;
  optionally `get_option_chain(symbol)` so it can reason about real strikes.
- **"Suggest some":** chat proposes hypothetical contracts in plain English, framed *educational, not
  advice, not executable*, and can hand back a deep link into the calculator (`/options?tab=calculator&…`).

---

## 8. Education content + glossary

- **Lessons** (`web/lib/options/lessons.ts` or `shared/content/` if we want mobile reuse): what an
  option is, calls vs puts, moneyness, premium = intrinsic + extrinsic, the four greeks, time decay,
  implied volatility, the strategy zoo. Every term wrapped in `<Term>`.
- **Glossary:** add the missing keys to `web/lib/glossary.ts` — `strike`, `premium`, `intrinsic-value`,
  `extrinsic-value`, `moneyness`, `break-even`, `time-decay`/`theta`, `vega`, `delta`, `gamma`,
  `covered-call`, `cash-secured-put`, `payoff-diagram` — instantly explainable everywhere via `<Term>`
  and `StatCard term=`.
- Reuse / upgrade the existing "Options in five terms" copy from the desk page as the Learn intro.

---

## 9. Design & conventions (per `docs/DESIGN.md`)

Server-component page; interactive calculator split into `"use client"` widgets. `PageHeader` for the
title, `PanelHeader` (outside) + `Card` (inside) panels, `Button`/`Chip`/`StatCard`/`EmptyState` from
`ui.tsx`, `Money`/`Pnl` for cents, `Term`/glossary for every figure. Theme via teal/red/emerald/amber
ramps + CSS vars only — **no raw hex, no white/black/gray**. Register the hub by appending one
`NavLink` to **`PRIMARY`** in `web/components/NavBar.tsx:17-24`.

---

## 10. Guardrails / honesty (unchanged)

- **Modeled & educational, never executable** — the permanent banner the Options Desk carries, on
  every calculator and experiment view (CBOE delayed ~15-min mid, or Black-Scholes from IV).
- **US-only** (CBOE); CA names dark, honest empty state.
- **Integer cents, whole contracts, no floats** (rule #4) — the entire payoff/greeks engine is cents-based.
- Touches **none** of the §6 gate, the broker, or the live fund. The "no options" fund guardrail
  (rule #3 / `Settings.allowOptions`) is unaffected.

---

## 11. Phasing

- **Phase 1 — Hub + Learn + Calculator. ✅ BUILT (2026-06-30, not deployed).** New `/options` route + nav
  tab, the payoff + greeks engines, `PayoffChart`, the 4 strategy presets, the Learn lessons + 16 glossary
  keys, live CBOE prefill (the chain API route). Pure client math + one read-only route.
- **Phase 2 — P/L table + probability. ✅ BUILT.** `PnlTable` (price×date heat grid), `lib/options/probability.ts`
  (driftless-lognormal `probAbove` + `probOfProfit`), prob-of-profit header, live Greeks already shipped in P1.
- **Phase 3 — The Experiment bridge. ✅ BUILT.** `ExperimentOptions` reads `loadDesk()` → the treatment's
  actual open + resolved contracts with the plain-English card, break-even/max-loss/days-left, the decay
  value-over-time sparkline, and a one-click "load into calculator" deep link (sym+strat+strike+exp → the
  calculator selects that contract from the live chain).
- **Phase 4 — Chat options-awareness. ✅ BUILT (needs `chat` rebuild to deploy).** `get_options_desk`
  read-only tool (`agent/tools.ts`, wired into `makeReadOnlyServer` + `GRQ_READONLY_TOOL_NAMES`) + the
  `CHAT_PERSONA` options-education block (explain / show the experiment / suggest hypotheticals → deep-link
  the calculator; still read-only, fund still never trades options).
- **Phase 5 — Grow. ◐ IN PROGRESS (2026-06-30, deployed).** ✅ **Multi-leg strategies** — the calculator
  went 4 → **8** (added bull call spread, bear put spread, long straddle, long strangle). Strategies are now
  **leg templates** (`strategies.ts`: `LegTemplate`/`optionTemplates`/`seedLegs`/`buildStrategyLegs`); the
  calculator edits each leg (per-leg strike/premium + chain strike-picker + fair-value) and the payoff/greeks/
  probability engines were unchanged (already `Leg[]`-based). ✅ **Saved scenarios** — name/save/load/delete
  calculator setups in `localStorage`. ✅ **Greeks-vs-price visualizer** (`GreeksChart.tsx`) — plot delta/gamma/
  theta/vega across the underlying price. ✅ **Deeper per-strategy explanations** — each strategy carries `view`/
  `profitWhen`/`lossWhen`/`decay`/`example`/`bestFor`, rendered as a labelled panel on the calculator. ✅
  **Durable per-contract mark history** — `DeskTrade.markHistory Json?` (additive, pushed to prod); the desk
  engine (`agent v2.33-phase4`) snapshots each option's decay curve at close/expire *before* the `DeskPositionMark`
  rows cascade away, so **closed** desk contracts keep a value-over-time line (`loadDesk` → `DeskResolved.decay`,
  rendered in the Experiment tab). **Still open in Phase 5:** **mobile parity** (iOS contract + SwiftUI).

**Verification (all phases):** **74/74** unit tests green (`web/test/options-payoff.test.ts` — payoff, greeks,
probability, the multi-leg builder), `tsc --noEmit` 0 errors, every tab + the deep-link + the live chain API +
the 8-strategy calculator smoke-tested 200 via `next dev`. Deployed (web + chat) 2026-06-30; not committed.

---

## 12. Decision

Logged as **D100** in `docs/DECISIONS.md`. Owner: Cam. Greenlit 2026-06-30 — top-level `/options` hub,
core-4 strategies, live CBOE chains in v1. Phases 1–4 built + deployed (web+chat) 2026-06-30.
