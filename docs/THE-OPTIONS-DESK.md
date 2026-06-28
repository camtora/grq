# The Options Desk — does the champion get sharper with options in hand?

Cam & Graham, 2026-06-27: *"We don't really understand options, and Graham's idea is to build
another test like The Race / The Bulls — pit our champion (Opus 4.8) against a version of itself
that ALSO has a tool to trade options. Is that feasible, how would it work, and teach us the
concepts along the way."*

**The idea:** run a Bulls-style sandbox with two entrants on the *same* book menu and cadence —
a **control** (Opus 4.8, stock-only, exactly what the fund does today) and a **treatment**
(Opus 4.8 + the power to *buy* call and put options). Watch which book compounds better over the
soak, and turn every option the treatment opens into a plain-English teaching card. Nobody's real
money is ever at risk — this lives entirely in the sandbox, like The Bulls.

This is a **design doc + living plan**. Decision record: `docs/DECISIONS.md` **D91**. Keep this file
in sync as it grows. Sibling docs: `docs/THE-RACE.md` (the shadow/Bulls scaffold we reuse — now
surfaced as **Second Opinions** `/race` + **Bull Races** `/bulls`), `docs/DECISIONS.md` D88 (the
options *data* layer we read today), `docs/LITERACY.md` (the teaching pillar this feeds).

**Status (2026-06-27): Phase 1 SHIPPED + deployed** (agent `v2.10-phase4`). Both arms live as the
seeded "House Desk" (CA$50k each, daily), reachable from the header **Experiments** dropdown. The
isolation + control-blocked-from-options + live-pricing path are all verified
(`scripts/verify-options-fill.ts` priced a real AAPL $285 call end-to-end). First real session fires
on the next market open (the tick is market-hours-only).

---

## 0. Options 101 — the part Cam & Graham asked us to teach (and the misconception to kill)

> **Options are NOT shorting.** That was the first guess, and it's the single most common beginner
> mix-up — worth untangling because the difference is the whole point of this experiment.

- **Shorting** a stock = borrow shares you don't own, sell them now, hope to buy them back cheaper.
  Profit if the price *falls*; loss is theoretically *unlimited* (a stock can rise forever); needs
  margin/borrowing. **GRQ bans this (guardrail #3) and it stays banned.**
- **An option** = a *contract* giving the **right, not the obligation**, to buy or sell **100 shares**
  at a fixed price ("**strike**") by a fixed date ("**expiry**"). You pay a "**premium**" for that right.

| You **buy** a… | You're betting the stock… | Max you can lose |
|---|---|---|
| **Call** (right to *buy* at the strike) | goes **up** (bullish) | the premium you paid — nothing more |
| **Put** (right to *sell* at the strike) | goes **down** (bearish) | the premium you paid — nothing more |

The three things that make options feel exotic:

1. **Leverage.** One contract controls 100 shares for a fraction of the cost. A 5% move in the stock
   can be a 50% move in the option. Cuts both ways.
2. **Defined risk *when you buy*.** Unlike shorting, the most you can lose buying a call or put is the
   premium. That is *safer* than shorting in that one respect — and it's why this experiment only
   ever **buys**.
3. **Time decay + implied volatility.** Options expire and bleed value every day the stock sits still
   ("theta"). You can be *right about direction and still lose* because you ran out of time, or because
   you overpaid when implied volatility (IV) was high. This is what kills beginners — and it's the most
   valuable thing the experiment will *show* you happening on real names.

⚠️ The genuinely dangerous corner of options is **selling/writing** them (collecting premium, taking on
the obligation) — *that* carries unlimited risk, just like shorting. **The Options Desk never sells/writes.
Buy-to-open only.** Defined risk, every time. (Scope confirmed by Cam, 2026-06-27.)

**Why this is the interesting comparison:** the live fund can only **buy, hold, or sell shares**. It has
no way to *profit from a stock falling* — the best it can do is not own it. A **put** gives it that power
for the first time. A **call** lets it make a leveraged bet on a name it's very confident about. So
"Opus + options" tests two capabilities the real fund simply does not have.

---

## 1. Why this is cheap to build (we already have ~90%)

Three facts make the rest small:

1. **The Bulls scaffold is a proven, gate-isolated sandbox.** `web/agent/race/engine.ts` already runs
   independent paper books per model (`Race` / `RaceEntrant` / `RacePosition` / `RaceTrade` / `RaceCall`
   / `RaceNavSnapshot`), fills them through a **light race gate** (`applyRaceFill`, `engine.ts:42`) that
   writes *only* to its own tables and **never imports `validator.ts`** or the broker. A bug here cannot
   touch the live fund (proven by `scripts/verify-bull-fill.ts`). The Options Desk is a sibling of this,
   with one new instrument type.
2. **The per-contract options chain already flows.** `fetchOptionChain(bareTicker)` (`web/lib/options/cboe.ts:35`)
   returns every strike/expiry with `iv`, `delta`, `gamma`, `oi`, `volume` for any US-listed name —
   free, keyless, ~15-min delayed. We compute D88's positioning signals from it today; we just don't
   *price/track individual contracts* yet.
3. **The shadow run loop is one-shot, no-tools, model-agnostic.** `runBullSession` (`engine.ts:139`) →
   decide → `parseProposal` → fill → snapshot is exactly the shape we need; we add an instrument leg and
   an options fill path.

---

## 2. The one real gap: the chain has no price field (yet)

`cboe.ts` parses `iv/delta/gamma/oi/volume` but **drops the contract's `bid`/`ask`/`last`** (they're in
CBOE's raw JSON — `cboe.ts:53-66` just doesn't read them). To open and mark a specific contract we need
a premium. Two honest paths, used together:

- **Primary — CBOE delayed mid.** Parse `bid`/`ask`/`last_trade_price` from the same feed; entry &
  daily mark = the bid/ask midpoint (delayed). This is a *real* (if delayed) market premium.
- **Fallback — Black-Scholes from the IV we already have.** When a contract has no quote (illiquid /
  zero bid), price it from `spot + strike + IV + time-to-expiry + a risk-free rate` (we already pull the
  US 10y/Fed funds via FRED). ~40 lines, no dependency.

Either way, the P&L is **modeled, not executable** — we banner it as such everywhere (see §7).

---

## 3. The honest hard parts (so we're calibrated)

This is harder than the stock Bulls in specific, bounded ways:

1. **A stock has one price; an option needs a contract pick + a non-linear daily re-mark.** As the stock
   moves, IV shifts, and time decays, value changes non-linearly. We re-fetch and re-price every session.
2. **US-only.** CBOE carries US-listed names; CA single names are dark. So the **treatment can only buy
   options on US names** (it can still hold stocks in both currencies). A footnote on the board, not a
   blocker.
3. **Expiry lifecycle.** Options expire to intrinsic value or zero — a lifecycle stocks never have. We
   add a daily mark + an expiry-settlement sweep (see §5).
4. **The interpretation trap.** If the treatment loses, is it options or our *modeling* of options P&L?
   We control for this by making the **contract choice deterministic** (§4) so the model picks a *thesis*,
   not a fiddly strike — removing degrees of freedom from the comparison.

---

## 4. The design

### Entrants (two, same context, CAD-denominated)
- **Control — `opus · stock-only`:** Opus 4.8, the existing champion behaviour. Buys/holds/sells shares only.
- **Treatment — `opus · options`:** Opus 4.8, a **superset** — it may buy/hold/sell shares *and*
  **buy-to-open calls/puts**. It later **sells-to-close** to realize, or lets a contract expire.

Both start with the same virtual stake (CAD), run the same daily (or hourly) cadence on the same tracked
universe menu, and are marked to live in CAD — a clean apples-to-apples NAV race.

### The treatment's new power: a `buy_option` decision
In shadow mode the model emits a fenced-JSON proposal (same pattern as `parseProposal`, `race/shadow.ts`).
For options it adds a small shape:

```json
{"action":"BUY_OPTION","underlying":"NVDA","right":"CALL","bias":"ATM","contracts":2,"confidence":80,"thesis":"..."}
```
- `right`: `CALL` (bullish) | `PUT` (bearish).
- `bias`: `ATM` | `SLIGHTLY_OTM` — a *coarse* aggressiveness dial, NOT a raw strike. We resolve it to a
  concrete contract deterministically (next monthly expiry **30–60 DTE**, strike nearest ATM, or the
  ~0.35–0.45-delta strike for `SLIGHTLY_OTM`). **This determinism is the experiment's control** (§3.4).
- `contracts`: whole contracts (× 100 shares of exposure each).
- Closing: `{"action":"SELL_OPTION","positionId":...,"contracts":N}` to realize before expiry.

### The fill gate (`applyOptionsFill` — sibling of `applyRaceFill`)
A **light sandbox gate**, never the §6 gate:
- Resolve `underlying + right + bias` → a concrete contract from `fetchOptionChain` (reject if the name
  has no US-listed options, or no priceable contract near the target).
- **Buy-to-open only** — no selling/writing to open, no shorting, no spreads (v1).
- Cost = `contracts × 100 × premiumCents + commission`. Premium = CBOE mid (or BS fallback).
- Commission = a simple **per-contract** model (~$0.65/contract, ~$1 min) — NOT the share commission.
- Caps reuse the bull `DIALS` spirit: a **per-trade premium cap** (e.g. ≤ a % of NAV — options are
  leveraged, so the *premium at risk* is the position size), a cash floor, and a weekly new-position cap.
- Writes only to the new OptionsDesk tables (§6) + the entrant's cash. Rejections land on the call audit.

### Isolation (non-negotiable, guardrail #1)
The Options Desk engine imports **none** of `validator.ts` / `placeOrder` / the broker. The model has no
tool that reaches the gate — it emits text, we parse it, we write to OptionsDesk tables. Identical
guarantee to The Bulls; the real fund stays byte-identical (add an `verify-options-fill.ts` mirror of
`verify-bull-fill.ts`). **This does not violate guardrail #3** — that bans options on the *real broker
path*; this is a sandbox that never trades real options, exactly like The Bulls never really buy stock.

---

## 5. Marking & the expiry lifecycle (the teaching engine)

Every session (and at least once daily), for each open option position:
- **Re-fetch the chain**, find the held contract, mark to CBOE mid (or BS fallback). Append a NAV point —
  even on HOLD — so the P&L line captures **time decay** drifting against you.
- **On/after expiry:** settle deterministically to intrinsic value —
  `CALL: max(0, spot − strike) × 100 × contracts`, `PUT: max(0, strike − spot) × 100 × contracts` —
  credit cash, close the position. If out-of-the-money → **0** (the whole premium is lost). *This is the
  single best time-decay lesson the experiment produces, and it writes itself into a teaching card.*

---

## 6. Schema — new, additive tables (one `prisma db push`)

A dedicated, isolated set (mirrors the `Race*` family). A **position is polymorphic**: `kind = STOCK |
CALL | PUT`, with strike/expiry null for stock — so control and treatment share one leaderboard and one
NAV math.

```prisma
model OptionsDesk {           // the contest config (≈ Race)
  id Int @id @default(autoincrement())
  name String
  status String @default("RUNNING")   // RUNNING | PAUSED | ENDED
  cadence String @default("daily")     // daily | hourly
  startingStakeCents Int @default(5000000)  // CA$50k, matching the shadow stake
  createdAt DateTime @default(now())
  startedAt DateTime?  endedAt DateTime?
  entrants OptionsEntrant[]
}
model OptionsEntrant {        // a player (≈ RaceEntrant)
  id Int @id @default(autoincrement())
  deskId Int
  model String                 // "claude-opus-4-8"
  arm String                   // "control" | "treatment"
  label String  cashCents Int
  status String @default("ACTIVE")
  positions OptionsPosition[]  trades OptionsTrade[]  calls OptionsCall[]  navSnaps OptionsNavSnapshot[]
}
model OptionsPosition {       // a stock OR an option leg
  id Int @id @default(autoincrement())
  entrantId Int
  kind String                  // STOCK | CALL | PUT
  underlying String            // bare ticker
  strikeCents Int?  expiry String?   // null for STOCK
  qty Int                      // shares (STOCK) or contracts (CALL/PUT)
  avgCostCents Int             // per-share avg (STOCK) or per-share premium (option)
  currency String @default("USD")
  openedAt DateTime @default(now())
}
model OptionsTrade {
  id Int @id @default(autoincrement())
  entrantId Int  sessionAt DateTime
  kind String  underlying String  strikeCents Int?  expiry String?
  side String                  // BUY | SELL | BUY_TO_OPEN | SELL_TO_CLOSE | EXPIRE
  qty Int  priceCents Int  currency String @default("USD")
  commissionCents Int  realizedPnlCents Int?
}
model OptionsCall {           // per-session decision audit (≈ RaceCall)
  id Int @id @default(autoincrement())
  entrantId Int  sessionAt DateTime
  action String?  underlying String?  right String?  strikeCents Int?  expiry String?
  qty Int?  confidence Int?  thesis String?  text String
  filled Boolean @default(false)  rejectReason String?
}
model OptionsNavSnapshot {
  id Int @id @default(autoincrement())
  entrantId Int  at DateTime @default(now())
  navCadCents Int  cashCents Int  positionsCadCents Int
}
```

> Reuse note: the fill MATH (ACB, FX via `lib/fx.ts toCadCents`, NAV marking) is lifted from
> `engine.ts`; only the *instrument* is new. We do **not** fold into the `Race*` tables — a separate
> namespace keeps the leaderboard, the controls, and the literacy cards cleanly scoped.

---

## 7. The page — `/options-desk` (and honest framing)

A new top-level destination beside `/race` and `/bulls`. Per the Bulls pattern (`app/bulls/page.tsx`):
- **Leaderboard:** control vs treatment — NAV, return %, and (treatment only) an **options sleeve** line:
  premium at risk, # open contracts, nearest expiry, realized option P&L.
- **NAV chart:** both arms over time, the real Opus fund as a faint reference line.
- **Per-position expand:** each open option shows the plain-English card (§8).
- **Permanent banner:** *"Sandbox · modeled option prices (CBOE delayed / Black-Scholes) · educational,
  not executable · the fund never trades options."* Money framing stays un-funny (CLAUDE.md voice rule).

---

## 8. The learning surface (why we're really building this)

This is a financial-literacy product as much as an experiment (`docs/LITERACY.md`). Every option the
treatment opens becomes a **teaching card**, reusing the existing glossary `<Term>` / explainer pattern:

> **Treatment bought 2 NVDA Aug-15 $180 CALLs at $4.20.**
> *Plain English:* it's betting NVDA rises above **$184.20** (strike + premium) by Aug 15. It paid
> **$840** total (2 × 100 × $4.20) — and **$840 is the absolute most it can lose**. Right now time decay
> is costing it ~$12/day, so NVDA needs to *move*, not drift.

Each card auto-updates as the position marks, and the **expiry settlement** writes the punchline ("expired
worthless — the whole $840 premium gone; the stock was right but too slow" / "closed at $9.10, +117%").
Over a couple weeks Cam & Graham *watch* leverage, theta, and IV play out on names they already follow —
which teaches options far better than a glossary entry. The contest is the bait; the literacy is the catch.

A short companion explainer (`/how-it-works` tab or a glossary section) covers the five terms once:
**strike · expiry · premium · call vs put · time decay**. Everything else is taught in situ by the cards.

---

## 9. Phased plan

### Phase 0 — this doc · **DONE (2026-06-27)**
Scope locked with Cam: **buy-to-open calls & puts only**, control-vs-treatment, design-doc-first.

### Phase 1 — engine + a standing desk + `/options-desk` · **SHIPPED 2026-06-27**
- ✅ `cboe.ts` now keeps `bid`/`ask`/`last` (additive — D88 signals untouched); `lib/options/price.ts`
  = CBOE mid → last → Black-Scholes fallback, intrinsic-at-expiry, deterministic `pickContract`.
- ✅ `web/agent/options-desk/` — `engine.ts` (`applyDeskFill` routing stock + `applyOptionOpen`/
  `applyOptionClose` + `settleExpiries` + `snapshotDeskNav` + `runDeskTick`), `context.ts` (per-arm
  prompt + book), `parse.ts` (`parseDeskCall` + the control/treatment suffixes). Wired into `runner.ts`
  beside `runRaceTick`. `DESK` config + `AGENT_VERSION` bump in `policy.ts`.
- ✅ Schema (§6) pushed (`DeskEntrant`/`DeskPosition`/`DeskTrade`/`DeskCall`/`DeskNavSnapshot`). Seeded
  "House Desk" (control + treatment, CA$50k) via `scripts/seed-options-desk.ts`.
- ✅ `/options-desk` two-arm board (reuses `BullChart`) + `DeskRow` with plain-English option cards +
  five-terms explainer. Surfaced via the header **Experiments** dropdown (`NavBar.tsx`).
- ✅ `scripts/verify-options-fill.ts` — real fund byte-identical after a fill; control arm hard-blocked
  from options; priced a live AAPL $285 call.
- **Exit met:** isolation proven, the board renders both arms, nothing touches the §6 gate or broker.
  The first *live* session lands on the next market open (the tick is market-hours-only).

### Phase 2 — the literacy layer + member controls · **SHIPPED 2026-06-28 (D92, agent v2.13-phase4)**

> **Status: all four workstreams (A–D) built, deployed, verified.** A (punchline cards) + B (member
> controls) web-only; C (muteable `optionsDesk` push nudge, default on) + D (per-option decay sparkline,
> new `DeskPositionMark` table) touched the agent + schema and went out in one batch (one `prisma db push`,
> `AGENT_VERSION`→v2.13-phase4). `tsc` clean; B's routes round-tripped with the viewer-403 guard proven.
> The Resolved-options section + the decay sparkline populate as the desk runs live (first sessions Mon
> 2026-06-29). The §6 gate, the broker, and guardrail #3 are untouched. Decision record: `docs/DECISIONS.md` D92.

Phase 1 already gives us most of "auto-updating cards": open-position cards re-mark on every page load
(`loadDesk` reads live marks) and the engine refreshes marks each session. So Phase 2 is the four
workstreams below — A and B are **web-only** (no agent rebuild, zero soak impact); C and D touch the
**agent engine** so they batch into one rebuild (+ `AGENT_VERSION` bump, mind the check-in timing rule).

**A. The expiry / close "punchline" card** *(web-only — the actual missing piece; §8's payoff)*
Closed/expired options currently have **no surface at all** — `DeskTrade` rows carry `realizedPnlCents`
for `SELL_TO_CLOSE` and `EXPIRE`, but `DeskRow` never renders them.
- `lib/options-desk/desk.ts`: a `closedCard()` generator + load resolved option trades into each
  `DeskStanding` (e.g. a `resolved[]` field).
- `components/desk/DeskRow.tsx`: a new "Resolved" section — *"expired worthless — the whole $840
  premium gone; NVDA was right but too slow"* / *"closed at $9.10, +117%"*, with realized $ and %.

**B. Member desk controls** *(web-only — mirror the bulls scaffold)*
- `app/api/desk/[id]/route.ts` — POST `start|pause|end|reset|delete`, clone of
  `app/api/bulls/[id]/route.ts` with `race*`→`desk*` tables, guarded by `memberFromRequest`.
- `app/api/desk/route.ts` — POST create; a new desk is always control+treatment, so the form is simpler
  than bulls (name · cadence · stake).
- `components/desk/DeskControls.tsx` + `NewDeskForm.tsx` — clones of `RaceControls` / `NewRaceForm`.
- `app/options-desk/page.tsx`: pass `isMember` from the session so controls render member-only (the
  route guards are the real lock; the UI is defense-in-depth).

**C. Push / Discord nudge** *(agent — rebuild + version bump)* — **decision: its own muteable category,
default ON.**
- `lib/push/categories.ts`: a new `optionsDesk` category (independently muteable like `holdingChecks`,
  NOT in the trades/risk always-on tier).
- `agent/options-desk/engine.ts`: `notifyOut()` on a treatment **open** and on an **expiry/close**,
  deep-linking to `/options-desk` ("go read the card").

**D. Per-option premium-decay history** *(schema + agent + web)* — **decision: build it.** The doc's #1
lesson ("watch time decay") needs a value-over-time line, but today only `lastMarkCents` is stored
(overwritten each session).
- Schema: a tiny `DeskPositionMark { positionId, at, markCents }` table (one `prisma db push`).
- `agent/options-desk/engine.ts` `refreshOptionMarks()`: append a mark row each session (not just
  overwrite `lastMarkCents`).
- `lib/options-desk/desk.ts` + `DeskRow.tsx`: a small decay **sparkline** per option card — literally
  watching theta/IV play out on names Cam & Graham already follow.

**Build order:** ship A+B first (web-only, lights up as Monday's live sessions run), then batch C+D into
one agent rebuild. Assign a D-number in `docs/DECISIONS.md` + a `PROJECT_PLAN.md` §13 line on build.

### Phase 3 (deferred / maybe-never)
Vertical spreads · premium-selling (re-opens unlimited risk — keep off) · a treatment that also *reads*
the D88 GEX/skew signals as inputs · letting members brief the desk like the Hunt. Out of scope until v1
teaches us something.

---

## 10. Cost, cadence, and operational notes

- **Token cost:** the treatment + control are 2 model calls/session. Daily cadence ≈ a handful of Opus
  calls/day on the Max token — trivial next to the boot scan. Metered challengers (if we ever add a
  non-Opus arm) fold into the existing `RACE.maxUsdPerDay` cap.
- **Agent change → rebuild `agent` + bump `AGENT_VERSION`** (D77). Mind the **startup-scan token guard**
  and the **don't-redeploy-within-10-min-of-a-check-in** rule.
- **`scripts/` is not in the agent image** (`.dockerignore`) — run seed/verify host-side.
- **Zero soak impact.** Pure sandbox; the real IBKR-paper soak clock is untouched. Assign a D-number in
  `docs/DECISIONS.md` on build and add a one-liner to `PROJECT_PLAN.md` §13.

---

## 11. Open questions (for Cam & Graham)

1. **Name.** "The Options Desk" (current). Alternatives: *The Greeks · Long Shots · The Leverage Lab.*
2. **Cadence.** Daily (cleaner teaching cadence, cheaper) vs hourly (more decisions, more theta drama).
   Lean daily for v1.
3. **Does the treatment also keep trading stocks, or options-only?** Recommended: **superset** (stocks +
   options) so it's "Opus, *plus* a new power," not a hobbled options-only bot — the fairest read of
   "the champion with an options tool."
4. **Should the treatment see the D88 GEX/skew signals?** Deferred to Phase 3 — v1 isolates the *capability*
   (can it use options well?) from the *extra data* (does dealer-gamma help?).

---

## 12. The test design — phases, and what's in / out (and why)

**The one rule everything below serves:** a comparison only means something if **exactly one thing differs**
between the two arms. Here that one thing is *the options power*. Every "include" keeps the two arms
identical; every "exclude" either protects that isolation, keeps us safe/defined-risk, or is a data/cost
limit we chose not to fight yet. Read this as the rationale Cam & Graham can point back to.

### Phases at a glance

| Phase | What it adds | Status | Why now / why not yet |
|---|---|---|---|
| **0 — Design** | This doc; scope locked (buy-only, control-vs-treatment) | ✅ done 2026-06-27 | Agree the *shape* before writing the engine. |
| **1 — Engine + desk + page** | The two-arm sandbox, options pricing/marking/expiry, the board + teaching cards | ✅ shipped 2026-06-27 (D91) | Prove the mechanism + isolation cheaply; start collecting real sessions. |
| **2 — Literacy + controls** | Expiry/close "punchline" card, member desk controls, a muteable push nudge (default on), per-option decay sparkline | ✅ shipped 2026-06-28 (D92, v2.13-phase4) | Only worth polishing the teaching surface once we know the engine behaves. |
| **3 — Deferred / maybe** | Tooled arms (see C below), vertical spreads, an options *overlay* on the real fund, feeding it D88 GEX/skew, member-briefed desk | not started | Each adds cost or a second variable; revisit *after* v1 teaches us something. |

### What's IN — and why

- **Two arms, both sandbox, both no-tools (control = stock-only, treatment = stock + options).** This is the
  whole test. Holding the model, the book size (CA$50k), the menu, the cadence, and the toolset all
  *constant* means any P&L gap is attributable to options and nothing else.
- **Buy calls AND puts.** The call tests leveraged conviction; the put tests a capability the live fund
  *doesn't have at all* — profiting from a decline. Excluding either would only half-answer the question.
- **Buy-to-open only (defined risk).** When you *buy* an option the most you can lose is the premium. That
  keeps the whole experiment inside the fund's no-unlimited-risk spirit, keeps every position explainable
  ("max loss = $X"), and makes the teaching cards honest.
- **Deterministic contract selection** (next 30–60-DTE expiry, ATM / slightly-OTM by delta — the model picks
  underlying + direction + a coarse bias, not a raw strike). Strike/expiry micro-optimization is a *second*
  variable; pinning it down keeps the test about judgment, not contract-fiddling.
- **Modeled pricing** (CBOE delayed mid → last → Black-Scholes from IV; expiry → intrinsic). Free, good
  enough for a sandbox, and bannered as "modeled, not executable" so nobody mistakes it for a track record.
- **The real fund shown as a reference line (not a scored competitor).** You can eyeball how both blind arms
  stack up against the live tooled fund without letting that comparison *confound* the A/B (see B below).
- **Plain-English teaching cards as a first-class goal.** The literacy payoff (`docs/LITERACY.md`) is half the
  point, not a nice-to-have — watching theta/leverage/expiry play out on real names is the lesson.

### What's OUT — and why

**Out by *choice* (protects the test or defers cost):**
- **The real live agent as the control.** *(This is the most important exclusion.)* If the control were the
  real tooled fund, the two arms would differ on **two** axes — options-vs-not *and* tooled-real-book-vs-blind
  sandbox — so a result couldn't be attributed to options. The control must be a clean-room sibling of the
  treatment. The real fund stays a reference line only.
- **Tools / research for either arm.** Both arms are deliberately "blind" (frozen prompt, one shot, no web).
  That keeps the isolation clean *and* the cost trivial. The trade-off is realism — neither arm researches
  the way the real fund does. The upgrade path (**"Option C": both arms tooled**) is a Phase-3 idea, gated on
  cost (tools = many more Opus calls/session) and only worth it if blind play feels too artificial.
- **Selling / writing options.** This is the dangerous corner — *unlimited* risk, like shorting. Excluding it
  is what keeps every position defined-risk. Off until/unless deliberately revisited.
- **Spreads / multi-leg.** ~2–3× the pricing-and-marking complexity and a harder teaching story for a marginal
  v1 gain. Deferred to Phase 3.
- **Feeding the desk the D88 dealer-gamma / IV-skew signals.** That would test a *different* question ("does
  the options *data* help?"). Kept separate so v1 answers only "can it use options well?"
- **Elaborate option risk dials.** v1 uses one simple guard — a premium-at-risk cap (% of NAV) + a weekly
  open cap. No per-underlying option position caps or stops yet; don't over-engineer before we see behavior.

**Out by *constraint* (not a choice):**
- **Canadian single names.** CBOE's free chain is US-listed only; there's no free options data for TSX names,
  so the treatment can only buy options on US underlyings (it can still hold CA *stocks*). A data limit.
- **Real money / real options trading — ever.** Hard guardrail #3. This is permanently a sandbox; it never
  routes an order through the §6 gate or the broker, and never trades a real option.
