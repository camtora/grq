# Agent Spec — Phase 2 Blueprint

The build plan for GRQ's trading agent. Written 2026-06-11, before implementation — adjust
freely as reality bites, but record deviations in `docs/DECISIONS.md`.

## Process model

`grq-agent` container, same repo/codebase as web (one Prisma client, one engine), own
entrypoint (`agent/runner.ts`, run with tsx; small `Dockerfile.agent`). Long-running
orchestrator process; LLM sessions are spawned per decision point, never an infinite LLM loop.
Shares the compose network (db, env_file). The web UI never talks to the agent directly —
they meet in the database (orders, journal, reports, settings).

## Orchestrator (deterministic, cheap, always-on)

- **Clock:** ET via `TZ=America/Toronto`; trading calendar for TSX (and NYSE later) incl.
  holidays — implement as a static table per year + weekend rule; refuse to trade outside
  9:30–16:00 ET; restrict first/last 15 minutes (open/close noise) for new entries.
- **Schedule:** 9:00 pre-market research session · intraday check-ins every 30 min during
  market hours · 16:15 EOD report · Sunday 10:00 weekly deep review.
- **Tick loop (1–5 min during market hours):** refresh quotes for holdings + watchlist →
  sweep resting PENDING limit orders against fresh quotes (the engine gap noted in
  SIM-ENGINE.md) → write intraday NAV snapshot (throttled, e.g. every 30 min) → evaluate
  triggers.
- **Triggers that wake a session:** holding ±4% intraday · stop/target proximity ·
  watchlist entry crossed · order filled/rejected · risk dial changed · new contribution ·
  daily-loss pause threshold approached.
- **Daily jobs:** 16:05 close-out snapshot · daily-loss pause reset at next open ·
  month rollover for fee budget (derived, no job needed — query is month-bounded).

## Data: quotes & research

- `YahooQuoteSource implements QuoteSource` via `yahoo-finance2`: batch quote fetch for the
  universe; symbols map `RY → RY.TO` at the source boundary (engine keeps bare symbols).
  Cache ~60s; degrade gracefully (stale-with-timestamp, and the agent is told staleness).
  Delayed ~15 min — fine for swing decisions (D12); the sim measures decision quality.
- Universe v2: replace the 10 synthetic names with a screened TSX list (price ≥ $2, liquid
  large/mid caps + broad ETFs per risk dial); store as config, not DB.
- Research: the agent's web search tool (Agent SDK built-in) during 9:00 and weekly
  sessions; Yahoo headline endpoints as a cheap intraday news check.

## Sessions (Claude Agent SDK, on the Max token)

Auth: `CLAUDE_CODE_OAUTH_TOKEN` from `.env` (verified). Two tiers (D6 cost discipline):

| Tier | Model | Used for | Budget guidance |
|---|---|---|---|
| Triage | Haiku (`claude-haiku-4-5`) | "is this headline/trigger material?" → escalate or log-and-ignore | many/day, tiny prompts |
| Decision | Fable/best available (`claude-fable-5`) | 9:00 research, any session that may place an order, EOD/weekly reports | handful/day, cached context |

Prompt-cache the stable context block: guardrails summary, risk-dial params, positions,
open theses, lessons list. Sessions are **stateless between invocations** — continuity
lives in the journal (that's deliberate: restartable, auditable).

**Tools exposed to the model:**
`get_portfolio` · `get_quotes(symbols)` · `get_journal(filter)` · `write_journal(entry)` ·
`web_search` · `propose_order({symbol, side, qty, type, limit?, thesis, target, stop,
horizon, invalidation, confidence})` → returns the validator verdict (filled / pending /
rejected-with-reason — rejections feed back into the model's context so it learns the rails).

## Guardrail validator (wraps the engine gate; §6 of PROJECT_PLAN)

Deterministic checks **before** `SimBroker.placeOrder` (which re-checks its own layer):

- Universe membership + price/liquidity screen
- Max single position % NAV and max position count (risk dial)
- Cash floor (risk dial) after the buy
- Max new trades/week (dial) · ≤10 orders/day · ≤4/hour
- Same-day round-trip prohibition (D2)
- Daily-loss pause: realized+unrealized day P&L ≤ −3% NAV → no new buys today (sells to
  reduce risk still allowed), journal SYSTEM, banner state
- Drawdown kill: NAV ≤ −15% from high-water mark → engage kill switch (sticky, human reset)
- **Fee-aware 3× rule:** `(thesis.target − entry) × qty ≥ 3 × round-trip commissions` else reject
- Stop distance sane per dial (5/8/12%) — and once IBKR arrives, the stop *rests at the broker*

Risk-dial parameter table lives in code as config (`agent/policy.ts`), displayed on /settings.

## Learning loop (D13 — first-class)

1. **Thesis at entry** (journal `DECISION`, then `TRADE` on fill): why, expected move,
   horizon date, invalidation condition, confidence %. `propose_order` *requires* these.
2. **Retro at exit** (journal `RETRO`): outcome vs thesis; explicitly classify
   right-reasoning/wrong-outcome and wrong-reasoning/right-outcome (luck flagged as luck).
3. **Lessons** (journal `LESSON`): durable patterns distilled during weekly review;
   the latest N lessons are injected into every decision session's context.
4. **Weekly self-review** (Sunday): attribution, open-thesis grades, proposed strategy
   tweaks → humans approve at the tune-up while in soak; `agentVersion` (git describe)
   stamped on every entry so version-over-version performance is measurable.
5. Hard limits are not in scope for self-modification. Ever. (D11)

## Reports

**EOD (16:15 ET, journal + `Report(kind=EOD)`, optional Discord webhook):** day P&L ($ and
%), NAV, each trade with thesis one-liner, fees spent vs budget, **vs-XIC benchmark**
(track what the same contributions in XIC would be worth — store benchmark units at each
contribution), tomorrow's watchlist, any guardrail events. statsJson keys:
`{day_pnl, nav, fees_mtd, vs_xic_bps, trades, rejections}`.

**Weekly (Sunday):** performance attribution, lessons added, strategy proposals,
soak-week cleanliness verdict (clean / incident + why), and the **capital recommendation**
(contribute / hold / withdraw) with the honest framing (more capital amortizes overhead,
doesn't raise ROI %) — advisory only.

## Failure & safety behaviour

- Agent process crash: docker `restart: unless-stopped`; on boot, journal SYSTEM
  "agent restarted", reconcile pending orders, do NOT auto-trade for 5 minutes (warm-up).
- Quote source down > 15 min during market hours: no new buys; journal SYSTEM; health field.
- Kill switch / daily pause: checked at validator AND engine; UI banner via NavBar dot.
- `/api/health` gains `{agent: {alive, lastTick, lastSession, paused, killSwitch}}` —
  registered with the infra status dashboard in Phase 3.

## Build order (suggested)

1. Yahoo quote source + universe v2 + reseed clean $5,000 (no demo trades)
2. Agent skeleton: runner, calendar, tick loop, pending sweeper, NAV job (no LLM yet)
3. Validator + policy config + tests (the math must be boringly correct)
4. Sessions: EOD report first (read-only, easiest to judge), then 9:00 research, then
   propose_order with tiny size limits, then triggers
5. Learning loop + weekly review + Discord webhook
6. Fire drills: kill switch under agent load; quote-outage behaviour; restart warm-up

## Open questions for Cam & Graham at Phase 2 kickoff

- Intraday check-in cadence (30 min suggested) and whether the agent may trade on
  check-ins or only on triggers + morning plan
- Discord webhook for EOD reports — yes/no, which channel
- Watchlist size & whether you two can pin/veto symbols from the UI (suggest: yes, a
  "no-fly list" both can edit)
- Sim restart policy when an agent bug (not strategy) corrupts state: reseed vs repair
