# GRQ Phases — Detailed Roadmap

Plan-level summary: `PROJECT_PLAN.md` §9 + runbook §12. This file tracks the engineering
detail: what each phase actually contains, what shipped, and exact exit criteria.

| Phase | Name | Status | Needs IBKR? |
|---|---|---|---|
| 0 | Skeleton | ✅ shipped 2026-06-11 | no |
| 1 | Mock fund | ✅ shipped 2026-06-11 | no |
| 2 | Sim live-fire (the agent) | **next** | no |
| 3 | IBKR paper | blocked on account opening | **yes** |
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
