# GRQ Phases — Detailed Roadmap

Plan-level summary: `PROJECT_PLAN.md` §9 + runbook §12. This file tracks the engineering
detail: what each phase actually contains, what shipped, and exact exit criteria.

| Phase | Name | Status | Needs IBKR? |
|---|---|---|---|
| 0 | Skeleton | ✅ shipped 2026-06-11 | no |
| 1 | Mock fund | ✅ shipped 2026-06-11 | no |
| 2 | Sim live-fire (the agent) | ✅ shipped 2026-06-12 — **soaking** | no |
| 2.5 | Quality-of-life builds (parallel with the soak) | ✅ shipped 2026-06-12 (a–f all live) | no |
| 3 | IBKR paper | blocked on account opening (Cam & Graham both applied 2026-06-12) | **yes** |
| 4 | Live ($5,000) | gated on soak | yes |
| 5 | Later | backlog | yes |

**The soak gate (applies before Phase 4):** ≥ 4 *clean* weeks total across sim + IBKR paper,
of which ≥ 2 on IBKR paper. A week is clean when there were zero guardrail violations, zero
unexpected orders, and zero system failures that would have mattered with real money (a dead
broker session while holding positions counts; a cosmetic UI bug doesn't). Any incident is
fixed *and* restarts/extends the clock. Returns should be at least in XIC's neighbourhood.

---

## Phase 0 — Skeleton ✅ (2026-06-11)

Shipped: Next.js 15 standalone in Docker on host port 3012 behind the infra SSO; app-level
member door (`middleware.ts`) — Cam + Graham in, the other 5 SSO users get a teal 403;
teal theme, personalized greeting, tagline; `/api/health`; compose with postgres ready.
Infra side (done earlier in `~/infrastructure`): DNS, SSL cert entry, nginx `29-grq.conf`,
port 3012 reservation, Google OAuth callback.

Verified: SSO 302 → sign-in; member 200 + correct greeting per email; stranger/headerless 403.

## Phase 1 — Mock fund ✅ (2026-06-11)

Shipped:
- **SimBroker engine** (`web/lib/broker/sim.ts`): market + limit orders, spread-aware fills,
  resting limits (PENDING), IBKR Fixed commission model, ACB-with-commission, realized P&L,
  NAV snapshots, atomic transactions. Pre-trade gate: kill switch, qty sanity, symbol check,
  cash sufficiency (no margin), share sufficiency (no shorts), monthly fee budget.
- **Schema** (9 models, int cents) + destructive seed with demo trades through the real engine.
- **Dashboard**: Overview (NAV sparkline, P&L, fee burn bar, top positions, latest journal,
  kill switch) · Portfolio (marked positions, weights, manual sim ticket) · Activity (orders
  with fills/commissions/rejection reasons) · Journal (kind filters) · Reports (empty states)
  · Settings (risk dial, fee budget, members, system, roadmap).
- **Mutation APIs**: `/api/killswitch`, `/api/settings`, `/api/sim/order` — all journal their
  actions (audit trail).

Verified: all six pages render live data; kill-switch fire drill (engage → order rejected
with reason, logged as REJECTED order → release → same order fills at $1.00 min commission).

## Phase 2 — Sim live-fire (NEXT — full blueprint in `docs/AGENT-SPEC.md`)

The agent arrives. Scope:
1. **Real delayed quotes** — `YahooQuoteSource` (yahoo-finance2) behind the existing
   `QuoteSource` interface; symbol universe becomes real screened TSX tickers (`.TO`
   mapping); sim fund reseeded to a clean $5,000.
2. **grq-agent container** — same repo, own entrypoint (tsx worker): orchestrator with
   ET market-hours calendar (TSX/NYSE holidays), scheduled sessions (9:00 research,
   intraday check-ins, 16:15 EOD report, Sunday deep review), trigger evaluation, resting
   limit-order sweeper.
3. **Guardrail validator** — full §6 matrix on top of the engine gate: position caps by risk
   dial, cash floors, universe screens, trade-rate limits, daily-loss pause, drawdown
   kill, fee-aware 3× round-trip rule, same-day round-trip prohibition.
4. **Agent sessions** — Claude Agent SDK on the Max token: Haiku triage → Fable decisions;
   tools: portfolio, quotes, journal read/write, web research, propose_order (→ validator).
5. **Learning loop** — thesis at entry, retro at exit, lessons injected into context,
   weekly self-review + proposed tweaks, `agentVersion` stamping (git-derived).
6. **Reports** — EOD (P&L, trades w/ reasoning, fees vs budget, vs-XIC benchmark, tomorrow's
   watchlist) + Sunday weekly (attribution, lessons, strategy proposals, capital
   recommendation). Optional Discord webhook.
7. **Ops** — kill-switch fire drill under agent load; daily NAV snapshot job; alerting on
   agent failure (journal SYSTEM + health endpoint field).

Exit: sim trading daily on its own; a week of reports worth reading; kill-switch drill passed
under the agent; weekly tune-up cadence established with Cam & Graham. Sim clock starts
counting toward the soak.

## Phase 2.5 — Quality-of-life builds (planned 2026-06-12, run alongside the soak)

None of these touch the order path, so they're safe to ship while the soak clock runs.
Recommended order: **a → b(+e) → f-V1 → d → c** — stocks pages (f) come before signals (d)
and chat (c) because both light them up further once they land.

### 2.5a — Nightly database backup (ops, first — it's a real gap)
The fund's entire memory (journal, trades, NAV history, soak evidence) lives in one Docker
volume. Build: `scripts/backup-db.sh` — `docker exec grq-db pg_dump | gzip` to
`~/grq-backups/grq-YYYY-MM-DD.sql.gz`, plus a chmod-600 copy of `.env` (it's not in git by
design); 14-day retention; cron `/etc/cron.d/grq-backup` at 4:30 AM (before the 5 AM docker
prune); log to `/var/log/grq-backup.log`; **on failure, ping the Discord webhook**. Restore
procedure documented in OPERATIONS.md and tested once against a scratch database. Offsite
copies = future item.

### 2.5b — Light & dark mode, per-member defaults
The household split: **Graham wants dark, Cam wants light** — and the app knows who's signed
in, so the theme *defaults by member* (`lib/users.ts` gains a `theme` field: Cam → light,
Graham → dark) with a NavBar toggle whose override persists in a cookie. Implementation:
refactor `globals.css` to semantic tokens (bg, surface, border, three text tones, accent)
with a `[data-theme="light"]` override block; `<html data-theme>` set server-side from
cookie-else-member-default (no flash); sweep components off hardcoded `teal-x/alpha` +
`#060d0c` classes onto tokens. Light mode is a real design pass (warm white, teal-700
accents) — not inverted colors. Non-negotiables in both themes: kill-switch red reads as
red; P&L green/red contrast passes squint-test.

### 2.5c — Agent chat (the big one)
Multi-turn chat at `/chat` for Cam & Graham: discuss stocks, ask financial questions,
interrogate decisions ("defend the ENB hold"). Architecture: a small **chat server in the
agent image** (`agent/chat-server.ts`, second container from `Dockerfile.agent`, internal
port — the SDK and Max token already live there; web is alpine and SDK wants glibc); web
proxies `/api/chat` with SSE streaming. History in a `ChatMessage` table (at, email, role,
content), last N turns fed to each session alongside the fund context block.
**Hard rule (already in the backlog): chat gets read-only tools** — portfolio, quotes,
journal, watchlist, web search. No `propose_order`, no `write_journal`. A persuasive chat
can never become a trading backdoor; if chat surfaces a good idea, a human says it to the
agent's morning plan via the tune-up, or we add a "suggest to agent" handoff later.
Note: chat shares the Max rate windows with trading sessions — trading has priority;
chat may get a "the trader is mid-session, give it a minute" response.

### 2.5d — Tier-1 history + signals v1 (Graham's layer begins)
Daily OHLCV bars from the same crumb-free Yahoo chart endpoint (it already returns series):
`Bar` table (symbol, date, OHLC cents, volume), 1-year backfill + nightly after-close upsert
job in the orchestrator. Then `agent/signals.ts` v1: SMA 20/50/200 + crossover state,
RSI(14), MACD(12/26/9), 20-day realized vol → per family `{signal: BUY|SELL|HOLD,
confidence, rationale}` via a new `get_signals` tool, injected into morning context for
holdings + watchlist. Signal families enter `sources[]` **on probation** like any source —
retros grade them, the scoreboard decides if TA earns a seat. Signals advise → agent
decides → gate disposes (D11 intact).

### 2.5e — Wealth-aware greetings (dessert, ships with 2.5b's UI pass)
`lib/greetings.ts`: deterministic pick (seeded by date+member, so it doesn't change on
refresh) from banded pools on total P&L %: ≥+5% escalating flattery ("Welcome back, oh
prosperous one."), +1–5% cheerful, ±1% deadpan neutral, −1–5% gentle ("We don't talk about
Tuesday."), ≤−5% condolences + a pointed reminder of what XIC did. Loss jokes punch at the
robot, never at the member.

### 2.5f — Stocks pages: per-symbol one-pagers (Cam, 2026-06-12)

The per-stock home that ties the universe, the agent's intelligence, the tiered sources,
and (eventually) signals + chat together. Ships in levels:

**V1 (with what exists today):**
- `/stocks` — the universe table, **holdings first** (qty, ACB, market value, unrealized
  P&L), then watchlist, then the rest; columns: symbol, name, tier, last, day %, journal
  count. This also answers "what can the manual ticket trade" by being the same list.
- `/stocks/[symbol]` — the one-pager: header (name, tier, live quote, day change), the
  position card if held, full trade history for the symbol, and **everything the agent has
  written about it** — DECISIONs with theses, TRADEs, RETROs, RESEARCH mentions —
  chronological, with sources shown per entry. "What does the agent currently think" =
  the latest decision/research excerpt pinned up top.

**V2 (lights up when 2.5d lands):** price sparkline from the `Bar` table, the signals panel
(SMA/RSI/MACD/vol with BUY/SELL/HOLD + confidence each), and the symbol's slice of the
source scoreboard (which sources/signals have been right *about this stock*).

**V3 (lights up when 2.5c lands):** an **"Ask GRQ about this stock"** button — opens the
chat pre-seeded with a symbol context block (position, open thesis, signals, recent journal
entries), so questions like "why are we still holding this?" land fully informed.

**Tiered-sources tie-in (DATA-SOURCES.md):** the one-pager is deliberately structured as
tier slots that light up as tiers get built — Tier 1 (price/signals), Tier 6 (earnings
dates + post-call summaries), Tier 7 (news mentions from research sessions), Tier 4
(insider activity via SEDI) — so each new data tier has an obvious UI home the day it ships.

## Phase 2.6 — Learning-loop hardening ✅ (shipped 2026-06-12)

Three zero-dependency builds that make the soak itself smarter. All live; verified same
night (directives end-to-end, scoreboard aggregation math, context blocks).

### 2.6a — Source scoreboard (the DATA-SOURCES scoring system, structurally)

- **`SourceGrade` model**: `{ id, at, source, symbol?, journalId (the retro that issued it),
  grade (-1|0|+1), note? }`. Sources normalized lowercase; signal families canonical as
  `signal:rsi` etc.
- **New agent tool `grade_sources`** — called during retros/weekly review: writes grades
  atomically, linked to the RETRO entry. Retro + weekly prompts updated to *require* grading
  every source the resolved thesis cited.
- **`getScoreboard()`** (shared lib): per source — grades n, hits, misses, hit-rate
  (min 3 grades to rank), last-graded. 
- **Feedback loop**: `buildContext` gains a scoreboard block — top 5 trusted, bottom 3
  "downweight these" — so grading yesterday changes behaviour today. Weekly review gets the
  full table and proposes source adds/drops from evidence.
- **UI**: scoreboard card at the top of /journal (the learning loop's home) + the
  per-symbol slice on stock pages (closes the pending 2.5f item).

### 2.6b — Superficial-loss guard (§6 promise, kept)

- **Rule enforced**: after selling a symbol at a realized loss, the agent may not rebuy it
  for **30 days** — validator rejects the BUY with the CRA explanation. (v1 enforces the
  rebuy-after-loss leg — the one a swing bot actually trips; the acquired-30-days-before leg
  is documented as out of scope until real money.)
- Loss-realizing SELL verdicts append the warning: "superficial-loss window opens — no
  rebuy of X until <date>". `buildContext` lists open windows so the agent plans around
  them instead of discovering rejections.
- Binds the agent path; members' manual sim orders are exempt (it's their money and their
  tax form — but the ticket shows the warning).

### 2.6c — Member directives: pin & no-fly list

- **`SymbolDirective` model**: `{ symbol, directive: PINNED | BLOCKED, by, note?, at }`.
- **BLOCKED** = the agent may never BUY it (sells allowed — exits must never be trapped).
  Validator-enforced with the member's note in the rejection. Binds the agent only;
  members can still trade it manually.
- **PINNED** = always on the watchlist; the agent's `set_watchlist` cannot remove it.
- **UI**: Pin / Block buttons on each stock page header; 📌/🚫 markers on /stocks; every
  directive change is journaled (SYSTEM) and Discord-alerted — you two see each other's
  steering.
- **Context**: directives block in every session ("BLOCKED: SHOP — Cam: 'too spicy'").

## Phase 3 — IBKR paper (needs the account)

Human prerequisites (Cam, in Client Portal once approved): enable paper account · create
secondary username for the API · paper credentials into `.env` · generate Flex token.
Build: IBeam container (gateway lifecycle, health-checked) · `IBKRBroker` adapter
(same seam: auth/session, contract lookup `.TO`, order placement incl. native stop-loss
resting at IBKR, positions/cash reconciliation) · Flex importer (trades/cash/NAV history →
our schema; reconciliation report when sim-side accounting drifts from broker truth) ·
flip `BROKER=ibkr-paper` · register in infra status dashboard / health-api.
Exit: ≥ 2 clean weeks plumbing-wise (sessions stay up or recover with alerts; fills
reconcile; stops verified resting broker-side).

## Phase 4 — Live ($5,000)

Ceremony, not code: review the full soak report together → link bank EFT, deposit $5,000,
subscribe TSX L1 real-time (~CAD 16.50/mo) → flip `BROKER=ibkr-live` → **Cautious dial for
week 1** → alerts verified end-to-end. The deposit flow stays in IBKR's portal; the app
deep-links to it. First live week reviewed daily.

## Phase 5 — Later (unordered)

US market + FX logic (IdealPro minimums make small conversions pricey — batch them) ·
shorting toggle decision · scheduled contributions display · tax exports (ACB/T5008-friendly
CSV, superficial-loss flags) · richer reports/charts · wealth-aware greetings (backlog §13)
· sim-as-shadow-sandbox A/B harness for agent versions · maybe voice ("GRQ, how are we doing?").
