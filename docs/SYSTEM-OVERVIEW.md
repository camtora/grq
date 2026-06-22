# GRQ System Overview

Written for Graham, who wants to understand the whole thing at once. Start here. For depth,
the pointers throughout lead to the right doc.

---

## What the system is

GRQ is a $5,000 CAD swing-trading fund managed by an autonomous Claude agent, with Cam &
Graham as the humans who set the rails and read the receipts. The web app is the dashboard;
the agent is the trader. They never talk directly — they meet in the database. Real money
never trades until a soak gate passes (≥ 4 clean weeks on sim + IBKR paper). Status right
now: soaking on the sim since 2026-06-12. IBKR paper (Phase 3) is blocked on account
opening.

---

## The four services

```
┌─────────────────────────────────────────────────────────────────┐
│  grq-web  (Next.js 15, port 3012→3000)                          │
│  The dashboard Cam & Graham read. Server components only;       │
│  no internal HTTP — reads Prisma directly. Mutations through    │
│  three API routes. Proxies /api/chat → grq-chat.                │
└──────────────────────────┬──────────────────────────────────────┘
                           │ Prisma / DATABASE_URL
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  grq-db  (postgres:16-alpine)                                   │
│  The shared truth. Volume grq-db-data. Host port 5434           │
│  (loopback-only, for CLI tools). Containers use db:5432.        │
└──────────────────────────▲──────────────────────────────────────┘
                           │ Prisma (same DATABASE_URL, same db:5432)
           ┌───────────────┴──────────────────────┐
           │                                      │
┌──────────┴──────────────────┐   ┌───────────────┴─────────────────┐
│  grq-agent  (Node/TS worker) │   │  grq-chat  (Node/TS http server) │
│  The trading agent.          │   │  The members' chat window.       │
│  Entrypoint: agent/runner.ts │   │  Entrypoint: agent/chat-server.ts│
│  Tick loop, scheduled Claude │   │  Read-only: can never place an   │
│  sessions, order proposals.  │   │  order. Runs on same image as    │
│  Built from Dockerfile.agent │   │  agent (same Dockerfile.agent).  │
└─────────────────────────────┘   └──────────────────────────────────┘
```

All four services share one repo and one `docker-compose.yaml`. The agent and chat containers
are built from the same `web/Dockerfile.agent`; they differ only in their entrypoint
(`runner.ts` vs `chat-server.ts`). No bind mounts — a source change needs a rebuild, not
just a restart.

---

## Request / data flow

```
Browser
  │
  ▼
nginx (SSL, HTTP/2)
  │ auth_request →
  ├─── oauth2-proxy (Google SSO, cookie domain .camerontora.ca)
  │      ←── redirect to Google sign-in if unauthenticated
  │
  │ authenticated: sets X-Forwarded-Email: <google-account>
  ▼
host.docker.internal:3012  (grq-web)
  │
  ├── web/middleware.ts
  │     reads X-Forwarded-Email
  │     checks lib/users.ts ∪ GRQ_ALLOWED_EMAILS
  │     non-members → inline teal 403 (even if SSO-authed)
  │     /api/health → exempt
  │
  ├── server components → Prisma → grq-db (reads, no internal HTTP)
  │
  ├── /api/killswitch   ─┐
  ├── /api/settings     ─┤ → re-derive identity from X-Forwarded-Email
  ├── /api/sim/order    ─┘   → mutation via Prisma → grq-db
  │
  ├── /api/chat/** → proxied to grq-chat:3014 (SSE stream)
  │
  └── /api/stocks, /api/universe, /api/health → read from DB

grq-web reads quotes via lib/broker/quotes.ts
  → check DB cache (Quote table)
  → if stale (>15 min): fetch from Yahoo Finance via lib/broker/yahoo.ts
  → upsert DB cache, return to caller

BrokerAdapter seam (lib/broker/index.ts):
  BROKER=sim   → SimBroker (lib/broker/sim.ts)  ← current
  BROKER=ibkr-paper → IBKRBroker (Phase 3, not yet built)
  BROKER=ibkr-live  → IBKRBroker (Phase 4, not yet built)
```

**Key auth facts:**
- nginx + oauth2-proxy handle *authentication* (is this a Google account?).
- `web/middleware.ts` handles *authorization* (is this account a fund member?).
- The global SSO list has ~7 people; GRQ admits exactly 2 (Cam + Graham).
- Direct LAN hits on port 3012 carry no `X-Forwarded-Email` → 403.

---

## The agent loop

`grq-agent` runs a single long-lived orchestrator process. It is **deterministic and cheap**
between Claude sessions; LLM is only invoked at decision points.

```
┌──────────── tick() — runs every 60 s (market hours) or 5 min (closed) ────────────┐
│                                                                                    │
│  refreshQuotes()                                                                   │
│    full universe  every 10 min during hours / 60 min closed  (Yahoo → DB cache)   │
│    holdings + watchlist + XIC  every 2 min during hours      (tighter loop)       │
│                                                                                    │
│  [if market open]                                                                  │
│    sweepPendingOrders()   match resting LIMIT orders against fresh quotes          │
│    enforceStops()         deterministic stop-loss: sell at market, no LLM          │
│    checkDrawdown()        NAV ≤ −15% from HWM → engage kill switch automatically  │
│    checkDailyLossPause()  day P&L ≤ −3% → alert + block new buys today            │
│    writeNavSnapshot()     every 30 min (intraday NAV time series)                  │
│    evaluateTriggers()     per-position: if |dayChangeBps| ≥ 400 → runTriage()     │
│                             triage = Haiku, cost-free: ignore | note | escalate   │
│                             escalate (≤4/day) → runMiddayCheckIn() [Opus 4.8]     │
│                                                                                    │
│  refreshBars()            nightly after 16:30, OHLCV bars for all tracked symbols  │
│  maybeScheduledSessions() run at-most-once per day/week by DB guard               │
│  maybeWeeklyRefreshEnqueue()  Saturday 02:00 ET: queue dossiers for all universe  │
│  processResearchQueue()   one dossier at a time from ResearchRequest queue         │
└────────────────────────────────────────────────────────────────────────────────────┘

Scheduled sessions (maybeScheduledSessions):
  09:00 ET, market days   → runMorningResearch()     [Opus 4.8, withTools, 40 turns]
  16:15 ET, market days   → runEodReport()            [Opus 4.8, no tools, 4 turns]
  Saturday 09:00 ET       → runWeeklyReview()         [Opus 4.8, withTools, 30 turns]

Learning loop (D13 — first-class requirement):
  1. thesis at entry → DECISION journal (cite sources, target, stop, horizon, confidence)
  2. retro at exit  → RETRO journal (outcome vs thesis; grade each source ±1/0)
  3. grade_sources tool → SourceGrade table → getScoreboard() feeds back into context
  4. LESSON entries distilled from weekly review → injected into every session's context
  5. agentVersion stamped on every journal entry → version-over-version comparison
```

---

## The §6 guardrail gate

> **The most important structural rule in GRQ:**
> The model PROPOSES. The deterministic code DISPOSES. Model output can never bypass or
> modify the gate. Human commit is the only path to changing the limits (D11).

When the model calls `propose_order`, the call path is:

```
model → propose_order tool (tools.ts)
           │
           ▼
        validateAndPlace() — agent/validator.ts  ← THE §6 GATE
           │  [a rejection here never reaches the engine]
           │
           ▼  (passes all checks)
        SimBroker.placeOrder() — lib/broker/sim.ts  ← ENGINE GATE
           │  [engine re-checks its own layer independently]
           │
           ▼  (passes)
        fillNow() → prisma.$transaction()
                       Order FILLED + Trade + Position update + JournalEntry(TRADE)
                       → writeNavSnapshot()
```

**Validator checks** (agent/validator.ts — run before the engine):

| Check | Rule |
|---|---|
| Warm-up | No trading within 5 min of an agent restart |
| Market hours | 9:30–16:00 ET; no BUY entries in first/last 15 min |
| Thesis discipline | Every order needs a thesis string + at least one source |
| Universe membership | BUYs only: symbol must be `ACTIVE` in `UniverseMember` |
| Tier eligibility | Symbol tier must be in the current risk-dial's allowed set |
| Member directives | `BLOCKED` symbols can never be bought (sells always allowed) |
| Superficial-loss | No rebuy of a symbol within 30 days of a loss-sale (CRA rule) |
| Rate limits | ≤10 orders/day · ≤4/hour · ≤N new buys/week (dial) |
| Same-day round trip | Prohibited for any symbol on any day |
| Daily-loss pause | Day P&L ≤ −3% NAV → no new BUYs today |
| Position cap | `post-trade value ≤ maxPositionPct% of NAV` (dial) |
| Position count | Max 8 open positions total |
| Cash floor | `cash after buy ≥ cashFloorPct% of NAV` (dial) |
| Fee-aware 3× rule | `(target − entry) × qty ≥ 3 × round-trip commissions` |

**Engine checks** (lib/broker/sim.ts — run inside SimBroker):

Kill switch · quote staleness (>90 min → refuse) · integer qty > 0 · cash sufficiency
(no margin) · share sufficiency (no shorting) · monthly fee budget.

**Risk-dial table** (agent/policy.ts):

| Dial | Max position | Cash floor | Stop distance | Max buys/wk | Tiers |
|---|---|---|---|---|---|
| CAUTIOUS | 10% NAV | 30% NAV | 5% below ACB | 2 | etf, large |
| BALANCED | 15% NAV | 15% NAV | 8% below ACB | 5 | etf, large, mid |
| AGGRESSIVE | 25% NAV | 0% NAV | 12% below ACB | 10 | etf, large, mid |

**Hard limits** (agent/policy.ts — never agent-configurable):

```
(no holdings-count cap, D52)  maxOrdersPerDay: 10      maxOrdersPerHour: 4
dailyLossPauseBps: -300        drawdownKillBps: -1500   feeEdgeMultiple: 3
warmupMs: 5 min                noEntriesFirstMin: 15    noEntriesLastMin: 15
maxDecisionSessionsPerDay: 6
```

The stop-loss is **deterministic code, not an LLM decision**: `enforceStops()` in
`runner.ts` fires a market SELL directly through the engine whenever `midCents ≤ ACB × (1 −
stopPct/100)`. The model doesn't vote on it.

---

## Tool surfaces per session type

Sessions are Claude Agent SDK `query()` calls. The tool set depends on who's asking:

| Session | Model | Tools available |
|---|---|---|
| Morning research / midday check-in | Opus 4.8 | `get_portfolio`, `get_quotes`, `get_journal`, `write_journal`, `get_watchlist`, `set_watchlist`, `get_signals`, `grade_sources`, `propose_order` + WebSearch + WebFetch |
| Dossier (research-only) | Opus 4.8 | `get_quotes`, `get_journal`, `get_signals`, `write_journal` + WebSearch + WebFetch (no `propose_order`, no watchlist writes) |
| Triage | Haiku 4.5 | none — pure text reasoning, returns JSON |
| EOD report | Opus 4.8 | none — pre-computed stats piped in |
| Weekly review | Opus 4.8 | full tool set (needs `grade_sources` + `write_journal`) |
| Chat (`grq-chat`) | Opus 4.8 | `get_portfolio`, `get_quotes`, `get_journal`, `get_watchlist`, `get_signals` + WebSearch + WebFetch (read-only — no orders, no writes, ever) |

Models are set in `agent/policy.ts`; `GRQ_MODEL_DECISION` env overrides the decision tier.
Auth uses `CLAUDE_CODE_OAUTH_TOKEN` (Cam's Max subscription) — marginal cost ≈ $0 (D6).

---

## Data model (Prisma, all money = integer cents CAD)

All schema lives in `web/prisma/schema.prisma`. Why integer cents: float drift is
unacceptable in accounting; int covers ±$21M (D7).

**Fund state:**

| Model | Purpose |
|---|---|
| `Account` | Singleton (id=1): current cash balance in cents |
| `Settings` | Singleton: risk dial, monthly fee budget, kill switch (+who/when), agentVersion |
| `Contribution` | Money-in events; `xicPriceCents` anchors the vs-XIC benchmark |
| `Position` | Current open positions; `avgCostCents` is ACB-with-commission |
| `NavSnapshot` | NAV time series: cash + marked positions + benchmarkCents; written post-fill and on schedule |

**Order lifecycle:**

| Model | Purpose |
|---|---|
| `Order` | Every order ever including REJECTEDs (with `rejectReason` = which guardrail fired). Statuses: PENDING / FILLED / CANCELLED / REJECTED |
| `Trade` | Fills (one per order today); `realizedPnlCents` set on sells |

**Agent memory + audit:**

| Model | Purpose |
|---|---|
| `JournalEntry` | Everything the agent writes. Kinds: SYSTEM · RESEARCH · DECISION · TRADE · RETRO · LESSON. `sourcesJson` = attribution list; `agentVersion` stamped for measurability. Price targets (`targetNearCents`, `targetFarCents`) on dossiers power the Today page's expected-return display |
| `Report` | Structured EOD and WEEKLY reports: markdown body + statsJson. Unique (date, kind) |
| `AgentState` | Heartbeat: `bootAt`, `lastTickAt`, `lastSessionAt` — read by `/api/health` |

**Universe & research pipeline:**

| Model | Purpose |
|---|---|
| `UniverseMember` | CANDIDATE → ACTIVE (requires both members + auto screen) → RETIRED. The agent may only BUY ACTIVE symbols |
| `ResearchRequest` | Queue for on-demand and scheduled dossiers: QUEUED → RUNNING → DONE / FAILED |
| `Watchlist` | Agent's current candidates — managed by `set_watchlist` tool |
| `SymbolDirective` | PINNED (always on watchlist; agent can't remove) or BLOCKED (agent can never buy; member veto) |

**Learning loop:**

| Model | Purpose |
|---|---|
| `SourceGrade` | Retro grades per source: +1 hit, −1 miss, 0 neutral. Includes signal families (`signal:rsi`) |
| `Bar` | Daily OHLCV from Yahoo (1y backfill + nightly); feeds signals v1 |
| `Quote` | DB-cached delayed quotes, kept warm by the agent tick loop |
| `ChatMessage` | Shared chat thread between members and the agent (`role = "user" | "assistant"`) |

---

## Signals layer (2.5d, Graham's layer)

`agent/signals.ts` computes four signal families from daily `Bar` data. They are **inputs to
the agent, never autonomous deciders** (D11 stays intact).

| Family | What | Signal |
|---|---|---|
| `trend` | Price vs SMA20/50/200 stack | BUY if above SMA50 and SMA50 > SMA200; SELL if inverse; else HOLD |
| `rsi` | RSI(14) | BUY < 30 (oversold); SELL > 70 (overbought); else HOLD |
| `macd` | MACD(12,26,9) histogram direction | BUY if hist > 0 and rising; SELL if < 0 and falling |
| `volatility` | 20d realized vol, annualised | Always HOLD — regime info, not a direction vote |

`overallSignal()` aggregates the three *directional* families (trend, rsi, macd) by
confidence-weighted vote: BUY if ratio ≥ 0.25, SELL if ≤ −0.25, else HOLD. Signal families
are graded in retros like any news source — the scoreboard decides if TA earns its keep.

---

## Page / route map

| Path | What |
|---|---|
| `/` (Today) | "The Daily" newspaper: NAV, day P&L, game plan, on-the-radar cards, activity feed |
| `/portfolio` | Marked positions with weights, unrealized P&L, manual order ticket (sim only) |
| `/activity` | Full order log with fill/commission/rejection details |
| `/journal` | All journal entries with kind filter; source scoreboard at top |
| `/reports` | EOD and weekly report archive |
| `/stocks` | Universe tabs: ACTIVE table (holdings first, then watchlist, then rest) + Research (candidates, research queue, add-ticker form) |
| `/stocks/[symbol]` | Per-stock one-pager: quote, position card, trade history, all agent journal entries, signals panel, dossier, chat button |
| `/chat` | Multi-turn member ↔ agent chat (read-only tools; SSE streaming) |
| `/settings` | Risk dial, fee budget, member list, kill switch, roadmap, system info |
| `/api/health` | Open (no auth); includes agent heartbeat fields |
| `/api/killswitch` | Engage / release (POST, member only) |
| `/api/settings` | Risk dial + fee budget update (POST, member only) |
| `/api/sim/order` | Manual order placement — hits the same SimBroker gate (POST, member only) |
| `/api/chat` | SSE proxy → grq-chat:3014 |
| `/api/stocks` | Quote + universe data for stock pages |
| `/api/universe` | Universe management: add ticker, promote, demote, retire |

**Key components:**

| Component | What |
|---|---|
| `NavBar` | Active link detection + kill-switch indicator dot + theme toggle |
| `KillSwitch` | Client component; the big red button; calls `/api/killswitch` |
| `SettingsForm` | Risk dial + fee budget form |
| `OrderTicket` | Manual sim order form on /portfolio |
| `ActivityFeed` | Order/fill list, shared between Today right-rail and /activity |
| `SignalStrip` / `SignalRec` | Per-symbol signal badges + overall recommendation chip |
| `Sparkline` | NAV history SVG |
| `Scoreboard` | Source hit-rate table for /journal |
| `AskGrq` / `ChatDrawer` | Chat UI wired to the SSE stream |
| `DirectiveButtons` | Pin / Block buttons on stock pages |
| `UniverseActions` | Promote / demote / retire buttons on the Research tab |
| `Md.tsx` | Markdown renderer (react-markdown + remark-gfm, teal-themed) |
| `ui.tsx` | Design-system primitives: Card, StatCard, Chip, Pnl, etc. |

---

## A trade, end to end

This is the full path from agent decision to accounting update.

```
1. Morning session or trigger wakes a DECISION session (Opus 4.8).

2. Model calls propose_order tool with:
     symbol, side, type, qty, limitPriceCents?,
     thesis, targetCents, stopCents, horizonDays,
     invalidation, confidence, sources[]

3. tools.ts → validateAndPlace() [agent/validator.ts]
     Runs the §6 gate checks in order (see "Guardrail gate" above).
     Any failure → returns REJECTED immediately; nothing reaches the engine.

4. validator passes → SimBroker.placeOrder() [lib/broker/sim.ts]
     Engine re-checks: kill switch, quote staleness, qty integer, cash/shares,
     fee budget.
     Any failure → Order record written as REJECTED → returns PlaceOrderResult.ok=false.

5a. MARKET order (or LIMIT crossing the spread now):
     fillNow() → prisma.$transaction():
       Order → FILLED (avgFillPriceCents, commissionCents)
       Trade row (realizedPnlCents set on SELLs)
       Position upsert or delete (ACB update: buy commission rolls in; sell reduces P&L)
       Account.cashCents adjusted
       JournalEntry(TRADE) written
     → writeNavSnapshot() (post-fill NAV point in time series)
     → returns FILLED

5b. LIMIT order not yet crossing:
     Order → PENDING (resting)
     Next tick's sweepPendingOrders() checks fresh quotes → if crosses, calls fillNow()

6. validator writes JournalEntry(DECISION):
     full thesis, target, stop, horizon, invalidation, confidence, sources[], verdict text

7. propose_order tool returns verdict text to the model:
     "FILLED @ $X (commission $Y)" or "PENDING: resting limit #N" or "REJECTED: <reason>"
     Rejections feed back into the model's context so it learns the rails (no retry loops).

8. alerts.ts fires:
     fills → Discord info
     rejections → Discord warning + SYSTEM journal entry
     drawdown kill or critical events → Discord @mention + health API flag

9. At EOD (16:15 ET), runEodReport() writes a Report(kind=EOD) summarising the day.
   On exit, runWeeklyReview() writes RETRO + LESSON entries and grades sources.
   Graded sources update the scoreboard; top sources are injected into the next session.
```

---

## Failure and safety behaviour

| Event | Response |
|---|---|
| Agent process crash | `restart: unless-stopped`; on boot: journal SYSTEM "agent restarted", 5-min warm-up, requeue any orphaned RUNNING dossiers |
| Quote source down > 15 min | No new BUYs; SYSTEM journal; warning alert |
| Kill switch engaged (member or drawdown auto-trigger) | `SimBroker.placeOrder` rejects every order immediately with plain message; UI banner red dot |
| Daily-loss pause | Day P&L ≤ −3%: no new BUYs; risk-reducing SELLs still allowed |
| Hard drawdown (−15% NAV from HWM) | Orchestrator auto-engages kill switch, posts critical Discord alert; human must re-enable |
| IBKR session lost while holding positions (Phase 3+) | Critical alert; registered with infra status dashboard |

---

## What doesn't exist yet (Phases 3–4)

- `IBKRBroker` adapter (the seam exists; the implementation is Phase 3).
- IBKR paper account (Cam and Graham both applied 2026-06-12; account opening pending).
- Real-time quotes — current data is Yahoo ~15-min delayed, which is fine for swing cadence.
- Live trading — gated on ≥4 clean soak weeks, ≥2 on IBKR paper.
- Tax exports (ACB/T5008 CSV), US market + FX logic, shorting toggle — Phase 5 backlog.

---

## Deeper reading

| Doc | What's in it |
|---|---|
| `docs/AGENT-SPEC.md` | Full Phase 2 blueprint — sessions, tools, learning loop, failure modes |
| `docs/SIM-ENGINE.md` | Fill rules, commissions, ACB math, gate order |
| `docs/PHASES.md` | Phase-by-phase exit criteria and soak gate definition |
| `docs/DECISIONS.md` | Engineering decisions with rationale (D1–D16) |
| `docs/DATA-SOURCES.md` | 10-tier data taxonomy + source scoring system |
| `docs/LITERACY.md` | Financial-literacy pillar — every number explainable |
| `docs/OPERATIONS.md` | Deploy, DB, backups, troubleshooting runbook |
| `PROJECT_PLAN.md` | Guardrails §6, phases §9, decisions §10, backlog §13 |
