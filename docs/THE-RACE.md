# The Race — a multi-model bake-off for GRQ's decisions

Cam, 2026-06-24: *"Right now we're using Opus 4.8 for everything. I'd like a second agent
on a different model — see what different models **choose** to do from the same data,
without doing it."*

**The idea:** keep Opus as the live decision-maker, but at every check-in feed the *exact same
data* to one or more **challenger** models and record what they *would* have done — no real
order, just a proposal with receipts. Over the soak this becomes a model bake-off you can score
against real outcomes. On-brand: *"Get rich quick, slowly, with receipts."*

This is a **design doc + living plan**. Decision record: `docs/DECISIONS.md` **D68** (assign on
build). Keep this file in sync as the feature grows.

---

## Why this is cheap to build

The codebase is already ~80% shaped for it. Three facts make the rest small:

1. **One funnel.** Every model call — research, decisions, triage, reports — goes through
   `runSession()` in `web/agent/sessions.ts:47`, which calls `query()` from
   `@anthropic-ai/claude-agent-sdk` (`web/package.json:13`).
2. **The data is already a portable text blob.** `buildContext()`
   (`web/agent/context.ts:18`) returns one big string — fund state, positions, signals, macro,
   scoreboard, lessons, focus. Nothing about it is Claude-specific. That *is* the "same set of
   data" artifact, already built. Snapshot it once, fan it out to N models.
3. **Research is already a non-trading surface.** `web/agent/tools.ts` defines three tool
   servers: `grqServer` (full — includes `propose_order`/`promote_to_universe`),
   `grqResearchServer` (`tools.ts:487` — reads + `write_journal` only, **cannot trade**), and
   `grqReadOnlyServer` (pure reads). Dossier / hunt / smart-money sessions already run on the
   research toolset. Separating research from trading isn't a refactor — it's a config knob.

---

## The one real constraint

The Agent SDK is **Anthropic-shaped** and auths via **Cam's Claude Max OAuth token**
(`CLAUDE_CODE_OAUTH_TOKEN` from `.env`, via `env_file`) — not a metered API key. The SDK
natively speaks only the Anthropic Messages API. So the difficulty of "a second model" depends
entirely on whether it's a Claude or not:

### Tier A — another Claude (trivial)
Add `MODELS.challenger` (or similar) next to `MODELS.decision` in `web/agent/policy.ts:98` and
pass it to a session. Zero new auth, zero architecture — exactly what `MODELS.triage` (Haiku)
already does. **Sonnet 4.6 (`claude-sonnet-4-6`) lives here.** This is Phase 1.

### Tier B — non-Claude via an Anthropic-compatible proxy
The SDK respects `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN`. Point it at a translation proxy
(LiteLLM or `claude-code-router`) that accepts Anthropic-format requests and forwards to
OpenAI / Gemini / GLM / a local endpoint. The SDK's MCP tools keep working *if* the target
supports function-calling. Catches:
- Base URL is read at process init → the challenger runs as a **separate process/container**
  with its own env (you can't keep one process pointed at both real Anthropic and a proxy).
- Bills a **metered API key** (real $), not the Max token.

### Tier C — a hand-rolled, provider-agnostic loop (preferred for the shadow path)
Bypass the SDK for the *shadow* runs and write a tiny function-calling loop against native APIs
— or **OpenRouter** as a single endpoint reaching GPT, Gemini, GLM, Gemma, DeepSeek, Qwen with
one key. The shadow toolset is only 4 read-only tools (`GRQ_RESEARCH_TOOL_NAMES`,
`tools.ts:493`) plus a propose-only tool, so the loop is genuinely small — and it never imports
the trade gate, which keeps us cleanly inside guardrail rule #1.

---

## The shadow design: "what would it choose, without doing it"

This is the heart of The Race, and it's safe *because* of the separation above.

1. **Snapshot the decision once.** Build `buildContext()` + the check-in prompt (the same one
   `runScheduledCheckin` uses, `sessions.ts:389`) and **freeze the exact bytes**. Feed identical
   input to champion and every challenger — otherwise quote drift between calls makes the
   comparison unfair.
2. **Champion vs challengers.**
   - **Champion (Opus, live):** runs exactly as today — the full toolset, trades through the
     deterministic gate. Unchanged.
   - **Challenger (Sonnet, shadow):** gets a **propose-only** toolset — `grqServer` with
     `proposeOrderTool` swapped for a `proposeShadowOrderTool` that records
     `{model, symbol, side, qty, thesis, confidence}` to a new `ShadowProposal` table **instead
     of** calling `validateAndPlace`. The shadow path must not import `validateAndPlace` /
     `placeOrder` at all.
3. **Optional dry-run gate.** Run each shadow proposal through `validator.ts` in *validate-only*
   mode to show which challengers' picks would even have **cleared the guardrails** — a brutal,
   honest filter, and free since the validator is deterministic.
4. **Score it.** The retro/scoreboard system already grades *sources* by hit-rate
   (`lib/scoreboard.ts`). Grading *models* against realized outcomes is the same idea on a new
   axis → a model leaderboard.

### Non-negotiable safety
This must obey CLAUDE.md rule #1: **never wire a path that lets model output reach the gate.**
The shadow path is write-only to its own `ShadowProposal` namespace. A challenger physically
cannot place an order — the trade tool is not in its toolset, and the gate is deterministic and
humans-only regardless. The Race never doubles real trades; Opus remains the sole live hand.

---

## The Race — the page (beside Reports)

A new top-level destination next to Reports (`web/components/NavBar.tsx:25`, `SECONDARY` nav →
add `{ href: "/race", label: "The Race" }`). What it shows, per check-in:

> **13:00 ET check-in** — *same data, two minds*
> - **Opus** (live): bought 50 XIC @ $57.01 · "rates turning, index ballast" · 78%
> - **Sonnet** (shadow): held · "wants confirmation above $57.40 first" · 62% *(would clear gate ✓)*

Plus a running scoreboard: agreement rate, who'd-have-traded-more, and — once positions resolve
— whose calls actually paid off vs XIC. Honest framing throughout: a shadow pick that never
faced slippage/fills is a hypothesis, not a track record. Money rules stay un-funny.

---

## Phased plan

### Phase 1 — Opus (live) vs Sonnet (shadow) · **SHIPPED & PROVEN (2026-06-25)**
- `RACE.challengers` (env `GRQ_RACE_CHALLENGERS`, default `claude-sonnet-4-6`) in `policy.ts`
  (Tier A — no new auth, rides the Max token alongside Opus).
- `runShadow()` + `parseProposal()` in `sessions.ts` REUSE `runSession` one-shot/no-tools and
  write a champion row + N challenger rows to `ShadowRun` (the as-built table — we kept the
  champion's read in its row rather than the original `ShadowProposal`/propose-tool design).
- The Race page renders champion vs challenger per session with a 75%-conviction badge.
- **Status:** live on all five sessions; the DB carries real champion+Sonnet pairs (9/9 by
  2026-06-25 20:17). Exit criteria met — the shadow path never touches an order or the gate.
- **Deferred to Phase 1.5:** the full `validator.ts` gate dry-run (`validateOnly`) for a real
  "would clear gate" verdict, and outcome scoring → a model leaderboard.

### Phase 2 — more models via OpenRouter (Tier C) · **SHIPPED 2026-06-25**
Phase 1 proved out against two models, so this is unblocked. The key realization that shrinks
it: **Phase 1 already made the shadow path one-shot/no-tools**, so a non-Claude challenger is a
single chat *completion* — NOT the function-calling loop Tier C originally imagined. ~40 lines of
`fetch`, no MCP, no SDK, **no schema change** (`ShadowRun.model` / `AgentUsage.model` are already
free-form strings → no `prisma db push`).

- **Dispatch by slug shape** inside `runShadow`'s challenger loop: `claude-*` → existing
  `runSession` (SDK, Max token, **free**); a slug containing `/` (e.g. `deepseek/deepseek-chat`)
  → new OpenRouter path (**metered $**). One mixed `GRQ_RACE_CHALLENGERS` list drives both.
- **`web/agent/openrouter.ts` (new):** `chatComplete({model, system, user, signal})` →
  `{text, inTokens, outTokens, costUsd}`. Global `fetch` (no new dep), `OPENROUTER_API_KEY` from
  `.env` (**unquoted** — env_file rule), `usage:{include:true}` for real per-call cost, an
  AbortController ~60s timeout so a hung provider can't stall the session.
- **Same `parseProposal()` + `ShadowRun.create`** for both paths; run challengers via
  `Promise.allSettled` (not the sequential `for`) so a 5-model fan-out doesn't add ~60–75s — and
  note it only delays the shadow *rows*, never a trade (the champion already acted).
- **Cost parity:** write an `AgentUsage` row per metered challenger under label `race:<label>`
  with the returned tokens + `costMicroUsd` (the SDK-shaped `recordUsage` gets a lean HTTP twin).
- **Guardrail:** `RACE.maxUsdPerDay` (`GRQ_RACE_MAX_USD_PER_DAY`, default **$2**) — before
  metered challengers run, sum today's `race:` cost from `AgentUsage`; over cap → skip the
  metered ones (Claude challengers still run free) + log. Missing `OPENROUTER_API_KEY` → metered
  challengers no-op silently (the configured-or-no-op pattern).
- **Page:** only `modelLabel()` needs the new friendly names; grouping/rendering is already
  model-agnostic. Nice-to-have: a per-model cost/latency line from the `race:` `AgentUsage` rows.
- **The slate (Cam, 2026-06-25) — LIVE in `.env` `GRQ_RACE_CHALLENGERS`:** `claude-sonnet-4-6`
  (free, Max) · `deepseek/deepseek-chat` · `z-ai/glm-4.6` · `openai/gpt-5.1` ·
  `google/gemini-3.1-pro-preview` — "same data, five minds." Skipped Qwen. All four metered slugs
  verified live (real completions + valid fenced JSON + cost reported). **Cap set to $3/day** in
  `.env` (code default 2) for headroom: gemini/gpt are *reasoning* models so they're the pricey
  ones; a 5-model day runs ~$1, well under $3. ⚠️ Re-verify slugs/pricing if re-tiered.
- **Gotcha hit & fixed:** OpenRouter attribution header `X-Title` must be **ASCII** — an em-dash
  in `"GRQ — The Race"` threw `Cannot convert argument to a ByteString` (HTTP headers are Latin-1).
  Now `"GRQ - The Race"`. A pre-deploy smoke test caught it.
- **Out of scope (Cam, 2026-06-25):** the `MODELS.research` split (moving the ~3.8M-token boot
  scan off the Max quota onto a metered model). Same OpenRouter plumbing would enable it, but it
  changes a path the agent *acts* on — kept separate; prove the no-risk shadow path first.
- **Cost reality:** ~7 sessions/day × 4 metered challengers × ~(15k in + 1k out) ≈ **$0.50–$2/day**;
  DeepSeek/GLM are pennies. The $2 cap is a blowup-guard, not a real constraint.
- **Deploy:** bump `AGENT_VERSION` v1.48→v1.49 (D77), rebuild `agent` (the page tweak rides the
  `web` build), no `prisma db push`. Env-only tuning afterward (`GRQ_RACE_CHALLENGERS`,
  `GRQ_RACE_MAX_USD_PER_DAY`, kill) is `--force-recreate`, no rebuild.
- **Exit criteria:** a full trading day where every session shows all five models' calls with
  receipts, metered cost lands in `AgentUsage` under `race:`, the daily cap holds, and nothing a
  challenger does touches a real order or the gate.

### Phase 3 — self-hosted open-weight · **NO-GO (Cam, 2026-06-25)**
**Killed: the hardware isn't there.** The host has no usable GPU (only Intel UHD 630 integrated;
i5-8400, ~12GB free RAM on a busy shared box), and CPU-only inference is far too slow for the big
frozen-context check-in cadence. Cam decided it's not worth buying a GPU. So self-hosting is OFF —
the open-weights stay in The Race as **OpenRouter shadow challengers** (DeepSeek · GLM · Llama),
which is the end state, not a stepping stone. If hardware ever changes, the Tier C runner could
point at a local Ollama/vLLM endpoint unchanged — but that's not planned.

---

## Schema — `ShadowRun` (as built)

```prisma
model ShadowRun {
  id           Int      @id @default(autoincrement())
  at           DateTime @default(now())
  sessionAt    DateTime // champion session start — the join key tying champion + challengers
  sessionKind  String   // "morning" | "checkin" | "midday" | "eod" | "position"
  label        String   // session label, e.g. "checkin:13:00 ET"
  reason       String
  model        String   // the model id that produced this row
  role         String   @default("challenger") // "champion" | "challenger"
  text         String   // champion's note/report body, OR challenger's reasoning + JSON
  action       String?  // challengers, decision sessions only: BUY | SELL | HOLD | NONE
  symbol       String?
  qty          Int?
  thesis       String?
  confidence   Int?     // 0–100
  agentVersion String?
  @@index([sessionAt]); @@index([sessionKind]); @@index([model])
}
```

`sessionAt` is the join key: one session → one champion row + N challenger rows. The champion's
*real* action lives in `Order`/`Trade` (its row keeps the written read); challenger rows carry
the parsed "what I'd do". Per-run **token/cost** is logged to `AgentUsage` under label `race:…`
(no duplicate token fields here), so The Race doubles as a cost-per-model comparison.

---

## What's built (Phase 1 draft — 2026-06-24)

- **`policy.ts`** — `RACE = { enabled, challengers }`. `GRQ_RACE_ENABLED=false` kills it without
  a deploy; `GRQ_RACE_CHALLENGERS` (comma-separated model ids) defaults to `claude-sonnet-4-6`.
- **`sessions.ts`** — `runShadow()` + `parseProposal()`. It **reuses `runSession`** for the
  challenger (same PERSONA, tool-less, `maxTurns: 3`) so there's no new SDK plumbing and cost
  lands in `AgentUsage`. Wired into **all five** decision/report sessions: morning plan,
  intraday check-in, position check (decision → JSON proposal) + midday brief, EOD report
  (narrative → text). Each passes the **exact frozen prompt** the champion ran; decision
  sessions append a short `SHADOW MODE` suffix asking for a fenced-JSON decision (no tools). It
  never throws into the caller and never imports a broker/order path.
- **`/race` page + nav** — side-by-side champion vs challenger per session, action + a
  **75%-conviction badge**, challenger call distribution, honest "hypothesis not track record"
  framing.
- **`ShadowRun`** added to `schema.prisma` (needs `prisma db push` on deploy).

**Deploy (tomorrow):** `cd web && npx prisma db push` → rebuild `web` + `agent` → verify a
session writes rows. Respect the CLAUDE.md disk/batch rules. Env-only tuning (challenger list,
kill) is a `--force-recreate`, no rebuild.

---

## Scoring + Overview (Phase 1.5) — SHIPPED 2026-06-25 (D79)

Phase 1/2 produced rows; this turned `/race` into a **scoreboard**. Locked design decisions (Cam):

- **Champion races on its parsed proposal**, not its executed trades — so all lanes are scored on
  identical hypothetical terms (apples-to-apples with shadows that can't reach the gate). The
  champion's *real* fund NAV stays separate. Its "call" = its strongest `TradeProposal` that
  session (`championCall()` in `sessions.ts`; the proposal's `priceCents` is the exact entry).
- **Scoring = mark-to-now**: every BUY/SELL call's price is snapshotted at call time and marked to
  the **live** price. **Per-call** (Cam's choice): each session's call is its own scored bet — a
  name re-called across check-ins counts each time (repeated conviction), NOT collapsed into a
  position. A SELL is scored **directionally** (profits when the price falls).
- **A "race" = one ET trading day.** History navigates day-by-day (Today-style).
- **Tiles show:** cumulative paper P&L (CAD) · hit rate · vs-XIC · activity + conviction.

**Substrate (additive schema):** `ShadowRun.entryPriceCents` + `entryCurrency` (price snapshot at
call time, native ccy). Champion entry = `TradeProposal.priceCents` (ask/bid); challenger entry =
`getQuote` mid, snapshotted in `writeChallengerRow`. USD calls convert to CAD for the board via
`usdCadRate`/`toCadCents` (`lib/fx.ts`); benchmark = `BENCHMARK` (XIC) closes.

**Code:** `lib/race/score.ts` (pure `scoreCall` + `benchmarkReturnBps`), `lib/race/standings.ts`
(server loader: live marks via `getQuotes`, per-model standings + per-day rollups + the day matrix),
`lib/race/models.ts` (`modelLabel` + `glossaryKeyForModel`). UI: `/race` overview (one
**`ModelTile`** per model — responsive grid, leader-first, champion flagged, **full roster shown**
incl. not-yet-raced models faded "Awaiting first session") + a **`DayCard`** list; `/race/[date]`
day detail = a **`SessionMatrix`** (per-session call matrix, one expandable cell per model — scales
to 8) + day standings + prev/today/next nav. Model labels are glossary `<Term>` chips (literacy).

**Backfill** (`scripts/backfill-shadow-entry.ts`): priced existing history. **Bug found + fixed:**
the first pass derived champion calls from proposals in a wide forward window, stamping one late
proposal onto every earlier session — fixed by bounding each session's window by the NEXT champion
session (the LIVE capture was always correct; only the backfill was wrong).

---

## Bull Races — each model runs its own paper account — SHIPPED 2026-06-25 (D80)

> Cam: *"these 8 are the 8 bulls in the bull race. Pick some or all, set each's parameters, run a
> race — it plays out over time, keeping their own P&L, executing paper trades."*

Where the always-on `/race` asks *"what would each model do with the champion's book?"* (judgment),
**Bull Races** asks *"who manages money best?"* — each model is a **bull** with its OWN virtual
paper account (cash, positions, trades, P&L) competing over time. The two **coexist** as separate
lenses (Cam): `/race` stays; Bull Races lives at **`/bulls`**.

### Non-negotiable: total isolation from the real fund
A pure sandbox. Its own tables + a small engine that **reuses the sim fill MATH** but **never**
touches the real `Account`/`Position`/`Trade`, the §6 validator, or the broker — satisfying
guardrail #1 and ensuring a bug here can't corrupt the live book (proven by
`scripts/verify-bull-fill.ts`: the real fund is byte-identical after a fill). **"Level field"
falls out for free** — every bull runs seed-only/no-tools, so Opus has no tool edge in the
sandbox; its real tooled fund is shown only as a reference line.

### Data model (all NEW tables — `web/prisma/schema.prisma`)
`Race` (name, status RUNNING|PAUSED|ENDED, cadence daily|hourly, startingStakeCents) · `RaceEntrant`
(a bull: model, **dial** CAUTIOUS|BALANCED|AGGRESSIVE, **persona**, label, cashCents) · `RacePosition`
(entrantId+symbol unique, native avgCost+currency) · `RaceTrade` · `RaceCall` (per-session decision
audit: action/symbol/qty/confidence/thesis/text/filled/rejectReason) · `RaceNavSnapshot` (the P&L
time series). Books are **CAD-denominated**; a US-name buy debits CAD at the live FX rate (positions
held native, NAV marked to CAD).

### The engine (`web/agent/race/`)
At each race session, for each RUNNING race × ACTIVE bull (`runRaceTick()` → `runBullSession`):
1. **`buildBullContext(entrant)`** (`context.ts`) — the bull's frozen prompt from ITS OWN book +
   ITS OWN dial. **Menu = the TRACKED universe** (ACTIVE+CANDIDATE = the whole researched library,
   ~81 names, 45 CA + 32 US — NOT just the 21 tradeable ACTIVE) **with GRQ's dossier call**
   (stance/confidence) per name, sorted by conviction (an input, not a rule).
2. **Run one-shot, no tools** — `runSession` (Claude, free on Max) or `chatComplete` (OpenRouter,
   metered). Parse with `parseProposal` (shared `race/shadow.ts`).
3. **`applyRaceFill`** — a **light race gate** (NOT §6): quote exists · cash sufficient · no
   shorting · position ≤ `dial.maxPositionPct` of the bull's NAV · `dial.cashFloorPct` floor ·
   `dial.maxNewTradesPerWeek`. Fill reuses `ibkrFixedCommissionCents` + the ACB formula from
   `lib/broker/sim.ts`. Writes `RaceTrade`, updates `RacePosition` + entrant cash; rejections land
   on `RaceCall.rejectReason`. The race gate deliberately does **not** enforce universe membership
   — bulls pick freely (so CAD is the *book* currency, never a CA-only rule).
4. **`snapshotBullNav`** — mark to live, append a `RaceNavSnapshot`.

**Cadence + cost:** `runRaceTick()` runs in the BACKGROUND (self-guarded, must not block the 60s
tick/heartbeat), **market-hours only**, one race per tick. Default **daily** cadence (~8 model
calls/day) keeps Max-quota + OpenRouter $ sane; metered bull spend folds into the existing
`RACE.maxUsdPerDay` cap.

### Phase A — engine + standing House Race + `/bulls` (SHIPPED)
The engine above + a seeded **House Race** (8 bulls @ BALANCED, CA$25k each;
`scripts/seed-house-race.ts`). `/bulls`: leaderboard (NAV, return %, dial badge, sparkline), a
multi-line return chart (`BullChart`), per-bull expand (holdings + recent calls; `BullRow`), and
the real Opus fund as a reference. `/race` ↔ `/bulls` cross-linked.

### Phase B — the configurable hub (SHIPPED, web-only)
`/bulls` became a hub — a **race switcher** (`?race=<id>`), the selected race's detail +
**member-only controls**, and a **new-race form**. The engine already loops over all RUNNING races,
so new races need no redeploy.
- **`NewRaceForm`** — name, cadence, per-bull stake, a free list of entrant rows (model × dial ×
  persona; add a model twice for **versions**). **`RaceControls`** — start/pause/reset/delete.
- **Routes** (member-only via `memberFromRequest`, viewer → 403): `POST /api/bulls` (create race +
  entrants) · `POST /api/bulls/[id]` `{op: start|pause|end|reset|delete}` (reset wipes
  positions/trades/calls/nav + restores each bull's cash to stake; delete cascades).
- **Lib:** `listRaces()` (leader from latest nav snapshot) + `loadBullRace(raceId?)`.

### Per-bull risk (the "tweak each bull" goal)
`RaceEntrant.dial` reuses the fund's `DIALS` (position cap, cash floor, weekly-buy cap, tiers — see
`policy.ts`), woven into both the bull's prompt and the race gate; `persona` is free-text style
("momentum, high turnover") for "aggressive in different ways." So "Cautious Gemini vs Aggressive
Grok" is measurable in their own books.

### Operational notes
- **Agent change → rebuild `agent` + bump `AGENT_VERSION`** (D77). Mind the startup-scan token guard.
- **`scripts/` is NOT in the agent image** (`.dockerignore`) — run seed/verify host-side. The host's
  `web/.env` lacks `GRQ_RACE_CHALLENGERS`, so pass the roster inline from the root `.env` or the
  seed only sees opus + the default sonnet.
- **Verify scripts:** `verify-bull-fill.ts` (fill + isolation), `verify-bull-context.ts` (the menu).

### Deferred / Phase C ideas
Mid-race roster edits (add/swap a bull without a full reset) · per-bull **USD sleeve + real FX** ·
wiring the dials' **stops/take-profits** into the race engine · the **MU.US-style bad-quote** clean
-up (a wide menu surfaces quote-layer glitches). **Tools-for-all** races (the "best agent" question)
remain explicitly out — expensive (a provider-agnostic tool loop) and a different question.

---

## Resolved / open questions

1. ✅ **Scope:** all five decision/report sessions (Cam wanted morning, intraday, midday, EOD —
   position check is a sixth, included since it's a decision session).
2. ✅ **Tools vs one-shot:** **one-shot, no tools** — guarantees "exact same SEED information"
   and reproducibility. Asymmetry noted: the champion may gather more via tools; midday/EOD are
   perfectly symmetric (both tool-less). Tools-for-challenger is a Phase-2 fairness option.
3. **Naming:** "The Race" (current). Alternatives floated: The Bake-off, Second Opinion, The Bench.
4. **Next (Phase 1.5):** the full deterministic **gate dry-run** — refactor a `validateOnly`
   path out of `validateAndPlace` so a shadow BUY gets the *real* verdict (universe, cash floor,
   fee edge, rate limits), not just the headline 75% badge. Then **outcome scoring** → a model
   leaderboard, reusing the retro/scoreboard machinery.
