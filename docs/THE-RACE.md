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

### Phase 1 — Opus (live) vs Sonnet (shadow), on check-ins · **target: tomorrow**
- `MODELS.challenger = "claude-sonnet-4-6"` in `policy.ts` (Tier A — no new auth, uses the Max
  token alongside Opus).
- New `ShadowProposal` table (schema below) + `proposeShadowOrderTool`.
- `runScheduledCheckin` (and optionally `runPositionCheck`) build the context once, run Opus
  live as today, then run a Sonnet shadow on the frozen context with the propose-only toolset.
- The Race page renders champion vs challenger per check-in. Dry-run the validator on each
  shadow proposal for the "would clear gate" badge.
- **Exit criteria:** a full trading day where every check-in shows both models' calls with
  receipts, and nothing the shadow does touches a real order or the gate.

### Phase 2 — more models, via OpenRouter (Tier C) · *after Phase 1 proves out against 2*
- Add a small provider-agnostic shadow runner (OpenRouter, one key) so a check-in can fan out
  to GPT, Gemini, GLM, etc. in parallel on the same frozen context.
- These are **metered $** — gate behind a config list of enabled challengers and a per-day cap.
- Side-benefit worth noting: moving heavy *research* (the ~3.8M-token boot scan that drains
  Cam's Max quota — see CLAUDE.md / D67) onto a metered model would stop agent dev from eating
  Cam's interactive Claude quota. That alone may justify a `MODELS.research` split early.

### Phase 3 — self-hosted open-weight · *exploration*
Cam wants to explore running open-weight models (GLM, Qwen, Gemma, DeepSeek) on **our own
hardware**. Notes:
- **Disk is not the blocker.** `/var` (the Docker root, sda5) is at **~77%** today, and Cam has
  **other drives with more space** — model weights can live off the cramped volume.
- **GPU is the real question.** Serious open-weight agentic models (GLM-4.6, Qwen-class,
  DeepSeek) want a capable GPU; CPU-only inference is too slow for an intraday check-in cadence.
  Confirm what GPU (if any) is available on the host or an adjacent box.
- **Serving:** Ollama (easiest) or vLLM (faster, better concurrency) behind an OpenAI-compatible
  endpoint → reuse the Tier C runner unchanged (point it at the local endpoint instead of
  OpenRouter).
- **Tool reliability caveat:** frontier closed models drive multi-tool loops well; smaller
  open-weight models are shakier at strict tool-call JSON. GLM-4.6 / Qwen / DeepSeek are the
  credible agentic open picks; Gemma is better as a one-shot researcher than a tool-driving
  agent. Expect to validate each model's tool-calling before trusting its proposals.

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
